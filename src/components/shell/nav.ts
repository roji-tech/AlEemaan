import type { ComponentType, SVGProps } from "react";
import { BuildingIcon, HomeIcon, SlidersIcon, UsersIcon } from "@/components/ui/icons";

export type NavItem = {
  label: string;
  /// null → not built yet: shown as visibly-disabled text with a "Soon" tag, never as a link
  /// (the design artifact draws Settings and Users; a link to nothing would be a lie).
  href: string | null;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /// Administrators only. Hiding an entry is a courtesy; the page and API behind it enforce it.
  adminOnly?: boolean;
};

/// The single source of truth for navigation: the sidebar, the phone tab bar and the "More"
/// sheet are all derived from this list, so they can't disagree.
export const NAV: readonly NavItem[] = [
  { label: "Overview", href: "/dashboard", icon: HomeIcon },
  { label: "Branches", href: "/branches", icon: BuildingIcon, adminOnly: true },
  { label: "Settings", href: null, icon: SlidersIcon, adminOnly: true },
  { label: "Users", href: null, icon: UsersIcon, adminOnly: true },
];

export const navFor = (isAdmin: boolean): NavItem[] => NAV.filter((item) => isAdmin || !item.adminOnly);

/// Second crumb of the top bar, by path (the first crumb is the person's section: "Admin", …).
export const PAGE_LABELS: Record<string, string> = {
  "/dashboard": "Overview",
  "/branches": "Branches",
  "/account": "Account",
};

export const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/// One focus style for every shell control: a solid 2px ring in the brand's light colour,
/// offset from the edge so it reads on any surface in either theme.
export const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/// "Amina Yusuf" → "AY"; "Amina" → "A"; with no name, the first word of the email's local part.
export function initialsOf(name: string | null, email: string | null): string {
  const words = (name?.trim() || email?.split("@")[0] || "?").split(/[\s._-]+/).filter(Boolean);
  const picked = words.length > 1 ? [words[0], words[words.length - 1]] : [words[0] ?? "?"];
  return picked
    .map((word) => Array.from(word)[0]) // Array.from: don't split a surrogate pair in half
    .join("")
    .toUpperCase();
}
