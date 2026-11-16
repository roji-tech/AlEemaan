import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { SECTIONS } from "@/components/shell/nav";
import { requirePageSession } from "@/lib/auth/page-session";
import { staffKindsOf } from "@/lib/shell-pages";
import { SIDEBAR_COOKIE, SIDEBAR_SECTIONS_COOKIE, parseFoldedSections, parseSidebarCollapsed } from "@/lib/shell-prefs";

/// Every signed-in page lives in this route group and so inside the shell. The layout only DISPLAYS
/// who is signed in — a layout isn't re-rendered when someone navigates between the pages it wraps,
/// so each page calls `requirePageSession()` itself (it is cached per request, so that costs
/// nothing extra). The sidebar's two remembered choices are cookies read here, like the theme, so the
/// first paint already has the right width and the right folded sections.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const { session, memberships, roleLabel, isAdmin, isSuperAdmin } = await requirePageSession();
  const { isTeacher, isStaff } = staffKindsOf(memberships);
  const jar = await cookies();

  return (
    <AppShell
      user={{
        name: session.user.name,
        email: session.user.email,
        roleLabel,
        isAdmin,
        isSuperAdmin,
        isTeacher,
        isStaff,
        pages: session.user.pages,
      }}
      sidebarCollapsed={parseSidebarCollapsed(jar.get(SIDEBAR_COOKIE)?.value)}
      foldedSections={parseFoldedSections(
        jar.get(SIDEBAR_SECTIONS_COOKIE)?.value,
        SECTIONS.map((section) => section.id),
      )}
    >
      {children}
    </AppShell>
  );
}
