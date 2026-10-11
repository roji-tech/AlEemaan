import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePageSession } from "@/lib/auth/page-session";
import { adminScope } from "@/lib/auth/branch-access";
import { PageHeader } from "@/components/shell/PageHeader";
import { UsersPanel } from "@/components/users/UsersPanel";

export const metadata: Metadata = { title: "Users" };
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const { session, isAdmin, isSuperAdmin } = await requirePageSession();

  // The page enforces what the API enforces (the members and invitations routes are for administrators): hiding the nav entry from other roles is
  // a courtesy, this is the check. Nothing about people is fetched or rendered for them.
  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader title="Users" />
        <div role="alert" className="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-7">
          <h2 className="text-lg font-semibold text-fg">You don&apos;t have access to this page</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
            Only administrators can view and manage users. If you think you should have access, ask your school administrator.
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

  // The branches the caller may pick: all of them for a superadmin, their own for a branch administrator.
  const scope = await adminScope(session.userId);
  const branches = await prisma.branch.findMany({
    where: scope.superAdmin ? {} : { id: { in: [...scope.branchIds] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="The people who can sign in to AlEemaan: invite someone, change a role or branch, or deactivate an account."
      />
      <UsersPanel branches={branches} currentUserId={session.userId} isSuperAdmin={isSuperAdmin} />
    </div>
  );
}
