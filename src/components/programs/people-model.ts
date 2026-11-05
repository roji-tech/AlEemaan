import { kindsFor, type StandingKind, type StandingValue } from "@/components/standing/model";

// What the People tab says and offers (task 0043, section 9). Pure: no fetch, no React, so the wording and the buttons-per-state rule are unit-tested. A button is a courtesy: every
// route checks the role, the branch and the school's switch again.

export type PlaceStateKey = "ACTIVE" | "SUSPENDED" | "EXPELLED" | "TERMINATED" | "ENDED_BY_SCHOOL" | "WITHDRAWN" | "COMPLETED";
export type PersonKindKey = "STUDENT" | "STAFF" | "GUARDIAN" | "ADULT" | "CHILD";
export type PlaceStatusKey = "ACTIVE" | "WITHDRAWN" | "COMPLETED";

export const KIND_TEXT: Record<PersonKindKey, string> = {
  STUDENT: "Pupil",
  STAFF: "Staff",
  GUARDIAN: "Guardian",
  ADULT: "Adult",
  CHILD: "Child",
};

export const STATE_TEXT: Record<PlaceStateKey, string> = {
  ACTIVE: "Taking part",
  SUSPENDED: "Suspended",
  EXPELLED: "Expelled",
  TERMINATED: "Terminated",
  ENDED_BY_SCHOOL: "Ended by the school",
  WITHDRAWN: "Left the program",
  COMPLETED: "Completed",
};

/// The pill's colours: the one state that is simply good is green, the ones that need a look are amber, the ones that ended something are red or neutral.
export const STATE_STYLE: Record<PlaceStateKey, string> = {
  ACTIVE: "border-ok-line bg-ok-bg text-ok-fg",
  SUSPENDED: "border-warn-line bg-warn-bg text-warn-fg",
  EXPELLED: "border-danger-line bg-danger-bg text-danger-fg",
  TERMINATED: "border-danger-line bg-danger-bg text-danger-fg",
  ENDED_BY_SCHOOL: "border-line-strong bg-surface-2 text-fg-2",
  WITHDRAWN: "border-line-strong bg-surface-2 text-fg-2",
  COMPLETED: "border-ok-line bg-ok-bg text-ok-fg",
};

export type PersonView = {
  kind: PersonKindKey;
  linked: boolean;
  status: PlaceStatusKey;
  state: PlaceStateKey;
  can: { suspend: boolean; remove: boolean };
};

export type PersonAction = "move" | "withdraw" | "reenrol" | "edit" | StandingKind;

/// The buttons a person's row offers. `open` is false when the program is archived, completed or switched off (everything is then read only).
export function actionsFor(person: PersonView, open: boolean): PersonAction[] {
  if (!open) return [];
  if (person.status === "WITHDRAWN") return ["reenrol"];
  if (person.status === "COMPLETED") return [];
  const actions: PersonAction[] = ["move", "withdraw"];
  if (person.linked) return actions;
  actions.push("edit");
  // A person typed in has a standing of their own here; it is read through the state (a suspension that has run out is no longer one).
  const standing: StandingValue = person.state === "SUSPENDED" ? "SUSPENDED" : person.state === "EXPELLED" ? "EXPELLED" : "ACTIVE";
  actions.push(...kindsFor("student", standing, person.can));
  return actions;
}

/// For a pupil or a member of staff whose place is not "taking part" because of the school's own record: where to change it ("one place to discipline a person").
export function whereToChange(person: Pick<PersonView, "kind" | "linked" | "state" | "status">): string | null {
  if (!person.linked || person.status !== "ACTIVE" || person.state === "ACTIVE") return null;
  if (person.state === "ENDED_BY_SCHOOL")
    return person.kind === "STUDENT"
      ? "This pupil's record was archived. Restore it on the Students page."
      : "This member of staff's record was archived or deactivated. Change that on the Users page.";
  return person.kind === "STUDENT" ? "Change this on the Students page." : "Change this on the Users page.";
}

export const ACTION_TEXT: Record<string, string> = {
  PERSON_ADDED: "added the person",
  PERSON_EDITED: "changed their details",
  PERSON_MOVED: "moved them to another group",
  PERSON_WITHDRAWN: "ended their place",
  PERSON_REENROLLED: "opened their place again",
  PERSON_SUSPEND: "suspended them",
  PERSON_LIFT: "lifted their suspension",
  PERSON_EXPEL: "expelled them",
  PERSON_REINSTATE: "reinstated them",
  CLASS_ADDED: "added a class",
};

export const SKIP_TEXT: Record<string, string> = {
  ALREADY_IN: "already in the program",
  LEFT_ALREADY: "has left the program (re-enrol them instead)",
  ARCHIVED: "archived",
  EXPELLED: "expelled",
};
