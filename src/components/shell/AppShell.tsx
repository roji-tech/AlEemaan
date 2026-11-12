import type { ReactNode } from "react";
import { SessionRevalidator } from "@/components/auth/SessionRevalidator";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { brand } from "@/lib/brand";
import { BrandMark } from "./BrandMark";
import { Breadcrumb } from "./Breadcrumb";
import { MobileNav } from "./MobileNav";
import { ProfileMenu } from "./ProfileMenu";
import { SidebarFrame, SidebarProvider } from "./SidebarFrame";
import { SidebarNav } from "./SidebarNav";
import type { SectionId } from "./nav";
import { QuickToolsTrigger } from "@/components/tools/QuickToolsTrigger";

export type ShellUser = {
  name: string | null;
  email: string | null;
  /// e.g. "Administrator" — shown under the name.
  roleLabel: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  /// Holds a teaching-staff role in some branch (shows the Results item to a teacher who is not an administrator).
  isTeacher: boolean;
  isStaff: boolean;
};

/// The signed-in admin app's frame, from the design artifact ("same shell, one brand tweak"):
///  - `lg` and up: a 248 px sidebar (brand, navigation in foldable sections, the signed-in person pinned
///    at its foot) that the person can fold to a 64 px rail of icons, and a 60 px top bar (breadcrumb,
///    theme toggle, account menu);
///  - below `lg`: a compact top bar and a floating bottom tab bar with a "More" sheet — the page
///    reserves room for it, so it never covers content.
/// A skip link is the first thing in the tab order. Every page inside is still responsible for its
/// own session check; the shell only displays who is signed in.
export function AppShell({
  user,
  sidebarCollapsed = false,
  foldedSections = [],
  children,
}: {
  user: ShellUser;
  /// The remembered choice (a cookie, read by the layout) so the first paint has the right width.
  sidebarCollapsed?: boolean;
  foldedSections?: readonly SectionId[];
  children: ReactNode;
}) {
  const section = user.isAdmin ? "Admin" : user.roleLabel;

  return (
    <SidebarProvider initialCollapsed={sidebarCollapsed} initialFolded={foldedSections}>
      <SessionRevalidator />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-brand-strong focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>

      <SidebarFrame person={{ name: user.name, email: user.email, roleLabel: user.roleLabel }}>
        <SidebarNav isAdmin={user.isAdmin} isSuperAdmin={user.isSuperAdmin} isTeacher={user.isTeacher} isStaff={user.isStaff} />
      </SidebarFrame>

      <div className="transition-[padding] duration-200 motion-reduce:transition-none lg:pl-62 lg:group-data-[sidebar=collapsed]/shell:pl-16 print:pl-0">
        <header className="sticky top-0 z-20 flex h-15 print:hidden items-center justify-between gap-4 border-b border-line bg-canvas px-4 sm:px-6">
          <div className="flex items-center gap-2.5 lg:hidden">
            <BrandMark size="sm" />
            <span className="text-base font-bold tracking-tight text-fg">{brand.name}</span>
          </div>
          <div className="hidden lg:block">
            <Breadcrumb section={section} />
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <ProfileMenu name={user.name} email={user.email} roleLabel={user.roleLabel} isSuperAdmin={user.isSuperAdmin} />
          </div>
        </header>

        {/* pb-32 on phones: the floating tab bar (~72 px + its 12 px gap + the safe area) must never
            cover the last thing on the page. */}
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-5xl px-4 py-8 pb-32 focus:outline-none sm:px-6 lg:py-10 lg:pb-12">
          {children}
        </main>
      </div>

      <MobileNav
        name={user.name}
        email={user.email}
        roleLabel={user.roleLabel}
        isAdmin={user.isAdmin}
        isSuperAdmin={user.isSuperAdmin}
        isTeacher={user.isTeacher}
        isStaff={user.isStaff}
      />

      <QuickToolsTrigger />
    </SidebarProvider>
  );
}
