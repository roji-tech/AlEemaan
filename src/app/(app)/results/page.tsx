import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requirePageSession } from "@/lib/auth/page-session";
import { adminScope, branchIdsFor, mayAdminister } from "@/lib/auth/branch-access";
import { approverBranchIds } from "@/lib/academics/approver-scope";
import { PageHeader } from "@/components/shell/PageHeader";
import { ResultsSections } from "@/components/results/ResultsSections";

export const metadata: Metadata = { title: "Results" };
export const dynamic = "force-dynamic";

// Entering marks, reviewing and publishing them, and the report cards (Slice P2d). The page offers the branches the person holds a STAFF role in (a superadmin: all)
// and whether they administer each. It is display: the results APIs behind every list and button decide, on every request.
export default async function ResultsPage() {
  const { session, isAdmin } = await requirePageSession();
  const visible = await branchIdsFor(session.userId);
  const scope = await adminScope(session.userId);
  const approverIn = new Set(await approverBranchIds(session.userId)); // where they approve results as a member (task 0039), not as an administrator
  const branches = await prisma.branch.findMany({
    where: visible === "all" ? {} : { id: { in: visible } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div>
      <div className="print:hidden">
        <PageHeader
          title="Results"
          description={
            isAdmin
              ? "Enter marks, review and publish them, and print report cards. A teacher enters only the subjects they are assigned to."
              : "Enter the marks of the subjects you teach, submit them for review, and read report cards."
          }
        />
      </div>
      {branches.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
          You don&apos;t belong to a branch with staff access yet.
        </p>
      ) : (
        <ResultsSections
          branches={branches.map((b) => ({
            id: b.id,
            name: b.name,
            canEdit: mayAdminister(scope, b.id),
            canApprove: approverIn.has(b.id),
          }))}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}
