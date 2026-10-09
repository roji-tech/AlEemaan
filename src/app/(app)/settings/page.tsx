import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePageSession } from "@/lib/auth/page-session";
import { PageHeader } from "@/components/shell/PageHeader";
import { getSchoolSettings } from "@/lib/settings/school-settings";
import { listSessions } from "@/lib/academics/sessions";
import { SettingsView } from "./SettingsView";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { isAdmin } = await requirePageSession();

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader title="Settings" />
        <div role="alert" className="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-7">
          <h2 className="text-lg font-semibold text-fg">You don&apos;t have access to this page</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
            Only administrators can view and manage school settings and academic structures.
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

  const [settings, branches, sessions] = await Promise.all([
    getSchoolSettings(),
    prisma.branch.findMany({ orderBy: { createdAt: "asc" } }),
    listSessions(),
  ]);

  return (
    <SettingsView
      initialSettings={{
        name: settings.name,
        principal: settings.principal || "",
        phone: settings.phone || "",
        motto: settings.motto || "",
        address: settings.address || "",
        email: settings.email || "",
        website: settings.website || "",
      }}
      branches={branches.map((b) => ({ id: b.id, name: b.name }))}
      initialSessions={sessions.map((s) => ({
        id: s.id,
        branchId: s.branchId,
        branchName: s.branch.name,
        label: s.label,
        startDate: s.startDate.toISOString().split("T")[0],
        endDate: s.endDate.toISOString().split("T")[0],
        status: s.status,
        periods: s.periods.map((p) => ({
          id: p.id,
          label: p.label,
          ordinal: p.ordinal,
          isCurrent: p.isCurrent,
        })),
      }))}
    />
  );
}
