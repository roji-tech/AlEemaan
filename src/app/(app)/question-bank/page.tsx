import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requirePageSession } from "@/lib/auth/page-session";
import { adminScope, branchIdsFor, mayAdminister } from "@/lib/auth/branch-access";
import { PageHeader } from "@/components/shell/PageHeader";
import { QuestionBankSections } from "@/components/question-bank/QuestionBankSections";

export const metadata: Metadata = { title: "Question bank" };
export const dynamic = "force-dynamic";

// The question bank's foundation (Task 0032 slice 1): who may review questions, and the switches a superadmin sets for every branch and a branch administrator may only
// narrow for theirs. Display only: the APIs behind it decide who may do what. Submitting, reviewing and browsing questions arrive with the next slices.
export default async function QuestionBankPage() {
  const { session, isAdmin, isSuperAdmin } = await requirePageSession();
  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="Question bank" />
        <p role="alert" className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
          Only administrators can open this page.
        </p>
      </div>
    );
  }
  const visible = await branchIdsFor(session.userId);
  const scope = await adminScope(session.userId);
  const branches = await prisma.branch.findMany({
    where: visible === "all" ? {} : { id: { in: visible } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return (
    <div>
      <PageHeader
        title="Question bank"
        description={
          isSuperAdmin
            ? "Choose who reviews questions and set the switches for every branch. A branch can only make a switch stricter."
            : "Choose who reviews questions in your branch and make the switches stricter for it. A superadmin sets the school-wide values."
        }
      />
      <QuestionBankSections
        branches={branches.map((b) => ({ id: b.id, name: b.name, canEdit: mayAdminister(scope, b.id) }))}
        isSuperAdmin={isSuperAdmin}
      />
    </div>
  );
}
