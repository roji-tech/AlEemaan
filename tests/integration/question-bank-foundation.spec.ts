import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createUser, db, resetDatabase, seedInstance } from "../support/db";

// Question bank foundation (Task 0032 slice 1; migration 20261019210000_question_bank_foundation): the database itself refuses what the design note says must never
// happen, whichever code writes: a fifth image, an image without alt text, a rating question in the assessment bank, a subject reviewer without a subject, a duplicate
// reviewer, and any change to or removal of a review or an audit row. A fail-closed default: a row nobody classified is never visible to a pupil.

let home: { id: string };
let author: { id: string };
test.afterAll(async () => {
  await resetDatabase();
});
test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();
  author = await createUser();
});

const rejects = async (p: Promise<unknown>, message?: RegExp) => {
  if (message) await expect(p).rejects.toThrow(message);
  else await expect(p).rejects.toThrow();
};
const item = (over: Record<string, unknown> = {}) =>
  db.questionBankItem.create({
    data: { branchId: home.id, type: "SINGLE", prompt: "What is 2 + 2?", submittedById: author.id, ...over },
  });
const image = (itemId: string, over: Record<string, unknown> = {}) =>
  db.questionBankImage.create({
    data: { itemId, storageKey: `k/${Math.random()}`, alt: "A diagram", bytes: 1000, width: 100, height: 100, sortOrder: 0, ...over },
  });

