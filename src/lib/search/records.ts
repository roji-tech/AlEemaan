import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { adminScope, branchIdsFor } from "@/lib/auth/branch-access";

// Records in the top-bar search (task 0113, task 0107 D8): pupils, staff, classes, subjects, invoices and (for a superadmin) people with an account, found by name, admission number, code,
// e-mail or invoice number. The security rules, each enforced HERE (the screen only draws what comes back):
//   - only from the branches the viewer may read: their staff branches (`branchIdsFor`: every branch for a superadmin); invoices only from the branches they administer (as the invoice list);
//     people with an account only for a superadmin (an administrator's view of members is narrower and stays on the Users page);
//   - no more than PER_KIND of each kind, current records only (an archived record is found from its own list's Archived filter);
//   - nothing about a record beyond what its own list already shows to this viewer: a name, the one line that tells two namesakes apart, the branch, and the address of its list;
//   - the route around this is rate limited per person and is staff only.

export const PER_KIND = 5;
export const QUERY_MIN = 2;
export const QUERY_MAX = 64;
const WORDS_MAX = 4;

export type RecordKind = "pupil" | "staff" | "class" | "subject" | "invoice" | "user";
export type RecordHit = { kind: RecordKind; id: string; title: string; line: string; href: string };

/// The words of a query: at most four, each at least one character, control characters gone.
export function queryWords(q: string): string[] {
  return q
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, WORDS_MAX);
}

const like = (word: string) => ({ contains: word, mode: Prisma.QueryMode.insensitive });
/// Every word must be found in one of the fields (a full name typed as "Amina Yusuf" finds first name Amina AND last name Yusuf).
const everyWord = <W>(words: string[], fields: (word: string) => W[]) => words.map((w) => ({ OR: fields(w) }));
const href = (path: string, params: Record<string, string>) => `${path}?${new URLSearchParams(params).toString()}`;
const CATEGORY: Record<string, string> = { TEACHING: "Teaching staff", NON_TEACHING: "Non-teaching staff" };

export async function searchRecords(userId: string, q: string): Promise<RecordHit[]> {
  const words = queryWords(q);
  if (words.join(" ").length < QUERY_MIN) return [];
  const [visible, scope] = await Promise.all([branchIdsFor(userId), adminScope(userId)]);
  if (visible !== "all" && visible.length === 0) return [];
  const inBranches = visible === "all" ? {} : { branchId: { in: visible } };
  const administered = scope.superAdmin ? {} : { branchId: { in: scope.branchIds } };
  const mayInvoices = scope.superAdmin || scope.branchIds.length > 0;

  const [pupils, staff, classes, subjects, invoices, users] = await Promise.all([
    prisma.studentRecord.findMany({
      where: {
        ...inBranches,
        archivedAt: null,
        AND: everyWord(words, (w) => [{ firstName: like(w) }, { lastName: like(w) }, { middleName: like(w) }, { admissionNo: like(w) }]),
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
      take: PER_KIND,
      select: {
        id: true,
        branchId: true,
        firstName: true,
        lastName: true,
        admissionNo: true,
        branch: { select: { name: true } },
        enrollments: { orderBy: { enrolledAt: "desc" }, take: 1, select: { className: true, arm: true } },
      },
    }),
    prisma.staffRecord.findMany({
      where: { ...inBranches, archivedAt: null, AND: everyWord(words, (w) => [{ firstName: like(w) }, { lastName: like(w) }, { email: like(w) }]) },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
      take: PER_KIND,
      select: { id: true, branchId: true, firstName: true, lastName: true, title: true, category: true, branch: { select: { name: true } } },
    }),
    prisma.classGroup.findMany({
      where: { ...inBranches, archivedAt: null, AND: everyWord(words, (w) => [{ name: like(w) }]) },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      take: PER_KIND,
      select: { id: true, branchId: true, name: true, branch: { select: { name: true } } },
    }),
    prisma.subject.findMany({
      where: { ...inBranches, archivedAt: null, AND: everyWord(words, (w) => [{ name: like(w) }, { code: like(w) }]) },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: PER_KIND,
      select: { id: true, branchId: true, name: true, code: true, branch: { select: { name: true } } },
    }),
    mayInvoices
      ? prisma.invoice.findMany({
          where: { ...administered, AND: everyWord(words, (w) => [{ invoiceNo: like(w) }]) },
          orderBy: [{ invoiceNo: "desc" }],
          take: PER_KIND,
          select: {
            id: true,
            branchId: true,
            invoiceNo: true,
            status: true,
            branch: { select: { name: true } },
            student: { select: { firstName: true, lastName: true } },
          },
        })
      : Promise.resolve([]),
    scope.superAdmin
      ? prisma.user.findMany({
          where: { AND: everyWord(words, (w) => [{ name: like(w) }, { email: like(w) }]) },
          orderBy: [{ name: "asc" }, { id: "asc" }],
          take: PER_KIND,
          select: { id: true, name: true, email: true },
        })
      : Promise.resolve([]),
  ]);

  return [
    ...pupils.map((p) => {
      const e = p.enrollments[0];
      const cls = e ? `${e.className}${e.arm ? ` ${e.arm}` : ""}` : "No class yet";
      return {
        kind: "pupil" as const,
        id: p.id,
        title: `${p.firstName} ${p.lastName}`,
        line: `${p.admissionNo} · ${cls} · ${p.branch.name}`,
        href: href("/students", { branch: p.branchId, q: p.admissionNo }),
      };
    }),
    ...staff.map((s) => ({
      kind: "staff" as const,
      id: s.id,
      title: `${s.title ? `${s.title} ` : ""}${s.firstName} ${s.lastName}`,
      line: `${CATEGORY[s.category] ?? "Staff"} · ${s.branch.name}`,
      href: href("/academics", { tab: "staff", branch: s.branchId, q: `${s.firstName} ${s.lastName}` }),
    })),
    ...classes.map((c) => ({
      kind: "class" as const,
      id: c.id,
      title: c.name,
      line: `Class · ${c.branch.name}`,
      href: href("/academics", { tab: "classes", branch: c.branchId, q: c.name }),
    })),
    ...subjects.map((s) => ({
      kind: "subject" as const,
      id: s.id,
      title: s.code ? `${s.name} (${s.code})` : s.name,
      line: `Subject · ${s.branch.name}`,
      href: href("/academics", { tab: "subjects", branch: s.branchId, q: s.name }),
    })),
    ...invoices.map((i) => ({
      kind: "invoice" as const,
      id: i.id,
      title: i.invoiceNo,
      line: `${i.student.firstName} ${i.student.lastName} · ${i.status.charAt(0)}${i.status.slice(1).toLowerCase().replace(/_/g, " ")} · ${i.branch.name}`,
      href: href("/finance", { tab: "invoices", branch: i.branchId, q: i.invoiceNo }),
    })),
    ...users.map((u) => ({
      kind: "user" as const,
      id: u.id,
      title: u.name ?? u.email ?? "A user",
      line: u.name && u.email ? `Account · ${u.email}` : "Account",
      href: href("/users", { q: u.email ?? u.name ?? "" }),
    })),
  ];
}
