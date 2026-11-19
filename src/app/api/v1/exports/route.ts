import { z } from "zod";
import { Role, StaffCategory } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, fail, noStore } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { refundAttempt, reserveAttempt } from "@/lib/auth/rate-limit";
import { audit } from "@/lib/academics/structure";
import { studentListWhere } from "@/lib/students/service";
import { readListFilters } from "@/lib/students/list-filters-server";
import { schoolDay } from "@/lib/students/list-filters";
import { resolveSchoolTimeZone } from "@/lib/question-bank/school-day";
import {
  EXPORT_LIMIT,
  EXPORT_MAX_ROWS,
  exportFileStem,
  exportRequestSchema,
  exportTable,
  exportValues,
  type ExportRequest,
} from "@/lib/bulk/list-export";

// POST /api/v1/exports { kind, branchId, scope, includeArchived?, pupils?, ids? }   one list of one branch as the import template's columns (task 0103 D3, D4).
// Personal data in bulk leaving the system, so:
//   - only an administrator of THAT branch or a superadmin (a teacher may read the lists, not export them); a branch named in the body that is not theirs is a 403;
//   - the rows are chosen here, by the same rules as the list (`studentListWhere` for pupils), never sent by the browser;
//   - every export is audited as EXPORT_CREATED (who, which list, which branch, the filters, how many rows; never the data);
//   - at most EXPORT_LIMIT exports per person per 5 minutes, and EXPORT_MAX_ROWS rows, said plainly beyond that;
//   - the answer is never stored by a cache. The browser writes the file with the template writers, which neutralise formula cells.
type Body = Parsed<ExportRequest, undefined>;

const TOO_MANY = `More than ${EXPORT_MAX_ROWS.toLocaleString("en")} rows: narrow the list with its filters and export it in parts.`;

async function pupilRows(body: ExportRequest): Promise<{ values: Record<string, string>[] } | { response: ReturnType<typeof fail> }> {
  let status: "live" | "archived" | "all" = body.includeArchived ? "all" : "live";
  let standing: "suspended" | "expelled" | undefined;
  let q: string | undefined;
  let filters = {};
  if (body.scope === "shown") {
    const show = body.pupils?.show ?? "live";
    status = show === "archived" ? "archived" : "live";
    standing = show === "suspended" || show === "expelled" ? show : undefined;
    q = body.pupils?.q;
    const read = await readListFilters(new URLSearchParams(body.pupils?.query ?? ""), body.branchId);
    if (!read.ok) return { response: read.response };
    filters = read.filters;
  }
  const { where } = await studentListWhere({ visible: "all", branchId: body.branchId, status, standing, q, filters });
  const total = await prisma.studentRecord.count({ where });
  if (total > EXPORT_MAX_ROWS) return { response: fail(TOO_MANY, 413, "TOO_MANY_ROWS") };
  const rows = await prisma.studentRecord.findMany({
    where,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
    select: {
      firstName: true,
      middleName: true,
      lastName: true,
      gender: true,
      dateOfBirth: true,
      admissionNo: true,
      guardianName: true,
      guardianPhone: true,
      guardianEmail: true,
      enrollments: {
        orderBy: { enrolledAt: "desc" },
        take: 1,
        select: { className: true, arm: true, classArm: { select: { name: true, classGroup: { select: { name: true } } } } },
      },
    },
  });
  return {
    values: rows.map((r) => {
      const e = r.enrollments[0];
      return exportValues.pupils({
        ...r,
        className: e ? (e.classArm?.classGroup.name ?? e.className) : null,
        arm: e ? (e.classArm?.name ?? e.arm) : null,
      });
    }),
  };
}

