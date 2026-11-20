import { createHash } from "node:crypto";

// The four printed report cards of Al-Eeman, as result templates (task 0116, the maintainer 2026-11-20: photos of the school's four cards). Plain data, no imports from the app, so the same
// constants build the migration's backfill SQL (scripts/gen-report-template-sql.mjs prints it) AND seed a branch made later (`ensureReportTemplates`), and a unit test checks the two agree.
// Every value is editable afterwards in Results > Templates: nothing here is a rule.
//
// What is NOT here on purpose: the subjects of each card (they come from the class's subject offerings), the classes each template covers (the maintainer places them), and any letter
// grade on the pre-school and basic cards (their printed cards show marks and the 1-5 trait scale only).

export type SeedGroup = { key: string; title: string; showSign: boolean; traits: readonly string[] };
export type SeedBand = { min: number; max: number; letter: string; remark: string };
export type SeedTemplate = {
  key: "preschool" | "basic" | "junior" | "senior";
  name: string;
  description: string;
  layoutCode: "PRESCHOOL" | "BASIC" | "JUNIOR" | "SENIOR";
  scale: "plain" | "junior" | "senior";
  groups: readonly SeedGroup[];
};

/// Marks structure shared by the four (continuous assessment 40 + exam 60). The cards print "Mark obtainable" so the school's own maximums can differ: change it in Results > Templates.
export const SEED_SCHEME = {
  key: "scheme",
  name: "Report card marks (CA 40 + exam 60)",
  totalMax: 100,
  examMax: 60,
  components: [{ name: "Continuous assessment", maxScore: 40 }],
} as const;

/// `unconfirmed`: the bands are a guess the school must confirm (see D15); the junior card prints no ranges. The senior ranges are printed on the card, so that scale is confirmed. The migration
/// that adds the column flags the junior scale of every branch already seeded; `ensureReportTemplates` sets it for a branch seeded later.
export const SEED_SCALES: Record<SeedTemplate["scale"], { key: string; name: string; unconfirmed?: boolean; bands: readonly SeedBand[] }> =
  {
    // Pre-school and basic print no letter: a scale is still needed to enter marks, so this one is never shown on their card.
    plain: {
      key: "scale-plain",
      name: "Report card scale: marks only (letters not printed)",
      bands: [
        { min: 0, max: 40, letter: "F", remark: "Fail" },
        { min: 40, max: 50, letter: "D", remark: "Fair" },
        { min: 50, max: 60, letter: "C", remark: "Good" },
        { min: 60, max: 70, letter: "B", remark: "Very good" },
        { min: 70, max: 100, letter: "A", remark: "Excellent" },
      ],
    },
    // The junior card prints A Excellent, B Good, C Average, E Fair and no D. THE CUT-OFFS BELOW ARE A DEFAULT, NOT THE SCHOOL'S: the maintainer must confirm them (task 0116 D15).
    junior: {
      key: "scale-junior",
      name: "Junior secondary report card scale",
      unconfirmed: true,
      bands: [
        { min: 0, max: 50, letter: "E", remark: "Fair" },
        { min: 50, max: 60, letter: "C", remark: "Average" },
        { min: 60, max: 70, letter: "B", remark: "Good" },
        { min: 70, max: 100, letter: "A", remark: "Excellent" },
      ],
    },
    senior: {
      key: "scale-senior",
      name: "Senior secondary report card scale",
      bands: [
        { min: 0, max: 40, letter: "F9", remark: "Fail" },
        { min: 40, max: 45, letter: "E8", remark: "Pass" },
        { min: 45, max: 50, letter: "D7", remark: "Pass" },
        { min: 50, max: 55, letter: "C6", remark: "Credit" },
        { min: 55, max: 60, letter: "C5", remark: "Credit" },
        { min: 60, max: 65, letter: "C4", remark: "Credit" },
        { min: 65, max: 70, letter: "B3", remark: "Good" },
        { min: 70, max: 75, letter: "B2", remark: "Very good" },
        { min: 75, max: 100, letter: "A1", remark: "Excellent" },
      ],
    },
  };

const PSYCHOMOTOR: SeedGroup = {
  key: "psychomotor",
  title: "Psychomotor skill",
  showSign: false,
  traits: ["Verbal fluency", "Games", "Sports", "Handling tools", "Drawing and painting", "Music skills"],
};
const AFFECTIVE: SeedGroup = {
  key: "affective",
  title: "Affective domain",
  showSign: false,
  traits: [
    "Punctuality",
    "Neatness",
    "Politeness",
    "Honesty",
    "Co-operation with others",
    "Leadership",
    "Helping others",
    "Emotional stability",
    "Health",
    "Attitude to school work",
    "Attentiveness",
    "Perseverance",
    "Speaking / hand writing",
  ],
};
const CHARACTER: SeedGroup = {
  key: "character",
  title: "Character development",
  showSign: true,
  traits: ["Attentiveness in class", "Neatness", "Politeness", "Self control", "Punctuality"],
};
const PRACTICAL: SeedGroup = {
  key: "practical",
  title: "Practical skills",
  showSign: true,
  traits: ["Relationship with others", "Drama", "Clubs / society", "Hobbies", "Sport"],
};

export const SEED_TEMPLATES: readonly SeedTemplate[] = [
  {
    key: "preschool",
    name: "Pre-school (Nursery and Primary School)",
    description: "Al-Eeman pre-school report card",
    layoutCode: "PRESCHOOL",
    scale: "plain",
    groups: [PSYCHOMOTOR, AFFECTIVE],
  },
  {
    key: "basic",
    name: "Basic class (Grade 1-6)",
    description: "Al-Eeman basic school report card",
    layoutCode: "BASIC",
    scale: "plain",
    groups: [PSYCHOMOTOR, AFFECTIVE],
  },
  {
    key: "junior",
    name: "Junior Secondary (Year 7-9)",
    description: "Al-Eeman junior secondary report card",
    layoutCode: "JUNIOR",
    scale: "junior",
    groups: [CHARACTER, PRACTICAL],
  },
  {
    key: "senior",
    name: "Senior Secondary (Year 10-12)",
    description: "Al-Eeman senior secondary report card",
    layoutCode: "SENIOR",
    scale: "senior",
    groups: [CHARACTER, PRACTICAL],
  },
];

/// A seeded row's id: the same text the migration builds with SQL `'rts_' || md5(...)`, so a branch seeded by the migration and one seeded by the app never collide and each seeding is
/// idempotent. `md5` of the UTF-8 text, in lower-case hex.
export const seedId = (branchId: string, ...parts: string[]): string =>
  "rts_" +
  createHash("md5")
    .update([branchId, ...parts].join(":"))
    .digest("hex");
