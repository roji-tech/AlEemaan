import type { Metadata } from "next";
import { requirePageSession } from "@/lib/auth/page-session";
import { ROLE_LABELS } from "@/lib/roles";
import { PageHeader } from "@/components/shell/PageHeader";
import { ChangeEmailPanel } from "@/components/auth/ChangeEmailPanel";
import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";
import { ProfileDetails } from "@/components/auth/ProfileDetails";
import { SessionsPanel } from "@/components/auth/SessionsPanel";
import { TwoStepPanel } from "@/components/auth/TwoStepPanel";
import { mfaConfigured } from "@/lib/auth/mfa/secret-box";
import { getMfaStatus } from "@/lib/auth/mfa/service";
import { Card } from "@/components/ui/Card";

export const metadata: Metadata = { title: "Account" };
export const dynamic = "force-dynamic";

// "Profile" in the account menu leads here. It shows what the system knows about the signed-in person and lets
// them change it: the Profile card (editable name), Email address (§0.5.E), Password (§0.5.C), Two-step
// verification (§0.5.D) and Active sessions (§0.5.E).
export default async function AccountPage() {
  const { session, memberships } = await requirePageSession();
  const { name, email } = session.user;
  const mfa = await getMfaStatus(session.userId);

  return (
    <div className="space-y-8">
      <PageHeader title="Account" description="Your profile and where you belong." />

      <Card>
        <h2 className="text-lg font-semibold text-fg">Profile</h2>
        <ProfileDetails name={name} email={email} />
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
        <h2 className="text-lg font-semibold text-fg">Email address</h2>
        <p className="mt-1 text-sm text-fg-muted">It&apos;s what you sign in with, and where password reset links go.</p>
        <ChangeEmailPanel email={email} />
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-fg">Password</h2>
        <p className="mt-1 text-sm text-fg-muted">Changing it signs you out of every other device.</p>
        <ChangePasswordForm />
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-fg">Two-step verification</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Protect your account with a code from an authenticator app, as well as your password.
        </p>
        <TwoStepPanel
          available={mfaConfigured()}
          enabled={mfa.enabled}
          recoveryCodesRemaining={mfa.recoveryCodesRemaining}
        />
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-fg">Active sessions</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Where you&apos;re signed in. If you don&apos;t recognise one, sign it out and change your password.
        </p>
        <SessionsPanel />
      </Card>
    </div>
  );
}
