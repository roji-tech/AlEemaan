import type { Problem } from "./types";
import { EMAIL_TAKEN, UNPLACED_EMAIL_TAKEN } from "@/lib/academics/staff";
import { usesDepartments } from "@/lib/academics/departments-setting";
import { staffEntity, type StaffRow } from "./staff";
import type { ServerKind } from "./server";

// The server half of the staff kind (task 0084): the one thing only the database knows (a live record in the branch already uses the email) and the save.

/// `asDraft` (task 0101 D1): save every row as a draft; the rows' own rules still apply, the completeness rules do not.
export type StaffBulkCtx = { branchId: string; asDraft?: boolean };

export const staffKind: ServerKind<StaffRow, StaffBulkCtx> = {
  entity: staffEntity,
  auditAction: "STAFF_BULK_IMPORTED",
  auditDetail: (ctx) => ({ branchId: ctx.branchId, asDraft: ctx.asDraft === true }),
  async check(db, rows, ctx) {
    const found = new Map<number, Problem[]>();
    // Task 0101 D7: a department is matched by name (any capitals) to a live department of the branch. While the branch does not use departments the column is ignored (see `notes`).
    if (rows.some((r) => r.row.department) && (await usesDepartments(ctx.branchId))) {
      const live = await db.department.findMany({ where: { branchId: ctx.branchId, archivedAt: null }, select: { name: true } });
      const names = new Set(live.map((d) => d.name.toLowerCase()));
      for (const r of rows)
        if (r.row.department && !names.has(r.row.department.toLowerCase()))
          found.set(r.line, [{ column: "department", message: `This branch has no department called "${r.row.department}".` }]);
    }
    const emails = rows.flatMap((r) => (r.row.email ? [r.row.email] : []));
    if (emails.length === 0) return found;
    // A live record's email is unique per branch, case-insensitively (the partial index StaffRecord_email_live): archived records do not count.
    const taken = await db.staffRecord.findMany({
      where: { branchId: ctx.branchId, archivedAt: null, email: { in: emails, mode: "insensitive" } },
      select: { email: true },
    });
    const used = new Set(taken.map((t) => t.email?.toLowerCase()));
    for (const r of rows)
      if (r.row.email && used.has(r.row.email.toLowerCase()))
        found.set(r.line, [...(found.get(r.line) ?? []), { column: "email", message: EMAIL_TAKEN }]);
    return found;
  },
  async notes(_db, rows, ctx) {
    const withDepartment = rows.filter((r) => r.row.department);
    if (withDepartment.length === 0) return new Map();
    if (!(await usesDepartments(ctx.branchId)))
      return new Map(withDepartment.map((r) => [r.line, "The department is ignored: this branch does not use departments."]));
    // A draft is not put in a department (task 0101 D1: drafts are left out of everything that acts on staff): it joins one from the department's own screen once it is completed.
    return ctx.asDraft
      ? new Map(withDepartment.map((r) => [r.line, "Saved as a draft: it is not put in a department until it is completed."]))
      : new Map();
  },
  async save(tx, rows, ctx, actorUserId) {
    const departments = (await usesDepartments(ctx.branchId))
      ? new Map(
          (await tx.department.findMany({ where: { branchId: ctx.branchId, archivedAt: null }, select: { id: true, name: true } })).map(
            (d) => [d.name.toLowerCase(), d.id],
          ),
        )
      : new Map<string, string>();
    for (const { row } of rows) {
      const created = await tx.staffRecord.create({
        data: {
          branchId: ctx.branchId,
          category: row.category,
          firstName: row.firstName,
          lastName: row.lastName,
          phone: row.phone ?? null,
          email: row.email ?? null,
          title: row.title ?? null,
          gender: row.gender ?? null,
          designation: row.designation ?? null,
          qualification: row.qualification ?? null,
          corpsMember: row.corpsMember ?? false,
          isDraft: ctx.asDraft === true,
        },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: "STAFF_CREATED",
          targetType: "StaffRecord",
          targetId: created.id,
          afterValue: { category: row.category, branchId: ctx.branchId, ...(ctx.asDraft ? { isDraft: true } : {}) },
        },
      });
      // A department (task 0101 D7): the person joins it as a member, never as its head.
      const departmentId = row.department && !ctx.asDraft ? departments.get(row.department.toLowerCase()) : undefined;
      if (departmentId) {
        await tx.departmentMember.create({ data: { branchId: ctx.branchId, departmentId, staffRecordId: created.id, isHead: false } });
        await tx.auditLog.create({
          data: {
            actorUserId,
            action: "DEPARTMENT_MEMBER_ADDED",
            targetType: "Department",
            targetId: departmentId,
            afterValue: { staffRecordId: created.id, viaBulk: true },
          },
        });
      }
    }
  },
};

/// Staff with no branch yet, in bulk (task 0126, the follow-up of task 0101 D3): a superadmin's file. The same columns as the branch file (the department column is not offered: there is no
/// branch to hold departments), every record saved with no branch, none creating a sign-in. The one thing only the database knows: a live unplaced record already uses the address.
export type UnplacedStaffCtx = { asDraft?: boolean };

export const unplacedStaffKind: ServerKind<StaffRow, UnplacedStaffCtx> = {
  entity: staffEntity,
  auditAction: "STAFF_UNPLACED_BULK_IMPORTED",
  auditDetail: (ctx) => ({ branchId: null, asDraft: ctx.asDraft === true }),
  async check(db, rows) {
    const found = new Map<number, Problem[]>();
    const emails = rows.flatMap((r) => (r.row.email ? [r.row.email] : []));
    if (emails.length === 0) return found;
    // The partial index StaffRecord_email_unplaced: unique among live unplaced records, case-insensitively.
    const taken = await db.staffRecord.findMany({
      where: { branchId: null, archivedAt: null, email: { in: emails, mode: "insensitive" } },
      select: { email: true },
    });
    const used = new Set(taken.map((t) => t.email?.toLowerCase()));
    for (const r of rows)
      if (r.row.email && used.has(r.row.email.toLowerCase())) found.set(r.line, [{ column: "email", message: UNPLACED_EMAIL_TAKEN }]);
    return found;
  },
  async save(tx, rows, ctx, actorUserId) {
    for (const { row } of rows) {
      const created = await tx.staffRecord.create({
        data: {
          branchId: null,
          category: row.category,
          firstName: row.firstName,
          lastName: row.lastName,
          phone: row.phone ?? null,
          email: row.email ?? null,
          title: row.title ?? null,
          gender: row.gender ?? null,
          designation: row.designation ?? null,
          qualification: row.qualification ?? null,
          corpsMember: row.corpsMember ?? false,
          isDraft: ctx.asDraft === true,
        },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: "STAFF_CREATED",
          targetType: "StaffRecord",
          targetId: created.id,
          afterValue: { category: row.category, branchId: null, ...(ctx.asDraft ? { isDraft: true } : {}) },
        },
      });
    }
  },
};
