import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { PORTAL_COOKIE_NAME } from "@/lib/portal/auth";
import { resolvePortalSessionData } from "@/lib/portal/service";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { safeReturnTo } from "@/lib/auth/return-to";
import { isSetupComplete } from "@/lib/setup/status";
import { AuthShell } from "@/components/auth/AuthShell";
import { hostFromHeaders } from "@/lib/auth/csrf";
import { classifyHost, PORTAL_COPY, readPortalConfig } from "@/lib/portals";
import { portalClosedNotice } from "@/lib/auth/login-switch";
import { LOGIN_CLOSED_MESSAGE } from "@/lib/auth/login-switch-rules";
import { LoginForm } from "./LoginForm";
import { FamilySignIn } from "./FamilySignIn";

export const metadata: Metadata = { title: "Sign in" };
// Depends on the request's cookies and the database — never statically cached.
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; closed?: string | string[] }>;
}) {
  const { next, closed } = await searchParams;
  const returnTo = safeReturnTo(Array.isArray(next) ? next[0] : next);
  // A student or parent whose branch has switched their sign-in off was sent here by a page or request (task 0091). The message is fixed text, whatever the address says.
  const endedByClosure = (Array.isArray(closed) ? closed[0] : closed) === "1";
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
    // Student and parent sign-in (task 0091): when this portal is a student or a parent portal and the school has not opened it, the page says so. Decided from the host alone, never from
    // anything typed, so it says nothing about any account; the form stays (a person who is also a member of staff still signs in).
    const closedNotice = endedByClosure ? LOGIN_CLOSED_MESSAGE : await portalClosedNotice(info.portal);
    // The one door (task 0113): student. and parent. show the families' form first, with the e-mail sign-in one click under it.
    if (info.portal === "student" || info.portal === "parent") {
      // A family already signed in here goes straight to its workspace. The session is checked as every request checks it (task 0113: a signature alone is not enough; a cookie whose
      // code was replaced or whose guardian was blocked would send /portal back here, and round again).
      if (await resolvePortalSessionData((await cookies()).get(PORTAL_COOKIE_NAME)?.value)) redirect("/portal");
      return (
        <AuthShell>
          <FamilySignIn portal={{ id: info.portal, ...PORTAL_COPY[info.portal] }} returnTo={returnTo} closedNotice={closedNotice} />
        </AuthShell>
      );
    }
    return (
      <AuthShell>
        <LoginForm portal={{ id: info.portal, ...PORTAL_COPY[info.portal] }} returnTo={returnTo} closedNotice={closedNotice} />
      </AuthShell>
    );
  }
  if (info.kind === "apex") redirect("/select-role");
  return (
    <AuthShell>
      <LoginForm returnTo={returnTo} closedNotice={endedByClosure ? LOGIN_CLOSED_MESSAGE : null} />
    </AuthShell>
  );
}
