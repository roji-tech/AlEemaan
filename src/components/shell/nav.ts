import type { ComponentType, SVGProps } from "react";
import {
  BookOpenIcon,
  BuildingIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClipboardIcon,
  CreditCardIcon,
  FileTextIcon,
  ShieldCheckIcon,
  GraduationCapIcon,
  HomeIcon,
  MailIcon,
  MegaphoneIcon,
  SlidersIcon,
  UsersIcon,
} from "@/components/ui/icons";

export type NavItem = {
  label: string;
  /// null → not built yet: shown as visibly-disabled text with a "Soon" tag, never as a link
  /// (the design artifact draws Settings and Users; a link to nothing would be a lie).
  href: string | null;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /// Administrators only (of any branch, or a superadmin). Hiding an entry is a courtesy; the page and API behind it enforce it.
  adminOnly?: boolean;
  /// Superadmins only (school-wide: branches, school settings).
  superAdminOnly?: boolean;
  /// Administrators and teaching staff (marks and report cards).
  staffOnly?: boolean;
  /// Administrators and every member of staff, teaching or not (a page every member of staff has something to do on).
  allStaff?: boolean;
  /// Phone only: the bottom bar fits four tabs plus More, so a rarely used page lives in the More sheet instead of squeezing the bar (the sidebar still lists it).
  inMore?: boolean;
  /// The sidebar section this page belongs to; no section = listed on its own at the top (Overview). Order in `NAV` is NOT the order of the sections: `SECTIONS` is.
  section?: SectionId;
};

/// The sidebar's sections, in the order they are shown. The ids are what the "folded sections" cookie stores, so renaming one only forgets a folded state.
export const SECTIONS = [
  { id: "classroom", label: "Classroom" },
  { id: "assessment", label: "Assessment" },
  { id: "communication", label: "Communication" },
  { id: "administration", label: "Administration" },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];

/// The single source of truth for navigation: the sidebar, the phone tab bar and the "More"
/// sheet are all derived from this list, so they can't disagree.
export const NAV: readonly NavItem[] = [
  { label: "Overview", href: "/dashboard", icon: HomeIcon },
  { label: "Branches", href: "/branches", icon: BuildingIcon, superAdminOnly: true, inMore: true, section: "administration" },
  { label: "Settings", href: "/settings", icon: SlidersIcon, superAdminOnly: true, inMore: true, section: "administration" },
  { label: "Academics", href: "/academics", icon: GraduationCapIcon, adminOnly: true, section: "administration" },
  { label: "Students", href: "/students", icon: UsersIcon, staffOnly: true, inMore: true, section: "classroom" },
  { label: "Coursework", href: "/lms", icon: BookOpenIcon, staffOnly: true, inMore: true, section: "classroom" },
  { label: "Attendance", href: "/attendance", icon: CheckCircleIcon, staffOnly: true, inMore: true, section: "classroom" },
  { label: "Results", href: "/results", icon: ClipboardIcon, staffOnly: true, section: "assessment" },
  { label: "Timetable", href: "/timetable", icon: CalendarIcon, staffOnly: true, inMore: true, section: "classroom" },
  { label: "Announcements", href: "/announcements", icon: MegaphoneIcon, inMore: true, section: "communication" },
  { label: "Communication", href: "/communication", icon: MailIcon, adminOnly: true, inMore: true, section: "communication" },
  { label: "Finance", href: "/finance", icon: CreditCardIcon, adminOnly: true, inMore: true, section: "administration" },
  { label: "Approvals", href: "/approvals", icon: ShieldCheckIcon, adminOnly: true, inMore: true, section: "administration" },
  { label: "Question bank", href: "/question-bank", icon: FileTextIcon, staffOnly: true, inMore: true, section: "assessment" },
  { label: "Forms", href: "/forms", icon: ClipboardIcon, allStaff: true, inMore: true, section: "assessment" },
  { label: "Users", href: "/users", icon: UsersIcon, adminOnly: true, section: "administration" },
];

export const navFor = (isAdmin: boolean, isSuperAdmin: boolean, isTeacher = false, isStaff = false): NavItem[] =>
  NAV.filter((item) =>
    item.superAdminOnly
      ? isSuperAdmin
      : item.adminOnly
        ? isAdmin
        : item.allStaff
          ? isAdmin || isTeacher || isStaff
          : item.staffOnly
            ? isAdmin || isTeacher
            : true,
  );

export type NavGroup = {
  /// null = no heading: the entries listed on their own, or a section that has just one visible entry (a section of one is a plain link).
  section: { id: SectionId; label: string } | null;
  items: NavItem[];
};

/// The visible entries as the sidebar and the phone's More sheet show them: entries with no section first,
/// then each section that has entries, in the order of `SECTIONS`. A section with exactly one entry comes
/// out without a heading (nothing to fold), and a section with none is dropped. Pure, so it is tested without a browser.
export function groupNav(items: readonly NavItem[]): NavGroup[] {
  const groups: NavGroup[] = [];
  const loose = items.filter((item) => !item.section);
  if (loose.length > 0) groups.push({ section: null, items: loose });
  for (const section of SECTIONS) {
    const inSection = items.filter((item) => item.section === section.id);
    if (inSection.length === 0) continue;
    groups.push({ section: inSection.length === 1 ? null : section, items: inSection });
  }
  return groups;
}

/// The section a page belongs to, or null (no section, or the path is not in the list). Used to open the folded section that holds the current page.
export function sectionOfPath(pathname: string, items: readonly NavItem[]): SectionId | null {
  const item = items.find((candidate) => candidate.href && isActive(pathname, candidate.href));
  return item?.section ?? null;
}

/// Second crumb of the top bar, by path (the first crumb is the person's section: "Admin", …).
export const PAGE_LABELS: Record<string, string> = {
  "/dashboard": "Overview",
  "/branches": "Branches",
  "/settings": "Settings",
  "/academics": "Academics",
  "/students": "Students",
  "/lms": "Coursework",
  "/attendance": "Attendance",
  "/results": "Results",
  "/timetable": "Timetable",
  "/announcements": "Announcements",
  "/communication": "Communication",
  "/finance": "Finance",
  "/approvals": "Approvals and rules",
  "/question-bank": "Question bank",
  "/forms": "Forms",
  "/users": "Users",
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
