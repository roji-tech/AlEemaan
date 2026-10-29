import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requirePageSession } from "@/lib/auth/page-session";
import { adminScope, branchIdsFor, mayAdminister } from "@/lib/auth/branch-access";
import { PageHeader } from "@/components/shell/PageHeader";
import { ApprovalsSections } from "@/components/approvals/ApprovalsSections";

export const metadata: Metadata = { title: "Approvals and rules" };
export const dynamic = "force-dynamic";

// Requests waiting for a decision, and the rules a superadmin sets for every branch or an administrator for theirs (Slice UI1, over the P2e settings APIs):
// the report-card layout, what the public verification page shows, and who may approve their own marks. Display only: each API decides who may do what.
export default async function ApprovalsPage() {
  const { session, isAdmin, isSuperAdmin } = await requirePageSession();
  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="Approvals and rules" />
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
        title="Approvals and rules"
        description={
          isSuperAdmin
            ? "Decide requests, choose what every branch's report cards and public verification page show, and say who may approve their own marks."
            : "Your requests and the decisions on them, and the rules for your branch. A superadmin decides what needs approval."
        }
      />
      <ApprovalsSections
        branches={branches.map((b) => ({ id: b.id, name: b.name, canEdit: mayAdminister(scope, b.id) }))}
        isSuperAdmin={isSuperAdmin}
      />
    </div>
  );
}
