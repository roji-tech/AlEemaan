import type { Access, Actor } from "@/lib/portal/access";
import { allowedTabs } from "@/lib/portal/access";

// Standing: suspension, expulsion and termination on the school's own records (task 0045). The pure rules: no database, no clock (the caller passes `today`), so every
// rule is unit-tested without a server.

export const STUDENT_STANDINGS = ["ACTIVE", "SUSPENDED", "EXPELLED"] as const;
export type StudentStanding = (typeof STUDENT_STANDINGS)[number];

export const STAFF_STANDINGS = ["ACTIVE", "SUSPENDED", "TERMINATED"] as const;
export type StaffStanding = (typeof STAFF_STANDINGS)[number];

export const STANDING_ACTIONS = ["SUSPEND", "LIFT", "EXPEL", "TERMINATE", "REINSTATE"] as const;
export type StandingAction = (typeof STANDING_ACTIONS)[number];

export const MIN_REASON = 3;
export const MAX_REASON = 500;

/// "2026-11-03" for a date, in UTC: the calendar day a suspension is compared on (a date, not an instant, so no time zone moves it).
export const dayOf = (date: Date): string => date.toISOString().slice(0, 10);

/// A suspension applies from the day it starts until its end date INCLUSIVE; with no end date it applies until someone lifts it. Anything else is its stored standing.
/// (`until` and `today` are calendar days, "YYYY-MM-DD", so a plain string comparison is a date comparison.)
export function effectiveStanding<S extends string>(standing: S, until: string | null, today: string): S | "ACTIVE" {
  if (standing === "SUSPENDED" && until !== null && until < today) return "ACTIVE";
  return standing;
}

/// A pupil's standing as it applies today (an ended suspension is ACTIVE again). A value that is not a pupil's standing counts as active: the database refuses it.
export function studentStandingNow(student: { standing: string; standingUntil: Date | null }, todayDay: string): StudentStanding {
  const until = student.standingUntil ? dayOf(student.standingUntil) : null;
  const now = effectiveStanding(student.standing, until, todayDay);
  return now === "SUSPENDED" || now === "EXPELLED" ? now : "ACTIVE";
}

/// What a standing does to the portal. It only ever NARROWS the access the branch gave (like the guardian's practice ceiling): a standing can never widen anything.
///   Suspended: a pupil cannot hand in work, take quizzes or practise; a guardian is unchanged.
///   Expelled: a pupil is refused altogether (null: the caller says the one generic sign-in sentence); a guardian keeps the invoices only, so what is owed can be settled.
/// `null` also comes back when nothing is left to open (an expelled child whose guardian has no invoices section).
export function capForStanding(access: Access, actor: Actor, standing: StudentStanding): Access | null {
  if (standing === "ACTIVE") return access;
  if (standing === "SUSPENDED") {
    return actor === "PUPIL" ? { ...access, submitWork: false, takeQuizzes: false, practice: "NONE" } : access;
  }
  if (actor === "PUPIL") return null;
  const invoicesOnly: Access = {
    overview: false,
    results: false,
    invoices: access.invoices,
    materials: false,
    submitWork: false,
    takeQuizzes: false,
    // Kept as the branch gave it: it opens nothing of this child, and a guardian whose other child is in good standing is still shown that child in the same sign-in.
    siblings: access.siblings,
    practice: "NONE",
  };
  return allowedTabs(invoicesOnly).length > 0 ? invoicesOnly : null;
}

export type Refusal = "FORBIDDEN" | "SELF";

export type Who = { userId: string; superAdmin: boolean; /** administers the subject's own branch */ adminOfBranch: boolean };
export type Context = {
  scope: "BRANCH" | "SCHOOL";
  /// The ceiling setting: may an administrator of a branch suspend there? (The school's value AND the branch's; default on.)
  branchAdminMaySuspend: boolean;
  /// For a member of staff: the person's account, so nobody changes their own standing; and whether they are an administrator or a super admin.
  targetUserId?: string | null;
  targetIsAdmin?: boolean;
};

/// Who may do what (section 4.4 of the design note). Expelling, terminating, reinstating and anything school-wide are a super admin's alone; suspending and lifting a
/// suspension are also an administrator's of the subject's own branch while the ceiling allows it, and never for another administrator. Nobody acts on themselves.
export function mayAct(action: StandingAction, who: Who, context: Context): Refusal | null {
  if (context.targetUserId && context.targetUserId === who.userId) return "SELF";
  if (who.superAdmin) return null;
  if (context.scope === "SCHOOL") return "FORBIDDEN";
  if (action === "EXPEL" || action === "TERMINATE" || action === "REINSTATE") return "FORBIDDEN";
  if (!who.adminOfBranch || !context.branchAdminMaySuspend || context.targetIsAdmin) return "FORBIDDEN";
  return null;
}

/// The state an action leads to, or null when it does not apply to the state the subject is in (a suspension is lifted, not suspended again; the expelled are reinstated, not lifted).
export function standingAfter(action: StandingAction, subject: "STUDENT" | "STAFF", current: string): string | null {
  const gone = subject === "STUDENT" ? "EXPELLED" : "TERMINATED";
  switch (action) {
    case "SUSPEND":
      return current === "ACTIVE" ? "SUSPENDED" : null;
    case "LIFT":
      return current === "SUSPENDED" ? "ACTIVE" : null;
    case "EXPEL":
      return subject === "STUDENT" && (current === "ACTIVE" || current === "SUSPENDED") ? "EXPELLED" : null;
    case "TERMINATE":
      return subject === "STAFF" && (current === "ACTIVE" || current === "SUSPENDED") ? "TERMINATED" : null;
    case "REINSTATE":
      return current === gone ? "ACTIVE" : null;
  }
}

/// A suspension's end date must be a real day that is not already past.
export function suspensionEndProblem(until: string | null, today: string): string | null {
  if (until === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(until) || dayOf(new Date(`${until}T00:00:00Z`)) !== until) return "The end date must be a real date.";
  if (until < today) return "The end date can't be in the past.";
  return null;
}
