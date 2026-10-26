import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requirePageSession } from "@/lib/auth/page-session";
import { adminScope, branchIdsFor, mayAdminister } from "@/lib/auth/branch-access";
import { loadViewer } from "@/lib/question-bank/viewer";
import { PageHeader } from "@/components/shell/PageHeader";
import { QuestionBankSections } from "@/components/question-bank/QuestionBankSections";

export const metadata: Metadata = { title: "Question bank" };
export const dynamic = "force-dynamic";

const STAFF = new Set(["ADMIN", "TEACHING_STAFF", "NON_TEACHING_STAFF"]);

// The question bank (Task 0032): staff write, browse and review questions; administrators also choose the reviewers and the switches (a superadmin sets them for every
// branch, a branch administrator may only make them stricter for theirs). Display only: the APIs behind it decide who may do what.
export default async function QuestionBankPage() {
  const { session, memberships, isAdmin, isSuperAdmin } = await requirePageSession();
  if (!isSuperAdmin && !memberships.some((m) => STAFF.has(m.role))) {
    return (
      <div>
        <PageHeader title="Question bank" />
        <p role="alert" className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
          Only staff can open this page.
        </p>
      </div>
    );
  }
  const viewer = await loadViewer(session.userId);
  const canReview = viewer.isSuperAdmin || viewer.memberships.some((m) => m.role === "ADMIN") || viewer.reviewerRows.length > 0;

  const visible = await branchIdsFor(session.userId);
  const scope = await adminScope(session.userId);
  const writable = viewer.isSuperAdmin ? "all" : viewer.memberships.filter((m) => STAFF.has(m.role)).map((m) => m.branchId);
  const [branches, writeBranches] = await Promise.all([
    isAdmin
      ? prisma.branch.findMany({ where: visible === "all" ? {} : { id: { in: visible } }, orderBy: { name: "asc" }, select: { id: true, name: true } })
      : Promise.resolve([]),
    prisma.branch.findMany({ where: writable === "all" ? {} : { id: { in: writable } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return (
    <div>
      <PageHeader
        title="Question bank"
        description={
          isAdmin
            ? "Write and review questions, choose who reviews them and set the switches. A branch can only make a switch stricter than the school's."
            : "Write questions, send them for review and browse the ones you may use."
        }
      />
      <QuestionBankSections
        branches={branches.map((b) => ({ id: b.id, name: b.name, canEdit: mayAdminister(scope, b.id) }))}
        writeBranches={writeBranches}
        isAdmin={isAdmin}
        isSuperAdmin={isSuperAdmin}
        canReview={canReview}
      />
    </div>
  );
}
