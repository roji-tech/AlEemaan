import type { ComponentType, SVGProps } from "react";
import { ChevronRightIcon, GraduationCapIcon, ShieldCheckIcon, UserIcon, UsersIcon } from "@/components/ui/icons";
import type { Portal } from "@/lib/portals";

export type PortalChoice = { id: Portal; href: string; title: string; line: string };
export const PORTAL_ICONS: Record<Portal, ComponentType<SVGProps<SVGSVGElement>>> = {
  admin: ShieldCheckIcon,
  staff: UsersIcon,
  student: GraduationCapIcon,
  parent: UserIcon,
};

/// The school's own host, when sign-in portals are on (task 0086): where each kind of person signs in. Plain links to the portals' own addresses; no form, no account named, and
/// nothing about who may use which beyond what each heading already says.
export function PortalChooser({ choices }: { choices: PortalChoice[] }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-7 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
      <h1 className="text-[22px] font-bold tracking-tight text-fg">Who is signing in?</h1>
      <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">Choose where you sign in.</p>
      <ul aria-label="Sign-in portals" className="mt-6 space-y-3">
        {choices.map(({ id, href, title, line }) => {
          const Icon = PORTAL_ICONS[id];
          return (
            <li key={id}>
              <a
                href={href}
                className="flex min-h-16 items-center gap-4 rounded-2xl border border-line bg-surface p-3 transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <span
                  aria-hidden="true"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand-fg"
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-fg">{title}</span>
                  <span className="block text-sm text-fg-muted">{line}</span>
                </span>
                <ChevronRightIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-fg-muted" />
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
