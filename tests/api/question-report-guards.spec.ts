import "../support/env";
import { test, expect } from "@playwright/test";
import { Gender } from "@prisma/client";
import { Role, createUser, db, resetDatabase, seedInstance, type TestUser } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// Reports on questions: who sees the queue, what a pupil's report tells the reviewer, one open report each, and one resolution each.
//
//   - The queue is the reviewers': a report is read by the people who may review its question (the same rule as resolving it and as the queue of pending questions).
//   - A pupil's report shows the reviewer a role and a section and nothing else; the section is shown only once enough different pupils of it have reported the question
//     (the threshold of the small-summary switch, as for an anonymous questionnaire), and a class with no section is named by its branch, never by the class.
//   - A person has one open report on a question; two at the same moment are one.
//   - A report is resolved once, however many reviewers press the button at the same moment.
//
// The two races are tried several times over: they are a matter of timing, and one clean round proves nothing.

const PUPIL_DOB = "2013-05-10";
const ROUNDS = 4;
const AT_ONCE = 6;
const MINIMUM = 5; // bank.smallSummary.min by default

let home: { id: string; name: string };
let otherBranch: { id: string };
let teacher: TestUser;
let reviewer: TestUser;
let mathsReviewer: TestUser;
let clerk: TestUser;
let admin: TestUser;
let otherAdmin: TestUser;
let cookies: Record<"teacher" | "reviewer" | "mathsReviewer" | "clerk" | "admin" | "otherAdmin", string>;

let sectionArm: string; // a class arm whose class group is in the section "Junior Secondary"
let bareArm: string; // a class arm whose class group has no section
let sessionId: string;
let civics: { id: string };
let maths: { id: string };
let pupilCount = 0;

type Pupil = { id: string; cookie: string };

async function cookieFor(user: TestUser) {
  const res = await loginAs(user);
  expect(res.status).toBe(200);
  return cookieHeader(res.token!);
}

test.afterAll(async () => {
  await resetDatabase();
});

