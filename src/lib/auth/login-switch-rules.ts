// Types only from Prisma and the portals: this module is pure (no database, no server, no zod), so every rule here is tested without them and the browser may import it.
import type { Role } from "@prisma/client";
import type { Portal } from "@/lib/portals";

// Student and parent sign-in switches (task 0091), PER BRANCH. Each branch has two independent yes/no values, OFF until an administrator of that branch (or a superadmin) turns them on.
// They are about ACCOUNTS (the email and password sign-in); the public result portal (`/portal`, a pupil's admission number or a guardian's link) has its own access rules and is not
// touched here. The body of the change is in `login-switch-input.ts` (it needs zod, which a browser bundle should not carry).

/// The two switches of ONE branch.
export type BranchSwitches = { studentLoginEnabled: boolean; parentLoginEnabled: boolean };

/// What applies when nothing says otherwise: both OFF. Also what the database columns default to.
export const SWITCHES_OFF: BranchSwitches = { studentLoginEnabled: false, parentLoginEnabled: false };

/// One ACTIVE membership of a person, with the switches of ITS branch (a deactivated membership is no membership and is never passed in).
export type LoginMembership = BranchSwitches & { role: Role };

/// What a person is, for the rule: whether they are a superadmin and their active memberships.
export type LoginPerson = { isSuperAdmin: boolean; memberships: readonly LoginMembership[] };

/// A membership row as the database returns it with its branch's two columns, flattened into what the rules take.
export function toLoginMembership(row: { role: Role; branch: BranchSwitches }): LoginMembership {
  return { role: row.role, studentLoginEnabled: row.branch.studentLoginEnabled, parentLoginEnabled: row.branch.parentLoginEnabled };
}

/// Does this membership get its holder in on the strength of its own branch's switch? A STUDENT membership needs that branch's student switch, a PARENT membership that branch's parent
/// switch. Any other role is not about these switches at all.
export function membershipOpen(membership: LoginMembership): boolean {
  if (membership.role === "STUDENT") return membership.studentLoginEnabled;
  if (membership.role === "PARENT") return membership.parentLoginEnabled;
  return true;
}

/// Is this person's sign-in closed by the switches? Only for a person whose active roles are ALL student and/or parent, and none of whose memberships is in a branch that is open for that
/// role. A membership in a closed branch does not count, and one in an open branch does: a person attached to several branches works in the branches that are open and only those (the pages
/// and the API already limit them to the branches they belong to). Any other active role (administrator, teaching or non-teaching staff) is never affected, and a person who is both a parent
/// and a member of staff signs in as before. A superadmin is never affected. Someone with no active membership is not this rule's business (the portal rule and the pages decide what they
/// see), so it never closes them.
export function loginClosedFor(person: LoginPerson): boolean {
  if (person.memberships.length === 0 || person.isSuperAdmin) return false;
  if (!person.memberships.every((m) => m.role === "STUDENT" || m.role === "PARENT")) return false;
  return !person.memberships.some(membershipOpen);
}

/// Whether ANY branch has each switch on: all that the public sign-in page of a portal can know, because it does not know the person's branch before they sign in.
export type OpenAnywhere = { student: boolean; parent: boolean };

/// Is the sign-in page of this portal closed for the whole school? Decided from the HOST alone (never from anything typed), for the notice the page shows: only when NO branch at all has
/// that portal's switch on. Only the student and the parent portals can be closed; the school's own host (null), the staff portal and the administrator portal never are.
export function portalLoginClosed(portal: Portal | null, open: OpenAnywhere): boolean {
  if (portal === "student") return !open.student;
  if (portal === "parent") return !open.parent;
  return false;
}

/// What a closed portal's sign-in page says (before anyone has typed anything). It names the portal (which is the host's, not the person's) and nothing about any account.
export const PORTAL_CLOSED_NOTICE: Record<"student" | "parent", string> = {
  student:
    "Student sign-in is closed at the moment. The school will open it when it is ready. If you need help, contact your school administrator.",
  parent:
    "Parent sign-in is closed at the moment. The school will open it when it is ready. If you need help, contact your school administrator.",
};

