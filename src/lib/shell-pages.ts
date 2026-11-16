import { Role } from "@prisma/client";
import { QUESTION_BANK_HREF, type PageOverrides } from "@/components/shell/nav";
import { hasBankReviewerRole } from "@/lib/question-bank/viewer";

// The pages the shell shows or hides for ONE person on top of what their role gives: `session.user.pages` (see `requirePageSession`). The shell only applies it (`navFor`);
// everything that decides it is here, next to the rules it asks. Display only: a page or an API behind an entry still refuses whoever it refuses, so an `included` page is never a
// grant. It is worked out for each request rather than stored on the person: nothing to migrate, and nothing to keep in step when an assignment or a membership changes.

type Membership = { branchId: string; role: Role };

/// Which kinds of staff a person is, from their ACTIVE memberships: a teacher (teaching staff in some branch), and a member of staff of either kind.
export function staffKindsOf(memberships: ReadonlyArray<Pick<Membership, "role">>) {
  const isTeacher = memberships.some((m) => m.role === Role.TEACHING_STAFF);
  return { isTeacher, isStaff: isTeacher || memberships.some((m) => m.role === Role.NON_TEACHING_STAFF) };
}

/// Whether `pages` takes this page away from the person. A page asks this after its own role check, and so `pages` can only ever ADD a refusal there: `included` is never
/// read by a page (it only lets the shell offer a link), because what a person may do is decided by the page's own rule and by the API behind it, not by a list in the session.
/// (A page refused here is still only a page: the API stays the enforcement, so use it to keep a person out of a screen, not to protect data.)
export const pageExcluded = (pages: PageOverrides, href: string): boolean => pages.excluded[href] === true;

export type PageFacts = { isAdmin: boolean; isTeacher: boolean; isStaff: boolean; isBankReviewer: boolean };

/// Pure, so each rule is a table in a unit test. Today's exceptions to the role defaults:
///  - the Question bank: administrators and teachers have it from their role; a member of NON-teaching staff has it only while they hold a reviewer assignment that still counts
///    (that is what gives them work there: writing and reviewing; without it they could only browse what pupils already see).
export function pageOverridesFor(facts: PageFacts): PageOverrides {
  const included: Record<string, true> = {};
  const excluded: Record<string, true> = {};
  if (!facts.isAdmin && !facts.isTeacher && facts.isStaff && facts.isBankReviewer) included[QUESTION_BANK_HREF] = true;
  return { included, excluded };
}

/// The overrides for a signed-in person. The one database read (the person's reviewer rows) is made only for a member of non-teaching staff, so nobody else pays for it.
export async function loadPageOverrides({
  userId,
  memberships,
  isAdmin,
}: {
  userId: string;
  memberships: ReadonlyArray<Membership>;
  isAdmin: boolean;
}): Promise<PageOverrides> {
  const { isTeacher, isStaff } = staffKindsOf(memberships);
  const isBankReviewer = !isAdmin && !isTeacher && isStaff ? await hasBankReviewerRole(userId, memberships) : false;
  return pageOverridesFor({ isAdmin, isTeacher, isStaff, isBankReviewer });
}