test.beforeEach(async () => {
  await resetDatabase();
  const branch = await seedInstance();
  home = { id: branch.id, name: (await db.branch.findUniqueOrThrow({ where: { id: branch.id } })).name };
  otherBranch = await db.branch.findFirstOrThrow({ where: { id: { not: home.id } }, orderBy: { name: "asc" } });

  teacher = await createUser({ name: "Tariq Teacher", role: Role.TEACHING_STAFF, superAdmin: false });
  reviewer = await createUser({ name: "Rashid Reviewer", role: Role.TEACHING_STAFF, superAdmin: false });
  mathsReviewer = await createUser({ name: "Maryam Maths", role: Role.TEACHING_STAFF, superAdmin: false });
  clerk = await createUser({ name: "Chidi Clerk", role: Role.NON_TEACHING_STAFF, superAdmin: false });
  admin = await createUser({ name: "Amina Admin", role: Role.ADMIN, superAdmin: false });
  otherAdmin = await createUser({ name: "Umar Other", superAdmin: false });
  await db.membership.create({ data: { userId: otherAdmin.id, branchId: otherBranch.id, role: Role.ADMIN } });

  await db.questionBankReviewer.create({ data: { userId: reviewer.id, assignedById: admin.id, scope: "GENERAL", branchId: home.id } });
  await db.questionBankReviewer.create({
    data: {
      userId: mathsReviewer.id,
      assignedById: admin.id,
      scope: "SUBJECT",
      subjectLabel: "Mathematics",
      subjectKey: "mathematics",
      branchId: home.id,
    },
  });

  cookies = {
    teacher: await cookieFor(teacher),
    reviewer: await cookieFor(reviewer),
    mathsReviewer: await cookieFor(mathsReviewer),
    clerk: await cookieFor(clerk),
    admin: await cookieFor(admin),
    otherAdmin: await cookieFor(otherAdmin),
  };

  const session = await db.academicSession.create({
    data: { branchId: home.id, label: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-07-20"), status: "ACTIVE" },
  });
  sessionId = session.id;
  const section = await db.section.create({ data: { branchId: home.id, name: "Junior Secondary" } });
  const withSection = await db.classGroup.create({ data: { branchId: home.id, name: "JSS 1", sectionId: section.id } });
  sectionArm = (await db.classArm.create({ data: { branchId: home.id, classGroupId: withSection.id, name: "Gold" } })).id;
  const bare = await db.classGroup.create({ data: { branchId: home.id, name: "Nursery 2" } });
  bareArm = (await db.classArm.create({ data: { branchId: home.id, classGroupId: bare.id, name: "Red" } })).id;

  const item = (prompt: string, subject: string) =>
    db.questionBankItem.create({
      data: {
        branchId: home.id,
        bank: "ASSESSMENT",
        type: "SINGLE",
        prompt,
        points: 1,
        subjectLabel: subject,
        subjectKey: subject.toLowerCase(),
        options: [
          { id: "A", text: "One" },
          { id: "B", text: "Two" },
        ],
        correctAnswer: "B",
        visibility: "PRACTICE",
        status: "APPROVED",
        submittedById: teacher.id,
        approvedById: reviewer.id,
        approvedAt: new Date(),
      },
    });
  civics = await item("What is the capital of Nigeria?", "Civics");
  maths = await item("What is 7 times 8?", "Mathematics");
  pupilCount = 0;
});

/** A pupil in the given class arm, signed in to the portal, who has practised the given questions. */
async function makePupil(armId: string, practised: string[] = [civics.id]): Promise<Pupil> {
  pupilCount += 1;
  const admissionNo = `2026/${String(pupilCount).padStart(4, "0")}`;
  const s = await db.studentRecord.create({
    data: {
      branchId: home.id,
      firstName: `Pupil${pupilCount}`,
      lastName: "Test",
      gender: Gender.FEMALE,
      dateOfBirth: new Date(PUPIL_DOB),
      admissionNo,
      guardianPhone: `+23480111${String(10000 + pupilCount)}`,
    },
  });
  await db.studentEnrollment.create({
    data: { studentId: s.id, branchId: home.id, sessionId, className: "Class", arm: "Arm", classArmId: armId, status: "ACTIVE" },
  });
  for (const bankItemId of practised) {
    const practice = await db.practiceSession.create({ data: { branchId: home.id, studentId: s.id, size: 1, itemIds: [bankItemId] } });
    await db.practiceAttempt.create({
      data: { sessionId: practice.id, branchId: home.id, studentId: s.id, bankItemId, version: 1, answer: "A", correct: false },
    });
  }
  const res = await api("/api/v1/portal/session", { body: { admissionNo, secret: PUPIL_DOB } });
  expect(res.status).toBe(200);
  return { id: s.id, cookie: res.setCookies[0]!.split(";")[0]! };
}

const pupilReports = (p: Pupil, itemId: string, reason = "The second option looks wrong to me.") =>
  api(`/api/v1/portal/students/${p.id}/practice/reports`, { method: "POST", cookie: p.cookie, body: { itemId, reason } });
const teacherReports = (itemId: string, reason = "The explanation is unclear to me.") =>
  api(`/api/v1/question-bank/items/${itemId}/report`, { method: "POST", cookie: cookies.teacher, body: { branchId: home.id, reason } });
const queue = (cookie: string, qs = `branchId=${home.id}`) => api(`/api/v1/question-bank/reports?${qs}`, { cookie });
const resolve = (cookie: string, reportId: string) =>
  api(`/api/v1/question-bank/reports/${reportId}`, {
    method: "PATCH",
    cookie,
    body: { outcome: "NOT_AN_ERROR", outcomeReason: "The question is right as it is." },
  });
const labelsFor = async (itemId: string): Promise<string[]> => {
  const res = await queue(cookies.reviewer, `branchId=${home.id}&itemId=${itemId}&status=ALL`);
  expect(res.status).toBe(200);
  return (res.json.data.reports as { reporter: string }[]).map((r) => r.reporter).sort();
};

test.describe("who sees the queue", () => {
  test("only the people who may review a question see its reports; everyone else gets an empty list", async () => {
    const p = await makePupil(sectionArm, [civics.id]);
    expect((await pupilReports(p, civics.id)).status).toBe(201);
    expect((await teacherReports(maths.id)).status).toBe(201);

    const count = async (cookie: string, qs?: string) => {
      const res = await queue(cookie, qs);
      expect(res.status).toBe(200);
      return (res.json.data.reports as { itemId: string }[]).map((r) => r.itemId).sort();
    };
    const both = [civics.id, maths.id].sort();

    expect(await count(cookies.reviewer), "a reviewer for every subject").toEqual(both);
    expect(await count(cookies.admin), "the administrator of the branch").toEqual(both);
    expect(await count(cookies.mathsReviewer), "a reviewer for mathematics sees mathematics only").toEqual([maths.id]);

    expect(await count(cookies.teacher), "a teacher who is not a reviewer, even of a question they wrote").toEqual([]);
    expect(await count(cookies.clerk), "non-teaching staff").toEqual([]);
    expect(
      await count(cookies.teacher, `branchId=${home.id}&itemId=${civics.id}`),
      "asking for the question by its id changes nothing",
    ).toEqual([]);

    expect(await count(cookies.otherAdmin, ""), "an administrator of another branch").toEqual([]);
    expect((await queue(cookies.otherAdmin, `branchId=${home.id}`)).status, "and asking for this branch by name").toBe(404);
  });
});

test.describe("what a pupil's report tells the reviewer", () => {
  test("the section is shown only once enough different pupils of it have reported the question", async () => {
    const pupils: Pupil[] = [];
    for (let i = 0; i < MINIMUM; i++) pupils.push(await makePupil(sectionArm));

    for (let i = 0; i < MINIMUM - 1; i++) {
      expect((await pupilReports(pupils[i]!, civics.id)).status).toBe(201);
      expect(await labelsFor(civics.id), `${i + 1} pupil(s) have reported: no section`).toEqual(Array(i + 1).fill("Pupil"));
    }
    expect((await pupilReports(pupils[MINIMUM - 1]!, civics.id)).status).toBe(201);
    expect(await labelsFor(civics.id), `${MINIMUM} pupils have reported: the section may be named`).toEqual(
      Array(MINIMUM).fill("Pupil in Junior Secondary"),
    );
  });

  test("pupils of another section, and a pupil reporting twice, do not make up the number", async () => {
    const jss = [] as Pupil[];
    for (let i = 0; i < MINIMUM - 1; i++) jss.push(await makePupil(sectionArm));
    const nursery = await makePupil(bareArm);

    for (const p of jss) expect((await pupilReports(p, civics.id)).status).toBe(201);
    expect((await pupilReports(nursery, civics.id)).status).toBe(201);
    expect(await labelsFor(civics.id), "four of the section and one of another: neither is enough").toEqual(Array(MINIMUM).fill("Pupil"));

    // The first pupil's report is resolved, and they report again: five reports of the section, four pupils.
    const first = await db.questionReport.findFirstOrThrow({ where: { reporterStudentId: jss[0]!.id, itemId: civics.id } });
    expect((await resolve(cookies.reviewer, first.id)).status).toBe(200);
    expect((await pupilReports(jss[0]!, civics.id)).status).toBe(201);
    expect(await labelsFor(civics.id), "five reports of the section from four pupils: still not enough").toEqual(
      Array(MINIMUM + 1).fill("Pupil"),
    );
  });

  test("a class with no section is named by its branch, never by the class", async () => {
    const pupils: Pupil[] = [];
    for (let i = 0; i < MINIMUM; i++) pupils.push(await makePupil(bareArm));
    for (const p of pupils) expect((await pupilReports(p, civics.id)).status).toBe(201);

    const labels = await labelsFor(civics.id);
    expect(labels).toEqual(Array(MINIMUM).fill(`Pupil in ${home.name}`));
    expect(JSON.stringify(labels), "the class is not named").not.toContain("Nursery");
  });

  test("a teacher's report is named by role and branch whatever the number of reports", async () => {
    expect((await teacherReports(maths.id)).status).toBe(201);
    expect(await labelsFor(maths.id)).toEqual([`Teacher in ${home.name}`]);
  });

  test("a pupil who practised a question twice reports the version of the latest attempt", async () => {
    const p = await makePupil(sectionArm, []);
    const practice = await db.practiceSession.create({ data: { branchId: home.id, studentId: p.id, size: 1, itemIds: [civics.id] } });
    await db.practiceAttempt.create({
      data: {
        sessionId: practice.id,
        branchId: home.id,
        studentId: p.id,
        bankItemId: civics.id,
        version: 1,
        answer: "A",
        correct: false,
        answeredAt: new Date(Date.now() - 86_400_000),
      },
    });
    await db.practiceAttempt.create({
      data: {
        sessionId: practice.id,
        branchId: home.id,
        studentId: p.id,
        bankItemId: civics.id,
        version: 2,
        answer: "A",
        correct: false,
        answeredAt: new Date(),
      },
    });

    const res = await pupilReports(p, civics.id);
    expect(res.status).toBe(201);
    const row = await db.questionReport.findUniqueOrThrow({ where: { id: res.json.data.reportId } });
    expect(row.itemVersion).toBe(2);
  });
});

test.describe("one open report each", () => {
  test("a pupil's second report of a question while the first is open is refused, and is allowed once the first is resolved", async () => {
    const p = await makePupil(sectionArm, [civics.id, maths.id]);
    const other = await makePupil(sectionArm, [civics.id]);

    const first = await pupilReports(p, civics.id);
    expect(first.status).toBe(201);
    const second = await pupilReports(p, civics.id, "I am saying it again, with other words.");
    expect(second.status).toBe(400);
    expect(second.json.error.code).toBe("ALREADY_REPORTED");
    expect(await db.questionReport.count({ where: { reporterStudentId: p.id, itemId: civics.id } }), "one row, not two").toBe(1);

    expect((await pupilReports(p, maths.id)).status, "another question").toBe(201);
    expect((await pupilReports(other, civics.id)).status, "another pupil, the same question").toBe(201);

    expect((await resolve(cookies.reviewer, first.json.data.reportId)).status).toBe(200);
    expect((await pupilReports(p, civics.id)).status, "once the first is resolved").toBe(201);
  });

  test("a teacher's second report of a question while the first is open is refused", async () => {
    expect((await teacherReports(maths.id)).status).toBe(201);
    const second = await teacherReports(maths.id, "Saying it again with other words.");
    expect(second.status).toBe(400);
    expect(second.json.error.code).toBe("ALREADY_REPORTED");
    expect((await teacherReports(civics.id)).status, "another question").toBe(201);
    expect(await db.questionReport.count({ where: { reporterUserId: teacher.id, itemId: maths.id } })).toBe(1);
  });

  test("reports made at the same moment are one report", async () => {
    const p = await makePupil(sectionArm);
    for (let round = 0; round < ROUNDS; round++) {
      await db.questionReport.deleteMany({ where: { reporterStudentId: p.id } });
      const results = await Promise.all(Array.from({ length: AT_ONCE }, () => pupilReports(p, civics.id)));
      expect(results.map((r) => r.status).sort(), `round ${round}: one 201, the rest 400`).toEqual([201, ...Array(AT_ONCE - 1).fill(400)]);
      expect(await db.questionReport.count({ where: { reporterStudentId: p.id, itemId: civics.id } }), `round ${round}: one row`).toBe(1);
    }
  });
});

test.describe("resolving a report", () => {
  test("a report is resolved once, however many reviewers press the button at the same moment", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const filed = await teacherReports(maths.id, `Round ${round}: the wording is unclear.`);
      expect(filed.status).toBe(201);
      const reportId = filed.json.data.reportId as string;

      const results = await Promise.all(Array.from({ length: AT_ONCE }, () => resolve(cookies.reviewer, reportId)));
      expect(results.map((r) => r.status).sort(), `round ${round}: one 200, the rest 400`).toEqual([200, ...Array(AT_ONCE - 1).fill(400)]);
      expect(
        await db.questionBankAudit.count({ where: { ref: reportId, action: "REPORT_RESOLVED" } }),
        `round ${round}: one audit row`,
      ).toBe(1);
    }
  });
});

