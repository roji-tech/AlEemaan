import { test, expect } from "@playwright/test";
import {
  ADMISSION_WORDS,
  GENDER_WORDS,
  RESIDENCE_WORDS,
  admissionFor,
  audienceText,
  billedFor,
  parseAudienceCell,
  parseYesNo,
  verdictFor,
  type LineFacts,
  type PupilFacts,
} from "@/lib/finance/fee-audience";
import { coveredGross } from "@/lib/scholarships/rules";

// Who a fee line is for (task 0122): the real Basic 1 bill of the school, as lines.
const line = (id: string, over: Partial<LineFacts> = {}): LineFacts => ({
  id,
  admission: null,
  gender: null,
  residence: null,
  optional: false,
  ...over,
});
const lines: LineFacts[] = [
  line("fees"),
  line("uniform-m", { admission: "NEW", gender: "MALE", optional: true }),
  line("uniform-f", { admission: "NEW", gender: "FEMALE", optional: true }),
  line("lesson"),
  line("hostel", { residence: "BOARDING" }),
];
const none = new Set<string>();

test.describe("which lines a pupil is billed", () => {
  test("a new boy gets the shared lines and the boys' uniform, never the girls'", () => {
    const pupil: PupilFacts = { admission: "NEW", gender: "MALE", residence: "DAY" };
    expect(billedFor(lines, pupil, none).billed.map((l) => l.id)).toEqual(["fees", "uniform-m", "lesson"]);
  });

  test("a returning pupil is not billed the new-intake uniforms", () => {
    const pupil: PupilFacts = { admission: "RETURNING", gender: "FEMALE", residence: "DAY" };
    expect(billedFor(lines, pupil, none).billed.map((l) => l.id)).toEqual(["fees", "lesson"]);
  });

  test("an optional line the pupil opted out of is left off, and only an optional line can be opted out of", () => {
    const pupil: PupilFacts = { admission: "NEW", gender: "FEMALE", residence: "DAY" };
    expect(billedFor(lines, pupil, new Set(["uniform-f"])).billed.map((l) => l.id)).toEqual(["fees", "lesson"]);
    // An opt-out recorded against a compulsory line (the line was made optional, then not) changes nothing.
    expect(billedFor(lines, pupil, new Set(["fees"])).billed.map((l) => l.id)).toEqual(["fees", "uniform-f", "lesson"]);
    expect(verdictFor(lines[1], pupil, none)).toBe("other-audience");
  });

  test("a boarding line needs the pupil's residence: unknown is counted, not guessed", () => {
    const unknown: PupilFacts = { admission: "RETURNING", gender: "MALE", residence: null };
    expect(billedFor(lines, unknown, none)).toMatchObject({ missingResidence: 1 });
    expect(billedFor(lines, unknown, none).billed.map((l) => l.id)).toEqual(["fees", "lesson"]);
    const boarder: PupilFacts = { ...unknown, residence: "BOARDING" };
    expect(billedFor(lines, boarder, none).billed.map((l) => l.id)).toEqual(["fees", "lesson", "hostel"]);
    expect(billedFor(lines, { ...unknown, residence: "DAY" }, none).missingResidence).toBe(0);
  });

  test("a line with no conditions is for everyone, so every line made before the audience existed is unchanged", () => {
    for (const pupil of [
      { admission: "NEW", gender: "MALE", residence: null },
      { admission: "RETURNING", gender: "FEMALE", residence: "BOARDING" },
    ] as PupilFacts[])
      expect(verdictFor(line("old"), pupil, none)).toBe("billed");
  });

  test("new or returning is read from earlier enrolments", () => {
    expect(admissionFor(false)).toBe("NEW");
    expect(admissionFor(true)).toBe("RETURNING");
  });
});

test.describe("the words", () => {
  test("an audience in words", () => {
    expect(audienceText({ admission: null, gender: null, residence: null })).toBe("Everyone");
    expect(audienceText({ admission: "NEW", gender: "MALE", residence: "BOARDING" })).toBe("New pupils, Male, Boarding");
    expect(audienceText({ admission: null, gender: "FEMALE", residence: null })).toBe("Female");
  });

  test("import cells: blank means everyone, known words are read, anything else is undefined", () => {
    expect(parseAudienceCell("", ADMISSION_WORDS)).toBeNull();
    expect(parseAudienceCell(" All ", GENDER_WORDS)).toBeNull();
    expect(parseAudienceCell("New", ADMISSION_WORDS)).toBe("NEW");
    expect(parseAudienceCell("RETURNING", ADMISSION_WORDS)).toBe("RETURNING");
    expect(parseAudienceCell("girls", GENDER_WORDS)).toBe("FEMALE");
    expect(parseAudienceCell("Boarding", RESIDENCE_WORDS)).toBe("BOARDING");
    expect(parseAudienceCell("sometimes", RESIDENCE_WORDS)).toBeUndefined();
    expect(parseYesNo("")).toBe(false);
    expect(parseYesNo("Yes")).toBe(true);
    expect(parseYesNo("n")).toBe(false);
    expect(parseYesNo("maybe")).toBeUndefined();
  });
});

test.describe("what a scholarship's percent is taken of", () => {
  test("lines marked not covered are left out; an old snapshot with no marker is all covered", () => {
    expect(
      coveredGross([{ amount: "42000.00" }, { amount: "26000.00", covered: false }, { amount: "2000.00", covered: true }]).toString(),
    ).toBe("44000");
    expect(coveredGross([{ amount: "42000.00" }, { amount: "3000.00" }]).toString()).toBe("45000");
    expect(coveredGross([]).toString()).toBe("0");
  });

  test("unreadable and negative amounts add nothing", () => {
    expect(coveredGross([{ amount: "abc" }, { amount: "-5" }, { amount: "10" }]).toString()).toBe("10");
  });
});
