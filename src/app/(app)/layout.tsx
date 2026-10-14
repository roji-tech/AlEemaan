import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { requirePageSession } from "@/lib/auth/page-session";

/// Every signed-in page lives in this route group and so inside the shell. The layout only DISPLAYS
/// who is signed in — a layout isn't re-rendered when someone navigates between the pages it wraps,
/// so each page calls `requirePageSession()` itself (it is cached per request, so that costs
/// nothing extra).
export default async function AppLayout({ children }: { children: ReactNode }) {
  const { session, memberships, roleLabel, isAdmin, isSuperAdmin } = await requirePageSession();
  const isTeacher = memberships.some((m) => m.role === "TEACHING_STAFF");

  return (
    <AppShell user={{ name: session.user.name, email: session.user.email, roleLabel, isAdmin, isSuperAdmin, isTeacher }}>
      {children}
    </AppShell>
  );
}
