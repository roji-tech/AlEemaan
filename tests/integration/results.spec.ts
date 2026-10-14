import { test, expect } from "@playwright/test";
import { createUser, db, resetDatabase, seedInstance } from "../support/db";
import { resultsWorld } from "../support/results-world";

// Results, Slice P2a (migration 20261014120000): the database keeps a result in its branch, makes impossible numbers and half-made statuses unrepresentable, makes
// WHO / WHAT / WHEN immutable, freezes the content once a result leaves DRAFT, lets only a draft be deleted, and keeps the history append-only - whichever code writes.

let home: { id: string };
let other: { id: string };
test.afterAll(async () => {
  await resetDatabase(); // the specs leave sessions, classes and students behind; a later screen spec expects an empty branch
});
test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();
  other = await db.branch.findFirstOrThrow({ where: { id: { not: home.id } }, orderBy: { name: "asc" } });
});

const rejects = async (p: Promise<unknown>) => {
  await expect(p).rejects.toThrow();
};
const draft = async (w: Awaited<ReturnType<typeof resultsWorld>>, branchId: string, over: Record<string, unknown> = {}) => {
  const user = await createUser();
  return db.result.create({
    data: {
      branchId,
      studentId: w.student.id,
      subjectId: w.subject.id,
      periodId: w.period.id,
      classArmId: w.arm.id,
      schemeId: w.scheme.id,
      scaleId: w.scale.id,
      componentScores: [
        { name: "Test 1", max: 20, score: 15 },
        { name: "Test 2", max: 20, score: 10 },
      ],
      examScore: 40,
      examMax: 60,
      caTotal: 25,
      total: 65,
      maxScore: 100,
      gradeLetter: "C",
      gradeRemark: "Credit",
      enteredByUserId: user.id,
      ...over,
    },
  });
};
const T = new Date("2026-10-14T10:00:00Z");
const approvedFields = (by: string) => ({
  status: "APPROVED" as const,
  submittedAt: T,
  submittedByUserId: by,
  approvedAt: T,
  approvedByUserId: by,
});

test.describe("keys, numbers, shapes", () => {
  test("a result cannot point at another branch's student, subject, term, arm, scheme or scale", async () => {
    const mine = await resultsWorld(home.id);
    const theirs = await resultsWorld(other.id);
    for (const over of [
      { studentId: theirs.student.id },
      { subjectId: theirs.subject.id },
      { periodId: theirs.period.id },
      { classArmId: theirs.arm.id },
      { schemeId: theirs.scheme.id },
      { scaleId: theirs.scale.id },
    ]) {
      await rejects(draft(mine, home.id, over));
    }
    await draft(mine, home.id); // the consistent one is fine
  });

  test("one live result per student, subject and term", async () => {
    const w = await resultsWorld(home.id);
    await draft(w, home.id);
    await rejects(draft(w, home.id));
  });

  test("impossible numbers are refused: a total that is not parts + exam, over the maximum, an exam over its maximum, a blank grade", async () => {
    const w = await resultsWorld(home.id);
    await rejects(draft(w, home.id, { total: 66 })); // 25 + 40 != 66
    await rejects(draft(w, home.id, { total: 105, caTotal: 65, examScore: 40 })); // over maxScore
    await rejects(draft(w, home.id, { examScore: 61, total: 86 })); // exam above its own maximum
    await rejects(draft(w, home.id, { examScore: -1, total: 24 }));
    await rejects(draft(w, home.id, { gradeLetter: "  " }));
    await rejects(draft(w, home.id, { componentScores: { not: "an array" } }));
  });

  test("each status carries exactly its dates, people and token; a token exists only while published", async () => {
    const w = await resultsWorld(home.id);
    const author = await createUser();
    const r = await draft(w, home.id);
    await rejects(db.result.update({ where: { id: r.id }, data: { status: "SUBMITTED" } })); // no date, no submitter
    await rejects(db.result.update({ where: { id: r.id }, data: { status: "APPROVED", submittedAt: T, submittedByUserId: author.id } })); // no approval
    await db.result.update({ where: { id: r.id }, data: approvedFields(author.id) });
    await rejects(db.result.update({ where: { id: r.id }, data: { status: "PUBLISHED", publishedAt: T } })); // published without a token
    await rejects(db.result.update({ where: { id: r.id }, data: { verificationToken: "t".repeat(40), verificationHash: "h" } })); // a token on an approved result
    await db.result.update({
      where: { id: r.id },
      data: { status: "PUBLISHED", publishedAt: T, verificationToken: "t".repeat(40), verificationHash: "h".repeat(64) },
    });
    await rejects(db.result.update({ where: { id: r.id }, data: { status: "APPROVED", publishedAt: null } })); // the token must go with the unpublish
    await db.result.update({
      where: { id: r.id },
      data: { status: "APPROVED", publishedAt: null, verificationToken: null, verificationHash: null },
    });
  });
});