async function staffRows(body: ExportRequest) {
  const rows = await prisma.staffRecord.findMany({
    where: {
      branchId: body.branchId,
      ...(body.scope === "shown" ? { id: { in: body.ids ?? [] } } : body.includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
    take: EXPORT_MAX_ROWS + 1,
    select: {
      category: true,
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
      title: true,
      gender: true,
      designation: true,
      qualification: true,
      corpsMember: true,
    },
  });
  return rows.map((r) => exportValues.staff({ ...r, category: r.category as StaffCategory }));
}

async function classRows(body: ExportRequest) {
  const rows = await prisma.classGroup.findMany({
    where: {
      branchId: body.branchId,
      ...(body.scope === "shown" ? { id: { in: body.ids ?? [] } } : body.includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    take: EXPORT_MAX_ROWS + 1,
    select: {
      name: true,
      arms: { where: { archivedAt: null }, orderBy: { name: "asc" }, select: { name: true } },
      offerings: { where: { subject: { archivedAt: null } }, orderBy: { subject: { name: "asc" } }, select: { subject: { select: { name: true } } } },
    },
  });
  return rows.map((r) => exportValues.classes({ name: r.name, arms: r.arms.map((a) => a.name), subjects: r.offerings.map((o) => o.subject.name) }));
}

async function subjectRows(body: ExportRequest) {
  const rows = await prisma.subject.findMany({
    where: {
      branchId: body.branchId,
      ...(body.scope === "shown" ? { id: { in: body.ids ?? [] } } : body.includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: EXPORT_MAX_ROWS + 1,
    select: { name: true, code: true },
  });
  return rows.map((r) => exportValues.subjects(r));
}

export const POST = withAuth(
  validate(
    { body: exportRequestSchema },
    withBranch<Body, AuthContext, unknown>({ of: ({ body }) => body.branchId, as: "administer", where: "body" }, async (_req, auth, _ctx, { body }) => {
      // Counted before any work, so a burst cannot run several exports past the limit.
      const limitKey = `export:user:${auth.userId}`;
      if (!(await reserveAttempt(limitKey, EXPORT_LIMIT))) {
        return noStore(fail("You have made several exports in the last few minutes. Please wait a few minutes and try again.", 429, "RATE_LIMITED"));
      }
      try {
        let values: Record<string, string>[];
        if (body.kind === "pupils") {
          const picked = await pupilRows(body);
          if ("response" in picked) {
            await refundAttempt(limitKey);
            return noStore(picked.response);
          }
          values = picked.values;
        } else {
          values = body.kind === "staff" ? await staffRows(body) : body.kind === "classes" ? await classRows(body) : await subjectRows(body);
          if (values.length > EXPORT_MAX_ROWS) {
            await refundAttempt(limitKey);
            return noStore(fail(TOO_MANY, 413, "TOO_MANY_ROWS"));
          }
        }
        const branch = await prisma.branch.findUnique({ where: { id: body.branchId }, select: { name: true } });
        const { headers, rows } = exportTable(body.kind, values);
        // What was exported, never the data: the list, the choice, the filters (a search is noted as used, not its words) and how many rows.
        await audit(auth.userId, "EXPORT_CREATED", "Branch", body.branchId, {
          kind: body.kind,
          scope: body.scope,
          includeArchived: body.scope === "all" ? Boolean(body.includeArchived) : null,
          filters:
            body.kind === "pupils" && body.scope === "shown"
              ? { show: body.pupils?.show ?? "live", search: Boolean(body.pupils?.q?.trim()), query: body.pupils?.query ?? "" }
              : body.scope === "shown"
                ? { ids: body.ids?.length ?? 0 }
                : null,
          rows: rows.length,
        });
        const stem = exportFileStem(body.kind, branch?.name ?? "branch", schoolDay(new Date(), resolveSchoolTimeZone()), body.scope);
        return noStore(ok({ fileStem: stem, headers, rows, count: rows.length }));
      } catch (error) {
        await refundAttempt(limitKey);
        console.error("[EXPORT_ERROR]", error);
        return noStore(fail("The export could not be made. Please try again.", 500, "INTERNAL"));
      }
    }),
  ),
  { roles: [Role.ADMIN] },
);

export type ExportBody = z.infer<typeof exportRequestSchema>;
