import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePageSession } from "@/lib/auth/page-session";
import { PageHeader } from "@/components/shell/PageHeader";
import { BranchesView } from "./BranchesView";

export const metadata: Metadata = { title: "Branches" };
export const dynamic = "force-dynamic";

export default async function BranchesPage() {
  const { isAdmin } = await requirePageSession();

  // The page enforces what the API enforces (`POST /api/v1/branches` is admin-only): hiding the nav
  // entry from other roles is a courtesy, this is the check. Nothing about branches is fetched or
  // rendered for them.
  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader title="Branches" />
        <div role="alert" className="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-7">
          <h2 className="text-lg font-semibold text-fg">You don&apos;t have access to this page</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
            Only administrators can view and manage branches. If you think you should have access, ask your school administrator.
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

  const branches = await prisma.branch.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, _count: { select: { memberships: { where: { deactivatedAt: null } } } } },
  });

  return <BranchesView branches={branches.map((b) => ({ id: b.id, name: b.name, members: b._count.memberships }))} />;
}
