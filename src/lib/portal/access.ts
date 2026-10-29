// What a pupil and a guardian may do in the portal (task 0040). The portal asks for an admission number and one secret; WHICH secret was given says who is acting: the date
// of birth is the pupil, the guardian's phone, e-mail or a link token is the guardian. What each may do is not fixed in code: it is a setting of each branch (the maintainer's
// decision of 2026-10-25), with the defaults below. Pure: no database, no clock.

export const ACTORS = ["PUPIL", "GUARDIAN"] as const;
export type Actor = (typeof ACTORS)[number];

export const CAPABILITIES = ["overview", "results", "invoices", "materials", "submitWork", "takeQuizzes", "siblings"] as const;
export type Capability = (typeof CAPABILITIES)[number];

/// What the portal offers for practice questions. The practice feature itself arrives with the question bank (task 0032 slice 4); the choice is kept now so that it is
/// there when it does. NONE: nothing. SUMMARY: how many were practised and how it went, never the questions. FULL: the pupil's own practice.
export const PRACTICE_LEVELS = ["NONE", "SUMMARY", "FULL"] as const;
export type PracticeLevel = (typeof PRACTICE_LEVELS)[number];

export type Access = Record<Capability, boolean> & { practice: PracticeLevel };
export type PortalAccess = { pupil: Access; guardian: Access };

/// The key of the branch setting (`SettingValue`, scope BRANCH).
export const PORTAL_ACCESS_KEY = "portal_access";

/// The maintainer's table. A pupil sees no invoices and no siblings; a guardian sees invoices and every linked child but never submits work or takes a quiz.
export const DEFAULT_PORTAL_ACCESS: PortalAccess = {
  pupil: {
    overview: true,
    results: true,
    invoices: false,
    materials: true,
    submitWork: true,
    takeQuizzes: true,
    siblings: false,
    practice: "FULL",
  },
  guardian: {
    overview: true,
    results: true,
    invoices: true,
    materials: true,
    submitWork: false,
    takeQuizzes: false,
    siblings: true,
    practice: "SUMMARY",
  },
};

const copy = (access: Access): Access => ({ ...access });

const isLevel = (value: unknown): value is PracticeLevel =>
  typeof value === "string" && (PRACTICE_LEVELS as readonly string[]).includes(value);

function resolveActor(raw: unknown, fallback: Access): Access {
  const out = copy(fallback);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const stored = raw as Record<string, unknown>;
  for (const key of CAPABILITIES) if (typeof stored[key] === "boolean") out[key] = stored[key];
  if (isLevel(stored.practice)) out.practice = stored.practice;
  return out;
}

/// The effective access from a stored value. Tolerant on purpose: a missing row, a missing actor, a missing or unknown key all fall back to the default for that key, so a
/// later release can add a capability without a migration, and a hand-edited row can never make the portal throw. A value of the wrong type is ignored, never trusted.
export function resolvePortalAccess(raw: unknown): PortalAccess {
  const stored = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    pupil: resolveActor(stored.pupil, DEFAULT_PORTAL_ACCESS.pupil),
    guardian: resolveActor(stored.guardian, DEFAULT_PORTAL_ACCESS.guardian),
  };
}

/// The lower of two practice levels (NONE < SUMMARY < FULL).
export const lowerLevel = (a: PracticeLevel, b: PracticeLevel): PracticeLevel => (PRACTICE_LEVELS.indexOf(a) <= PRACTICE_LEVELS.indexOf(b) ? a : b);

/// The access with a guardian's practice level held to a school-wide ceiling (`bank.parents.view`): the lower of the branch's own level and the ceiling. The pupil's level is
/// not touched: the ceiling is about what a guardian sees of a child, not about the child's own practice.
export const capGuardianPractice = (access: PortalAccess, ceiling: PracticeLevel): PortalAccess => ({
  pupil: access.pupil,
  guardian: { ...access.guardian, practice: lowerLevel(access.guardian.practice, ceiling) },
});

export const accessFor = (access: PortalAccess, actor: Actor): Access => (actor === "PUPIL" ? access.pupil : access.guardian);

/// The tabs, in the order the portal shows them, with the capability each needs. The first one an actor may open is where the portal lands.
export const PORTAL_TABS = [
  { tab: "overview", capability: "overview" },
  { tab: "results", capability: "results" },
  { tab: "finance", capability: "invoices" },
  { tab: "lms", capability: "materials" },
] as const satisfies readonly { tab: string; capability: Capability }[];
export type PortalTab = (typeof PORTAL_TABS)[number]["tab"];

export const allowedTabs = (access: Access): PortalTab[] =>
  PORTAL_TABS.filter((entry) => access[entry.capability]).map((entry) => entry.tab);

export type PortalAccessProblem = { path: string[]; message: string };

/// What is wrong with a whole value, in words, or an empty list. The rules that a bare shape cannot say: an actor must keep at least one section (a sign-in that opens an empty
/// portal is a dead end), and handing in work or taking a quiz needs the coursework section they belong to. Plain code, no schema library, so the Settings screen (a client
/// component) can use the very same check as the server without shipping zod to the browser (zod looks for `eval` when it loads, which the app's Content-Security-Policy reports).
export function portalAccessProblems(value: PortalAccess): PortalAccessProblem[] {
  const problems: PortalAccessProblem[] = [];
  for (const actor of ["pupil", "guardian"] as const) {
    const access = value[actor];
    if (allowedTabs(access).length === 0) {
      problems.push({
        path: [actor],
        message: `A ${actor} needs at least one section of the portal: turning every one off leaves a sign-in with nothing in it.`,
      });
    }
    if ((access.submitWork || access.takeQuizzes) && !access.materials) {
      problems.push({ path: [actor, "materials"], message: `A ${actor} cannot submit work or take a quiz without access to the coursework section.` });
    }
  }
  return problems;
}

/// True when the new value gives somebody more than the old one did: a capability turned on, or a higher practice level. The audit marks such a change, because it
/// is the direction that exposes something (a pupil seeing the invoices, a guardian taking the quiz for the child).
export function widens(before: PortalAccess, after: PortalAccess): boolean {
  const rank = (level: PracticeLevel) => PRACTICE_LEVELS.indexOf(level);
  for (const actor of ["pupil", "guardian"] as const) {
    for (const key of CAPABILITIES) if (!before[actor][key] && after[actor][key]) return true;
    if (rank(after[actor].practice) > rank(before[actor].practice)) return true;
  }
  return false;
}
