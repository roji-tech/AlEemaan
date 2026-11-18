import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { isSetupComplete } from "@/lib/setup/status";
import { AuthShell } from "@/components/auth/AuthShell";
import { classifyHost, PORTAL_COPY, PORTALS, portalOrigin, readPortalConfig } from "@/lib/portals";
import { LoginForm } from "./LoginForm";
import { PortalChooser } from "./PortalChooser";

export const metadata: Metadata = { title: "Sign in" };
// Depends on the request's cookies and the database — never statically cached.
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Already signed in: nothing to do here.
  if (await getSession()) redirect("/dashboard");

  // A fresh install has no accounts yet — sending the deployer to a sign-in
  // form that can never succeed is a dead end; send them to setup.
  if ((await isSetupComplete()) === false) redirect("/setup");

  // Sign-in portals (task 0086). Off: the one sign-in form, as before. On: a portal shows its own form, headed by what it is for (the heading comes from the host, never from the
  // form, so nobody chooses a role); the school's own host shows the choice of portals, which holds no form and names no one.
  const { config } = readPortalConfig();
  const host = (await headers()).get("host") ?? "";
  const info = classifyHost(host, config);
  if (info.kind === "portal") {
    return (
      <AuthShell>
        <LoginForm portal={{ id: info.portal, ...PORTAL_COPY[info.portal] }} />
      </AuthShell>
    );
  }
  if (info.kind === "apex") {
    const protocol = (process.env.APP_URL ?? "").startsWith("https://") ? "https:" : "http:";
    const choices = PORTALS.flatMap((portal) => {
      const href = portalOrigin(portal, info, config, host, protocol);
      return href ? [{ id: portal, href: `${href}/login`, ...PORTAL_COPY[portal] }] : [];
    });
    return (
      <AuthShell>
        <PortalChooser choices={choices} />
      </AuthShell>
    );
  }
  return (
    <AuthShell>
      <LoginForm />
    </AuthShell>
  );
}