test.describe("the migration is additive", () => {
  const sql = readFileSync(join(process.cwd(), "prisma", "migrations", "20261019210000_question_bank_foundation", "migration.sql"), "utf8");
  const statements = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  test("it creates 6 enums and 7 tables, and every table, index, constraint and trigger it touches is a new question bank one", () => {
    expect(statements.match(/^CREATE TYPE /gm)).toHaveLength(6);
    expect(statements.match(/^CREATE TABLE /gm)).toHaveLength(7);
    const touched = [
      ...statements.matchAll(
        /^(?:ALTER TABLE|CREATE (?:UNIQUE )?INDEX "[^"]+" ON|CREATE TRIGGER "[^"]+" [A-Z ]+ ON(?: [A-Z]+ "[^"]+")?)\s+"([^"]+)"/gm,
      ),
    ].map((m) => m[1]);
    expect(touched.length).toBeGreaterThan(10);
    for (const table of touched) expect(table, table).toMatch(/^Question(Bank|Overlap)/);
  });

  test("it never drops, updates, deletes or inserts anything", () => {
    expect(statements).not.toMatch(/^\s*(DROP|DELETE|UPDATE|INSERT|TRUNCATE)\b/im);
  });
});

test.describe("fail-closed defaults", () => {
  test("an item nobody classified is a TEACHERS_ONLY draft, version 1, with no options", async () => {
    const created = await item();
    expect(created.visibility).toBe("TEACHERS_ONLY");
    expect(created.status).toBe("DRAFT");
    expect(created.version).toBe(1);
    expect(created.options).toEqual([]);
    expect(created.points).toBe(1);
    expect(created.bank).toBe("ASSESSMENT");
  });

  test("a general item (no branch) is allowed; a branch that does not exist is not", async () => {
    expect((await item({ branchId: null })).branchId).toBeNull();
    await rejects(item({ branchId: "no-such-branch" }), /foreign key/i);
  });
});

test.describe("item rules", () => {
  test("blank prompt, negative points, version 0 and difficulty outside 1 to 5 are refused", async () => {
    for (const over of [
      { prompt: "" },
      { prompt: "   \n" },
      { prompt: "\t" },
      { prompt: "\u00a0\u00a0" },
      { points: -1 },
      { version: 0 },
      { difficulty: 0 },
      { difficulty: 6 },
    ]) {
      await rejects(item(over), /QuestionBankItem_sane/);
    }
    expect((await item({ points: 0, difficulty: 1 })).points).toBe(0);
    expect((await item({ difficulty: 5 })).difficulty).toBe(5);
  });

  test("a subject label and its key come together, and the key is not empty", async () => {
    await rejects(item({ subjectLabel: "Maths" }), /QuestionBankItem_sane/);
    await rejects(item({ subjectKey: "maths" }), /QuestionBankItem_sane/);
    await rejects(item({ subjectLabel: "Maths", subjectKey: "" }), /QuestionBankItem_sane/);
    expect((await item({ subjectLabel: "Maths", subjectKey: "maths" })).subjectKey).toBe("maths");
  });

  test("rating and free text belong to the questionnaire bank; a questionnaire item has no correct answer", async () => {
    await rejects(item({ type: "RATING" }), /QuestionBankItem_kind_types/);
    await rejects(item({ type: "TEXT" }), /QuestionBankItem_kind_types/);
    await rejects(item({ bank: "QUESTIONNAIRE", type: "SINGLE", correctAnswer: "a" }), /QuestionBankItem_kind_types/);
    expect((await item({ bank: "QUESTIONNAIRE", type: "RATING" })).type).toBe("RATING");
    expect((await item({ bank: "QUESTIONNAIRE", type: "TEXT", prompt: "Any comments?" })).type).toBe("TEXT");
    expect((await item({ type: "MULTI", correctAnswer: ["a", "b"] })).correctAnswer).toEqual(["a", "b"]);
  });
});

test.describe("images: at most 4, alt text required", () => {
  test("a fifth image is refused by the database, whatever its position", async () => {
    const q = await item();
    for (let i = 0; i < 4; i++) await image(q.id, { sortOrder: i });
    await rejects(image(q.id, { sortOrder: 4 }), /at most 4 images/);
    await rejects(image(q.id, { sortOrder: 99 }), /at most 4 images/);
    expect(await db.questionBankImage.count({ where: { itemId: q.id } })).toBe(4);
  });

  test("concurrent inserts cannot slip past the limit (the parent row is locked)", async () => {
    const q = await item();
    const results = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => image(q.id, { sortOrder: i })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(4);
    for (const r of results) if (r.status === "rejected") expect(String(r.reason)).toMatch(/at most 4 images/);
    expect(await db.questionBankImage.count({ where: { itemId: q.id } })).toBe(4);
  });

  test("removing an image makes room again; moving an image into a full item is refused, into a roomy one is fine", async () => {
    const full = await item();
    const roomy = await item();
    const images = [];
    for (let i = 0; i < 4; i++) images.push(await image(full.id, { sortOrder: i }));
    const spare = await image(roomy.id, { sortOrder: 0 });
    await rejects(db.questionBankImage.update({ where: { id: spare.id }, data: { itemId: full.id, sortOrder: 7 } }), /at most 4 images/);
    await db.questionBankImage.delete({ where: { id: images[0].id } });
    await image(full.id, { sortOrder: 9 });
    await db.questionBankImage.update({ where: { id: images[1].id }, data: { itemId: roomy.id, sortOrder: 5 } });
    expect(await db.questionBankImage.count({ where: { itemId: roomy.id } })).toBe(2);
  });

  test("two images cannot share a position on one item", async () => {
    const q = await item();
    await image(q.id, { sortOrder: 0 });
    await rejects(image(q.id, { sortOrder: 0 }), /unique/i);
  });

  test("alt text is required unless the image is marked decorative; sizes must be positive", async () => {
    const q = await item();
    await rejects(image(q.id, { alt: "" }), /QuestionBankImage_sane/);
    await rejects(image(q.id, { alt: "   " }), /QuestionBankImage_sane/);
    for (const blank of ["\n", "\t", "\u00a0", " \r\n\t "]) await rejects(image(q.id, { alt: blank }), /QuestionBankImage_sane/);
    await rejects(image(q.id, { bytes: 0 }), /QuestionBankImage_sane/);
    await rejects(image(q.id, { width: -5 }), /QuestionBankImage_sane/);
    expect((await image(q.id, { alt: "", decorative: true, sortOrder: 1 })).decorative).toBe(true);
  });

  test("deleting an item deletes its images and class tags", async () => {
    const q = await item();
    await image(q.id);
    await db.questionBankClassTag.create({ data: { itemId: q.id, label: "JSS 1", labelKey: "jss1" } });
    await db.questionBankItem.delete({ where: { id: q.id } });
    expect(await db.questionBankImage.count()).toBe(0);
    expect(await db.questionBankClassTag.count()).toBe(0);
  });
});

test.describe("class tags", () => {
  test("one key per item, the key is not empty, and another item may use the same key", async () => {
    const a = await item();
    const b = await item();
    await db.questionBankClassTag.create({ data: { itemId: a.id, label: "JSS 1", labelKey: "jss1" } });
    await rejects(db.questionBankClassTag.create({ data: { itemId: a.id, label: "jss-1", labelKey: "jss1" } }), /unique/i);
    await rejects(db.questionBankClassTag.create({ data: { itemId: a.id, label: "JSS 2", labelKey: "" } }), /QuestionBankClassTag_sane/);
    await rejects(db.questionBankClassTag.create({ data: { itemId: a.id, label: "  ", labelKey: "jss2" } }), /QuestionBankClassTag_sane/);
    for (const blank of ["\n", "\t", "\u00a0"])
      await rejects(
        db.questionBankClassTag.create({ data: { itemId: a.id, label: blank, labelKey: "jss2" } }),
        /QuestionBankClassTag_sane/,
      );
    await db.questionBankClassTag.create({ data: { itemId: b.id, label: "JSS 1", labelKey: "jss1" } });
    expect(await db.questionBankClassTag.count({ where: { labelKey: "jss1" } })).toBe(2);
  });
});

test.describe("reviewers", () => {
  const reviewer = (userId: string, over: Record<string, unknown> = {}) =>
    db.questionBankReviewer.create({ data: { userId, branchId: home.id, scope: "GENERAL", assignedById: author.id, ...over } });

  test("a subject reviewer needs a subject and a general one must not have one", async () => {
    const who = await createUser();
    await rejects(reviewer(who.id, { scope: "SUBJECT" }), /QuestionBankReviewer_scope/);
    await rejects(reviewer(who.id, { scope: "SUBJECT", subjectLabel: "Maths" }), /QuestionBankReviewer_scope/);
    await rejects(reviewer(who.id, { scope: "SUBJECT", subjectLabel: "Maths", subjectKey: "" }), /QuestionBankReviewer_scope/);
    await rejects(reviewer(who.id, { scope: "GENERAL", subjectLabel: "Maths", subjectKey: "maths" }), /QuestionBankReviewer_scope/);
    expect((await reviewer(who.id, { scope: "SUBJECT", subjectLabel: "Maths", subjectKey: "maths" })).scope).toBe("SUBJECT");
  });

  test("one row per person, branch, scope and subject, including for all-branch (null) rows", async () => {
    const who = await createUser();
    await reviewer(who.id);
    await rejects(reviewer(who.id), /unique/i);
    await reviewer(who.id, { branchId: null });
    await rejects(reviewer(who.id, { branchId: null }), /unique/i);
    const otherBranch = await db.branch.findFirstOrThrow({ where: { id: { not: home.id } } });
    await reviewer(who.id, { branchId: otherBranch.id });
    await reviewer(who.id, { scope: "SUBJECT", subjectLabel: "Maths", subjectKey: "maths" });
    await rejects(reviewer(who.id, { scope: "SUBJECT", subjectLabel: "MATHS", subjectKey: "maths" }), /unique/i);
    await reviewer(who.id, { scope: "SUBJECT", subjectLabel: "English", subjectKey: "english" });
    expect(await db.questionBankReviewer.count({ where: { userId: who.id } })).toBe(5);
  });

  test("the exam-approver flag is off unless set", async () => {
    const who = await createUser();
    expect((await reviewer(who.id)).isExamApprover).toBe(false);
  });
});

test.describe("append-only history", () => {
  test("a review cannot be changed or removed, and an item with reviews cannot be deleted", async () => {
    const q = await item();
    const review = await db.questionBankReview.create({
      data: { itemId: q.id, version: 1, reviewerId: author.id, outcome: "APPROVED", reason: "ok" },
    });
    await rejects(db.questionBankReview.update({ where: { id: review.id }, data: { reason: "changed my mind" } }), /append-only/);
    await rejects(db.questionBankReview.update({ where: { id: review.id }, data: { outcome: "REJECTED" } }), /append-only/);
    await rejects(db.questionBankReview.delete({ where: { id: review.id } }), /append-only/);
    await rejects(db.questionBankReview.deleteMany({ where: { itemId: q.id } }), /append-only/);
    await rejects(db.questionBankItem.delete({ where: { id: q.id } }), /foreign key|violates/i);
    const again = await db.questionBankReview.findUniqueOrThrow({ where: { id: review.id } });
    expect(again.reason).toBe("ok");
  });

  test("an audit row cannot be changed or removed; entity must be known; school-wide rows have no branch", async () => {
    const row = await db.questionBankAudit.create({
      data: {
        branchId: null,
        actorUserId: author.id,
        entity: "SETTING",
        action: "CHANGED",
        ref: "bank.practice.maxQuestions",
        oldValue: 100,
        newValue: 50,
      },
    });
    expect(row.branchId).toBeNull();
    await rejects(db.questionBankAudit.update({ where: { id: row.id }, data: { action: "x" } }), /append-only/);
    await rejects(db.questionBankAudit.delete({ where: { id: row.id } }), /append-only/);
    await rejects(db.questionBankAudit.updateMany({ data: { reason: "x" } }), /append-only/);
    await rejects(db.questionBankAudit.create({ data: { entity: "NOPE", action: "x" } }), /QuestionBankAudit_entity/);
    await db.questionBankAudit.create({ data: { branchId: home.id, itemId: "gone-later", entity: "ITEM", action: "APPROVED" } }); // itemId has no foreign key on purpose
    expect(await db.questionBankAudit.count()).toBe(2);
  });

  test("a branch with an audit trail cannot be deleted from under it", async () => {
    await db.questionBankAudit.create({ data: { branchId: home.id, entity: "REVIEWER", action: "ASSIGNED" } });
    await rejects(db.branch.delete({ where: { id: home.id } }), /foreign key|violates/i);
  });

  test("a test reset (TRUNCATE) still works with the triggers in place", async () => {
    const q = await item();
    await db.questionBankReview.create({ data: { itemId: q.id, version: 1, reviewerId: author.id, outcome: "EDITED" } });
    await db.questionBankAudit.create({ data: { entity: "ITEM", action: "EDITED", itemId: q.id } });
    await resetDatabase();
    expect(await db.questionBankReview.count()).toBe(0);
    expect(await db.questionBankAudit.count()).toBe(0);
    expect(await db.questionBankItem.count()).toBe(0);
  });
});

test.describe("overlap flags", () => {
  test("a score is between 0 and 1; a flag belongs to an item and may point at another", async () => {
    const a = await item();
    const b = await item({ prompt: "Another question" });
    await rejects(
      db.questionOverlapFlag.create({ data: { itemId: a.id, similarToItemId: b.id, score: 1.2 } }),
      /QuestionOverlapFlag_score/,
    );
    await rejects(
      db.questionOverlapFlag.create({ data: { itemId: a.id, similarToItemId: b.id, score: -0.1 } }),
      /QuestionOverlapFlag_score/,
    );
    const flag = await db.questionOverlapFlag.create({ data: { itemId: a.id, similarToItemId: b.id, score: 0.93 } });
    expect(flag.score).toBeCloseTo(0.93);
    await db.questionBankItem.delete({ where: { id: b.id } });
    expect((await db.questionOverlapFlag.findUniqueOrThrow({ where: { id: flag.id } })).similarToItemId).toBeNull(); // the flag survives, the pointer is cleared
  });
});