// A person's reports are limited, so that one account cannot bury the queue: a pupil may have 10 reports waiting for a reviewer and 20 a day, a teacher 20 waiting and 50 a day. The day is
// the UTC day, as for the daily practice cap.
const newItem = (prompt: string) =>
  db.questionBankItem.create({
    data: {
      branchId: home.id,
      bank: "ASSESSMENT",
      type: "SINGLE",
      prompt,
      points: 1,
      subjectLabel: "Civics",
      subjectKey: "civics",
      options: [
        { id: "A", text: "One" },
        { id: "B", text: "Two" },
      ],
      correctAnswer: "B",
      visibility: "PRACTICE",
      status: "APPROVED",
      submittedById: teacher.id,
      approvedById: reviewer.id,
      approvedAt: new Date(),
    },
  });

test.describe("how many reports one person may make", () => {
  test("a pupil may have 10 reports waiting; another is refused until a reviewer has answered one", async () => {
    const items = [];
    for (let i = 0; i < 11; i++) items.push(await newItem(`Pupil limit question ${i}`));
    const p = await makePupil(
      sectionArm,
      items.map((x) => x.id),
    );
    const q = await makePupil(sectionArm, [items[10]!.id]);

    for (let i = 0; i < 10; i++) expect((await pupilReports(p, items[i]!.id)).status, `report ${i + 1}`).toBe(201);
    const over = await pupilReports(p, items[10]!.id);
    expect(over.status, over.text.slice(0, 160)).toBe(429);
    expect(over.json.error.code).toBe("REPORT_LIMIT");
    expect(await db.questionReport.count({ where: { reporterStudentId: p.id } }), "nothing was written for the eleventh").toBe(10);
    expect((await pupilReports(q, items[10]!.id)).status, "another pupil is not held back by this one's limit").toBe(201);

    const first = await db.questionReport.findFirstOrThrow({ where: { reporterStudentId: p.id } });
    expect((await resolve(cookies.reviewer, first.id)).status).toBe(200);
    expect((await pupilReports(p, items[10]!.id)).status, "a slot is free once a reviewer has answered one").toBe(201);
  });

  test("a teacher may have 20 reports waiting; another is refused", async () => {
    const items = [];
    for (let i = 0; i < 21; i++) items.push(await newItem(`Teacher limit question ${i}`));
    for (let i = 0; i < 20; i++) expect((await teacherReports(items[i]!.id)).status, `report ${i + 1}`).toBe(201);
    const over = await teacherReports(items[20]!.id);
    expect(over.status, over.text.slice(0, 160)).toBe(429);
    expect(over.json.error.code).toBe("REPORT_LIMIT");
    expect(await db.questionReport.count({ where: { reporterUserId: teacher.id } })).toBe(20);
  });

  test("a pupil may make 20 reports a day even when each is answered at once; yesterday's do not count", async () => {
    const item = await newItem("Daily limit question");
    const p = await makePupil(sectionArm, [item.id]);
    for (let i = 0; i < 20; i++) {
      expect((await pupilReports(p, item.id, `Report number ${i + 1} on this question.`)).status, `report ${i + 1}`).toBe(201);
      await db.questionReport.updateMany({
        where: { reporterStudentId: p.id, status: "OPEN" },
        data: { status: "RESOLVED", resolvedAt: new Date() },
      });
    }
    const over = await pupilReports(p, item.id, "One more, the twenty-first today.");
    expect(over.status, over.text.slice(0, 160)).toBe(429);
    expect(over.json.error.code).toBe("REPORT_LIMIT");

    await db.questionReport.updateMany({ where: { reporterStudentId: p.id }, data: { createdAt: new Date(Date.now() - 2 * 86_400_000) } });
    expect((await pupilReports(p, item.id, "A new day, a new report.")).status).toBe(201);
  });

  test("reports made at the same moment by one person cannot go over the limit", async () => {
    const items = [];
    for (let i = 0; i < 14; i++) items.push(await newItem(`Race limit question ${i}`));
    const p = await makePupil(
      sectionArm,
      items.map((x) => x.id),
    );
    for (let round = 0; round < 3; round++) {
      await db.questionReport.deleteMany({ where: { reporterStudentId: p.id } });
      const results = await Promise.all(items.map((x) => pupilReports(p, x.id)));
      expect(
        results.filter((r) => r.status === 201),
        `round ${round}: ten get in`,
      ).toHaveLength(10);
      expect(
        results.filter((r) => r.status === 429),
        `round ${round}: the rest are over the limit`,
      ).toHaveLength(4);
      expect(await db.questionReport.count({ where: { reporterStudentId: p.id } }), `round ${round}: ten rows`).toBe(10);
    }
  });
});