test.describe("immutability", () => {
  test("who, what and when never change - even on a draft", async () => {
    const w = await resultsWorld(home.id);
    const w2 = await resultsWorld(home.id, undefined, true);
    const r = await draft(w, home.id);
    await rejects(db.result.update({ where: { id: r.id }, data: { studentId: w2.student.id } }));
    await rejects(db.result.update({ where: { id: r.id }, data: { subjectId: w2.subject.id } }));
    await rejects(db.result.update({ where: { id: r.id }, data: { periodId: w2.period.id } }));
  });

  test("a draft's content can change; once it has left DRAFT the content, snapshot and author are frozen, and only the status moves", async () => {
    const w = await resultsWorld(home.id);
    const author = await createUser();
    const r = await draft(w, home.id);
    await db.result.update({ where: { id: r.id }, data: { examScore: 50, total: 75, gradeLetter: "A", gradeRemark: "Excellent" } }); // draft: fine
    await db.result.update({ where: { id: r.id }, data: { status: "SUBMITTED", submittedAt: T, submittedByUserId: author.id } });
    for (const data of [
      { examScore: 10, total: 35 },
      { gradeLetter: "F", gradeRemark: "Fail" },
      { componentScores: [] },
      { enteredByUserId: author.id },
      { maxScore: 200 },
    ]) {
      await rejects(db.result.update({ where: { id: r.id }, data }));
    }
    const other2 = await resultsWorld(home.id, undefined, true);
    await rejects(db.result.update({ where: { id: r.id }, data: { schemeId: other2.scheme.id } }));
    await rejects(db.result.update({ where: { id: r.id }, data: { classArmId: other2.arm.id } }));
    // sending it back to draft is a status move with its footprint cleared, after which the content may change again
    await db.result.update({ where: { id: r.id }, data: { status: "DRAFT", submittedAt: null, submittedByUserId: null } });
    await db.result.update({ where: { id: r.id }, data: { examScore: 20, total: 45, gradeLetter: "F", gradeRemark: "Fail" } });
  });

  test("only a draft can be deleted", async () => {
    const w = await resultsWorld(home.id);
    const author = await createUser();
    const r = await draft(w, home.id);
    await db.result.update({ where: { id: r.id }, data: { status: "SUBMITTED", submittedAt: T, submittedByUserId: author.id } });
    await rejects(db.result.delete({ where: { id: r.id } }));
    await db.result.update({ where: { id: r.id }, data: { status: "DRAFT", submittedAt: null, submittedByUserId: null } });
    await db.result.delete({ where: { id: r.id } });
    expect(await db.result.count()).toBe(0);
  });
});

