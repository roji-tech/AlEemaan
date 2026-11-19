import { navFor, type PageOverrides } from "@/components/shell/nav";
import { DESTINATIONS, type Destination } from "./destinations";

// What the top-bar search may show a person (task 0107): only destinations they can open. A page is visible when it is in THEIR navigation (the same list the sidebar draws, with their page
// overrides), a tab only when its own narrower rule also holds. This is courtesy, not security: every page and API behind a destination refuses whoever it refuses, and nothing here grants a
// page. The two pages every signed-in person has but the sidebar does not list (their account) or lists only for superadmins (the video guide) are decided here.

export type Viewer = { isAdmin: boolean; isSuperAdmin: boolean; isTeacher: boolean; isStaff: boolean; pages: PageOverrides };

const EVERYONE = new Set(["/account"]);

export function visibleDestinations(viewer: Viewer, all: readonly Destination[] = DESTINATIONS): Destination[] {
  const pages = new Set(
    navFor(viewer.isAdmin, viewer.isSuperAdmin, viewer.isTeacher, viewer.isStaff, viewer.pages).flatMap((item) =>
      item.href ? [item.href] : [],
    ),
  );
  return all.filter((d) => {
    if (d.only === "superadmin" && !viewer.isSuperAdmin) return false;
    if (d.only === "admin" && !(viewer.isAdmin || viewer.isSuperAdmin)) return false;
    return EVERYONE.has(d.page) || pages.has(d.page) || (d.page === "/video-guide" && viewer.isSuperAdmin);
  });
}