/// What a person is told when the credentials were RIGHT but none of their branches is open (at sign-in), or when a session they hold has stopped counting because their branch was closed
/// (on a request). Said at sign-in only after the password (and the second factor, when there is one) has been proved, so it tells nobody anything they do not already know; every refusal
/// BEFORE that point is the one generic "Invalid email or password".
export const LOGIN_CLOSED_CODE = "LOGIN_CLOSED";
export const LOGIN_CLOSED_MESSAGE =
  "Sign-in for your school is closed at the moment. Please try again later or contact your school administrator.";

// ---- who may change what ----

/// What an administrator may switch: `branchIds` are the branches where they hold an active ADMIN membership (`adminScope`); a superadmin may switch every branch.
export type SwitchScope = { superAdmin: boolean; branchIds: readonly string[] };

export type TargetRefusal = { ok: false; status: 403 | 404; code: "FORBIDDEN" | "NOT_FOUND"; message: string };
export type TargetResult = { ok: true; ids: string[] } | TargetRefusal;

/// The branches a change applies to, or the refusal of the WHOLE request (nothing is changed by a refused one). `existing` is every branch that exists.
///  - `allBranches`: every branch the caller may switch (all of them for a superadmin; all of THEIR own for an administrator, never one that is not theirs).
///  - `branchIds`, administrator: every id must be one of their own branches, otherwise 403 for the whole request. Whether the other branch exists is never revealed: an unknown id and
///    another administrator's branch get the same answer.
///  - `branchIds`, superadmin: every id must exist, otherwise 404 for the whole request.
export function targetBranchIds(
  input: { branchIds?: readonly string[]; allBranches?: true },
  scope: SwitchScope,
  existing: readonly string[],
): TargetResult {
  const mine = new Set(scope.branchIds);
  const known = new Set(existing);
  if (input.allBranches) {
    const ids = existing.filter((id) => scope.superAdmin || mine.has(id));
    return ids.length > 0 ? { ok: true, ids } : { ok: false, status: 404, code: "NOT_FOUND", message: "There is no branch to change." };
  }
  const wanted = input.branchIds ?? [];
  if (wanted.length === 0) return { ok: false, status: 404, code: "NOT_FOUND", message: "There is no branch to change." };
  if (scope.superAdmin) {
    return wanted.every((id) => known.has(id))
      ? { ok: true, ids: [...wanted] }
      : { ok: false, status: 404, code: "NOT_FOUND", message: "One of those branches does not exist. Nothing was changed." };
  }
  return wanted.every((id) => mine.has(id) && known.has(id))
    ? { ok: true, ids: [...wanted] }
    : { ok: false, status: 403, code: "FORBIDDEN", message: "You don't administer one of those branches. Nothing was changed." };
}

/// One branch as the screen and the API show it.
export type BranchLoginRow = BranchSwitches & { id: string; name: string };

/// One branch whose switches a change actually changed.
export type BranchChange = { id: string; name: string; before: BranchSwitches; after: BranchSwitches };

const SWITCH_WORDS: { key: keyof BranchSwitches; name: string; who: string }[] = [
  { key: "studentLoginEnabled", name: "Student", who: "Students" },
  { key: "parentLoginEnabled", name: "Parent", who: "Parents" },
];
const MAX_NAMES_SHOWN = 6;

/// "A", "A and B", "A, B and C"; past six, a count.
export function listNames(names: readonly string[]): string {
  if (names.length === 0) return "";
  if (names.length > MAX_NAMES_SHOWN) return `${names.length} branches`;
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/// What the person is told after a change: an honest account of WHAT changed and WHERE, from what the server says it changed (not from what was asked), and, for a switch turned off, what
/// that does to people who are signed in. Nothing changed (the values were already as asked) is said as such.
export function describeChange(changes: readonly BranchChange[]): string {
  const sentences: string[] = [];
  for (const { key, name, who } of SWITCH_WORDS) {
    const turnedOn = changes.filter((c) => !c.before[key] && c.after[key]).map((c) => c.name);
    const turnedOff = changes.filter((c) => c.before[key] && !c.after[key]).map((c) => c.name);
    if (turnedOn.length > 0) sentences.push(`${name} sign-in is now on in ${listNames(turnedOn)}.`);
    if (turnedOff.length > 0) {
      sentences.push(
        `${name} sign-in is now off in ${listNames(turnedOff)}. ${who} who are signed in there are signed out on their next click.`,
      );
    }
  }
  return sentences.length > 0 ? sentences.join(" ") : "Nothing was different, so nothing was changed.";
}
