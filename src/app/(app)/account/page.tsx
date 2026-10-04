import type { Metadata } from "next";
import { requirePageSession } from "@/lib/auth/page-session";
import { ROLE_LABELS } from "@/lib/roles";
import { PageHeader } from "@/components/shell/PageHeader";
import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";
import { Card } from "@/components/ui/Card";

export const metadata: Metadata = { title: "Account" };
export const dynamic = "force-dynamic";

// "Profile" in the account menu leads here. It shows what the system knows about the signed-in person —
// plus the Password card (§0.5.C). Two-step verification (§0.5.D) and active devices get their own cards
// as they are built.
export default async function AccountPage() {
  const { session, memberships } = await requirePageSession();
  const { name, email } = session.user;

  return (
    <div className="space-y-8">
      <PageHeader title="Account" description="Your profile and where you belong." />

      <Card>
        <h2 className="text-lg font-semibold text-fg">Profile</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-xs font-semibold tracking-wide text-fg-muted uppercase">Name</dt>
            <dd className="mt-1 truncate text-sm text-fg">{name?.trim() || "—"}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs font-semibold tracking-wide text-fg-muted uppercase">Email</dt>
            <dd className="mt-1 truncate text-sm text-fg">{email ?? "—"}</dd>
          </div>
        </dl>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-fg">Your access</h2>
        {memberships.length === 0 ? (
          <p className="mt-2 text-sm text-fg-muted">You aren&apos;t a member of any branch yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {memberships.map((m) => (
              <li key={m.branchId} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <span className="min-w-0 truncate text-sm font-medium text-fg">{m.branchName}</span>
                <span className="shrink-0 text-sm text-fg-muted">{ROLE_LABELS[m.role]}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-fg">Password</h2>
        <p className="mt-1 text-sm text-fg-muted">Changing it signs you out of every other device.</p>
        <ChangePasswordForm />
      </Card>
    </div>
  );
}
