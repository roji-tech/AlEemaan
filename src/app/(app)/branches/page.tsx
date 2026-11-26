import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePageSession } from "@/lib/auth/page-session";
import { PageHeader } from "@/components/shell/PageHeader";
import { BranchesView } from "./BranchesView";

export const metadata: Metadata = { title: "Branches" };
export const dynamic = "force-dynamic";

export default async function BranchesPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const { isSuperAdmin } = await requirePageSession();

  // The page enforces what the API enforces (`POST /api/v1/branches` is superadmin-only): hiding the nav
  // entry from other roles is a courtesy, this is the check. Nothing about branches is fetched or
  // rendered for them.
  if (!isSuperAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader title="Branches" />
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

  const branches = await prisma.branch.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, code: true, _count: { select: { memberships: { where: { deactivatedAt: null } } } } },
  });
  // Active administrators per branch (task 0130): the page shows "N admins · M members". Deactivated people are in neither count.
  const adminRows = await prisma.membership.groupBy({
    by: ["branchId"],
    where: { role: "ADMIN", deactivatedAt: null },
    _count: { _all: true },
  });
  const admins = new Map(adminRows.map((r) => [r.branchId, r._count._all]));
  const { deleted } = await searchParams; // set by the single-branch page after a deletion, so this page can say so; it is only ever shown as text

  return (
    <BranchesView
      branches={branches.map((b) => ({
        id: b.id,
        name: b.name,
        code: b.code,
        members: b._count.memberships,
        admins: admins.get(b.id) ?? 0,
      }))}
      deletedName={typeof deleted === "string" ? deleted.slice(0, 100) : null}
    />
  );
}
