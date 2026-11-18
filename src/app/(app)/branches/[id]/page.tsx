import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePageSession } from "@/lib/auth/page-session";
import { PageHeader } from "@/components/shell/PageHeader";
import { isPlausibleId } from "@/lib/members/http";
import { branchHoldings } from "@/lib/branches/holdings";
import { BranchDetailView } from "./BranchDetailView";

export const metadata: Metadata = { title: "Branch" };
export const dynamic = "force-dynamic";

// One branch (superadmin only, like the list): its name and code, who and what it holds, and the two things that change it. Nothing is fetched for anyone else.
export default async function BranchPage({ params }: { params: Promise<{ id: string }> }) {
  const { isSuperAdmin } = await requirePageSession();
  if (!isSuperAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader title="Branch" />
        <div role="alert" className="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-7">
          <h2 className="text-lg font-semibold text-fg">You don&apos;t have access to this page</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
            Only superadmins can view and manage branches. If you think you should have access, ask your school administrator.
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
  const { id } = await params;
  const branch = isPlausibleId(id)
    ? await prisma.branch.findUnique({ where: { id }, select: { id: true, name: true, code: true, createdAt: true } })
    : null;
  // A sentence and not `notFound()`: the app has no not-found page of its own and Next's default one carries an inline style the CSP refuses (see programs/[id]/page.tsx). A malformed id
  // and an unknown one get the same words.
  if (!branch) {
    return (
      <div className="space-y-4">
        <PageHeader title="Branch" />
        <p role="alert" className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
          We could not find that branch.
        </p>
        <Link href="/branches" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand-fg hover:underline">
          <span aria-hidden="true">←</span>
          All branches
        </Link>
      </div>
    );
  }
  const [holdings, branches] = await Promise.all([branchHoldings(prisma, id), prisma.branch.count()]);
  return (
    <BranchDetailView
      branch={{ id: branch.id, name: branch.name, code: branch.code, createdAt: branch.createdAt.toISOString() }}
      holdings={holdings}
      onlyBranch={branches <= 1}
    />
  );
}
