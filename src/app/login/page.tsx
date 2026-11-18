import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { safeReturnTo } from "@/lib/auth/return-to";
import { isSetupComplete } from "@/lib/setup/status";
import { AuthShell } from "@/components/auth/AuthShell";
import { hostFromHeaders } from "@/lib/auth/csrf";
import { classifyHost, PORTAL_COPY, readPortalConfig } from "@/lib/portals";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };
// Depends on the request's cookies and the database — never statically cached.
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next } = await searchParams;
  const returnTo = safeReturnTo(Array.isArray(next) ? next[0] : next);
  // Already signed in: nothing to do here (back to the page they asked for, if any).
  if (await getSession()) redirect(returnTo ?? "/dashboard");

  // A fresh install has no accounts yet — sending the deployer to a sign-in
  // form that can never succeed is a dead end; send them to setup.
  if ((await isSetupComplete()) === false) redirect("/setup");

  // Sign-in portals (task 0086). Off: the one sign-in form, as before. On: a portal shows its own form, headed by what it is for (the heading comes from the host, never from the form,
  // so nobody chooses a role); the school's own host has no sign-in form at all: the proxy already sends `/login` there to `/select-role`, and this is the same answer if it ever got through.
  const { config } = readPortalConfig();
  const info = classifyHost(hostFromHeaders(await headers()), config);
  if (info.kind === "portal") {
    return (
      <AuthShell>
        <LoginForm portal={{ id: info.portal, ...PORTAL_COPY[info.portal] }} returnTo={returnTo} />
      </AuthShell>
    );
  }
  if (info.kind === "apex") redirect("/select-role");
  return (
    <AuthShell>
      <LoginForm returnTo={returnTo} />
    </AuthShell>
  );
}
