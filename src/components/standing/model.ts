// What the standing screens say and offer (task 0045). Pure: no fetch, no React, so the wording and the buttons-per-state rule are unit-tested.

export type StandingValue = "ACTIVE" | "SUSPENDED" | "EXPELLED" | "TERMINATED";
export type StandingKind = "suspend" | "lift" | "expel" | "terminate" | "reinstate";
export type StandingSubject = "student" | "staff";

/// What the signed-in person may do here, as the server told the page: `suspend` covers suspend and lift, `remove` covers expel, terminate and reinstate (a super admin's alone).
export type StandingCan = { suspend: boolean; remove: boolean };

export const STANDING_TEXT: Record<StandingValue, string> = {
  ACTIVE: "In good standing",
  SUSPENDED: "Suspended",
  EXPELLED: "Expelled",
  TERMINATED: "Terminated",
};

export const KIND_TEXT: Record<StandingKind, string> = {
  suspend: "Suspend",
  lift: "Lift suspension",
  expel: "Expel",
  terminate: "Terminate",
  reinstate: "Reinstate",
};

export const EVENT_TEXT: Record<string, string> = {
  SUSPENDED: "Suspended",
  LIFTED: "Suspension lifted",
  EXPELLED: "Expelled",
  TERMINATED: "Terminated",
  REINSTATED: "Reinstated",
};

/// "Suspended until 12 Nov 2026" / "Suspended" / "Expelled".
export function standingLine(standing: StandingValue, until: string | null): string {
  if (standing === "SUSPENDED" && until) return `Suspended until ${prettyDay(until)}`;
  return STANDING_TEXT[standing];
}

/// "12 Nov 2026" from "2026-11-12", without a time zone moving the day.
export function prettyDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return day;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/// The buttons a row offers for a state. A courtesy only: every route checks the role, the branch and the school's switch again.
export function kindsFor(subject: StandingSubject, standing: StandingValue, can: StandingCan): StandingKind[] {
  const kinds: StandingKind[] = [];
  const remove: StandingKind = subject === "student" ? "expel" : "terminate";
  if (standing === "ACTIVE") {
    if (can.suspend) kinds.push("suspend");
    if (can.remove) kinds.push(remove);
  } else if (standing === "SUSPENDED") {
    if (can.suspend) kinds.push("lift");
    if (can.remove) kinds.push(remove);
  } else if (can.remove) {
    kinds.push("reinstate");
  }
  return kinds;
}

/// The sentence that says what an action does and what it does not, shown before anyone confirms it.
export function explain(kind: StandingKind, subject: StandingSubject, name: string): string {
  const pupil = subject === "student";
  switch (kind) {
    case "suspend":
      return pupil
        ? `${name} will not be able to hand in work, take quizzes or practise in the portal until the suspension ends. Their class, results and invoices do not change, and their guardian is not affected.`
        : `${name} will lose access to this branch straight away and be signed out of it. Nothing they did is deleted. The suspension ends on its own on the date you give, or when you lift it.`;
    case "lift":
      return pupil
        ? `${name} gets back everything the suspension took away.`
        : `${name} can sign in to this branch again with the same role.`;
    case "expel":
      return `${name} comes off the class lists, new invoices and result sheets, and can no longer sign in to the portal. Their records are kept. Their guardian can still see the invoices, so what is owed can be settled. Only a super admin can reinstate them.`;
    case "terminate":
      return `${name} loses access to this branch, is signed out, and their staff record is archived. Nothing they did is deleted. Only a super admin can reinstate them.`;
    case "reinstate":
      return pupil
        ? `${name} goes back on the class list of the session that is running, if there is one, and can sign in to the portal again.`
        : `${name} gets their access back with the same role, and their staff record is restored.`;
  }
}