test.describe("history", () => {
  test("ResultAudit is append-only: rows can be added, never changed or removed, and a deleted draft keeps its trail", async () => {
    const w = await resultsWorld(home.id);
    const actor = await createUser();
    const r = await draft(w, home.id);
    const row = await db.resultAudit.create({
      data: { branchId: home.id, resultId: r.id, actorUserId: actor.id, action: "ENTERED", toStatus: "DRAFT", toTotal: 65 },
    });
    await rejects(db.resultAudit.update({ where: { id: row.id }, data: { reason: "tampered" } }));
    await rejects(db.resultAudit.delete({ where: { id: row.id } }));
    await rejects(db.resultAudit.deleteMany({}));
    await db.result.delete({ where: { id: r.id } }); // no foreign key: the trail survives its draft
    expect(await db.resultAudit.count({ where: { resultId: r.id } })).toBe(1);
  });
});

test.describe("closing a term", () => {
  test("closing a session locks its PUBLISHED results (and only those) with a history row for the system, whichever code closes it", async () => {
    const w = await resultsWorld(home.id);
    const two = await db.studentRecord.create({
      data: {
        branchId: home.id,
        firstName: "Bola",
        lastName: "Ola",
        gender: "MALE",
        dateOfBirth: new Date("2012-01-01"),
        admissionNo: "ADM/CLOSE/2",
      },
    });
    const by = await createUser();
    const published = await draft(w, home.id);
    await db.result.update({
      where: { id: published.id },
      data: {
        ...approvedFields(by.id),
        status: "PUBLISHED",
        publishedAt: T,
        verificationToken: "p".repeat(43),
        verificationHash: "h".repeat(64),
      },
    });
    const approved = await draft(w, home.id, { studentId: two.id });
    await db.result.update({ where: { id: approved.id }, data: approvedFields(by.id) });

    await db.academicSession.update({ where: { id: w.session.id }, data: { status: "CLOSED" } });
    const after = await db.result.findMany({ orderBy: { id: "asc" } });
    expect(Object.fromEntries(after.map((r) => [r.id, r.status]))).toEqual({ [published.id]: "LOCKED", [approved.id]: "APPROVED" });
    const locked = await db.result.findUniqueOrThrow({ where: { id: published.id } });
    expect(locked.lockedAt).not.toBeNull();
    const trail = await db.resultAudit.findMany({ where: { resultId: published.id } });
    expect(trail.map((h) => [h.action, h.actorUserId, h.fromStatus, h.toStatus])).toEqual([["LOCKED", null, "PUBLISHED", "LOCKED"]]);
    expect(await db.resultAudit.count({ where: { resultId: approved.id } })).toBe(0);
  });
});

test.describe("report remarks (P2c)", () => {
  test("one row per student and term, in the student's branch; blank remarks and over-long ones are refused", async () => {
    const mine = await resultsWorld(home.id);
    const theirs = await resultsWorld(other.id);
    const by = await createUser();
    const base = { branchId: home.id, studentId: mine.student.id, periodId: mine.period.id, updatedByUserId: by.id };
    await db.reportRemark.create({ data: { ...base, teacherRemark: "A hard-working pupil." } });
    await rejects(db.reportRemark.create({ data: { ...base, principalRemark: "Second row, same term" } })); // one per student and term
    await rejects(db.reportRemark.create({ data: { ...base, studentId: theirs.student.id, periodId: theirs.period.id } })); // another branch's student under this branch
    await rejects(db.reportRemark.create({ data: { ...base, periodId: theirs.period.id } })); // another branch's term
    const two = await resultsWorld(home.id, undefined, true);
    await rejects(db.reportRemark.create({ data: { ...base, studentId: two.student.id, periodId: two.period.id, teacherRemark: "   " } })); // blank
    await rejects(
      db.reportRemark.create({ data: { ...base, studentId: two.student.id, periodId: two.period.id, principalRemark: "x".repeat(501) } }),
    );
    await db.reportRemark.create({ data: { ...base, studentId: two.student.id, periodId: two.period.id, principalRemark: "Excellent." } });
  });
});
