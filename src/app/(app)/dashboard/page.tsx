import type { Metadata } from "next";
import Link from "next/link";
import type { ComponentType, SVGProps } from "react";
import { prisma } from "@/lib/db";
import { requirePageSession } from "@/lib/auth/page-session";
import { ROLE_LABELS } from "@/lib/roles";
import { memberLabel } from "@/lib/branches/labels";
import { PageHeader } from "@/components/shell/PageHeader";
import { BuildingIcon, GraduationCapIcon, ShieldCheckIcon, UsersIcon } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Overview" };
export const dynamic = "force-dynamic";

const TILE = "rounded-2xl border border-line bg-surface p-5 shadow-card";

function Stat({ label, value, icon: Icon }: { label: string; value: string | number; icon: ComponentType<SVGProps<SVGSVGElement>> }) {
  return (
    <li className={`${TILE} flex items-center gap-4`}>
      <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand-fg">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-sm text-fg-muted">{label}</p>
        <p className="truncate text-2xl font-bold tracking-tight text-fg">{value}</p>
      </div>
    </li>
  );
}

// The front door: after sign-in a person lands here. Every figure below is read from the database —
// nothing is placeholder. (Student records, staff, timetables etc. arrive with their phases and get
// their own tiles then.)
export default async function OverviewPage() {
  const { session, memberships, isAdmin, roleLabel } = await requirePageSession();
  const displayName = session.user.name?.trim() || session.user.email || "there";
  const firstName = displayName.split(/\s+/)[0];

  if (!isAdmin) {
    return (
      <div className="space-y-8">
        <PageHeader
          title={`Welcome, ${firstName}`}
          description={
            memberships.length > 0 ? "Here are the branches you belong to." : "You're signed in, but you aren't a member of any branch yet."
          }
        />
        {memberships.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
            Ask your school administrator to add you to a branch.
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {memberships.map((m) => (
              <li key={m.branchId} className={`${TILE} flex items-start gap-4`}>
                <span
                  aria-hidden="true"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand-fg"
                >
                  <GraduationCapIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-fg">{m.branchName}</p>
                  <p className="mt-0.5 text-sm text-fg-muted">{ROLE_LABELS[m.role]}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const [branchCount, peopleCount, branches] = await Promise.all([
    prisma.branch.count(),
    prisma.user.count({ where: { memberships: { some: { deactivatedAt: null } } } }), // active people only
    prisma.branch.findMany({
      orderBy: { createdAt: "asc" },
      take: 6,
      select: { id: true, name: true, _count: { select: { memberships: { where: { deactivatedAt: null } } } } },
    }),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader title={`Welcome, ${firstName}`} description="Your school at a glance." />

      <section aria-label="Totals">
        <ul className="grid gap-4 sm:grid-cols-3">
          <Stat label="Branches" value={branchCount} icon={BuildingIcon} />
          <Stat label="People with a role" value={peopleCount} icon={UsersIcon} />
          <Stat label="Your role" value={roleLabel} icon={ShieldCheckIcon} />
        </ul>
      </section>

      <section aria-labelledby="branches-heading">
        <div className="flex items-center justify-between gap-4">
          <h2 id="branches-heading" className="text-sm font-semibold tracking-wider text-fg-muted uppercase">
            Branches
          </h2>
          <Link
            href="/branches"
            className="inline-flex min-h-11 items-center rounded-md text-sm font-semibold text-brand-fg hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Manage branches
          </Link>
        </div>

        {branches.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">No branches yet.</p>
        ) : (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {branches.map((branch) => (
              <li key={branch.id} className={`${TILE} flex items-start gap-4`}>
                <span
                  aria-hidden="true"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand-fg"
                >
                  <BuildingIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-fg">{branch.name}</p>
                  <p className="mt-0.5 text-sm text-fg-muted">{memberLabel(branch._count.memberships)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
