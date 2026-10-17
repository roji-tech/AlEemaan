import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePageSession } from "@/lib/auth/page-session";
import { adminScope } from "@/lib/auth/branch-access";
import { PageHeader } from "@/components/shell/PageHeader";
import { FinancePanel } from "@/components/finance/FinancePanel";

export const metadata: Metadata = { title: "Finance & Fee Invoicing" };
export const dynamic = "force-dynamic";

export default async function FinancePage() {
  const { session, isAdmin, isSuperAdmin, memberships } = await requirePageSession();

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader title="Finance & Fee Invoicing" />
        <div role="alert" className="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-7">
          <h2 className="text-lg font-semibold text-fg">You don&apos;t have access to this page</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
            Only administrators can view and manage financial fee structures and billing invoices. If you think you should have access, ask
            your school administrator.
          </p>
          <Link
            href="/dashboard"
            className="mt-2 inline-flex min-h-11 items-center rounded-md text-sm font-semibold text-brand-fg hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Back to overview
          </Link>
        </div>
      </div>
    );
  }

  const scope = await adminScope(session.userId);
  const branches = await prisma.branch.findMany({
    where: scope.superAdmin ? {} : { id: { in: [...scope.branchIds] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });

  const userBranchId = memberships[0]?.branchId ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finance & Fee Invoicing"
        description="Configure class fee structures, generate termly tuition invoices, record manual payments, apply discounts, and manage Paystack online settlement."
      />
      {branches.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
          You don&apos;t belong to a branch with finance administration access yet.
        </p>
      ) : (
        <FinancePanel branches={branches} isSuperAdmin={isSuperAdmin} canManage={isAdmin} userBranchId={userBranchId} />
      )}
    </div>
  );
}
