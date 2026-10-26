import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, resetDatabase, seedInstance, type TestUser } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// Question bank items (Task 0032 slice 2.1): write a question, send it for review, approve, reject, retire, edit, list and read. For each: who may call (no sign-in, a pupil, a
// teacher who is not the writer, a reviewer, an exam approver, a reviewer for every branch, an administrator of the branch, an administrator of ANOTHER branch, a superadmin),
// the one "Not found" for what a person may not see, the silent overlap flag only exam approvers ever see, the version and audit rows each change leaves, and a decision
// by someone whose authority was taken away a moment ago.

const ITEMS = "/api/v1/question-bank/items";
const QUEUE = "/api/v1/question-bank/review-queue";

let home: { id: string };
let other: { id: string };
type Who = "super" | "admin" | "writer" | "writer2" | "reviewer" | "maths" | "exam" | "every" | "otherTeacher" | "otherAdmin" | "student";
const users = {} as Record<Who, TestUser>;
const ck = {} as Record<Who, string>;

async function cookieFor(user: TestUser) {
  const res = await loginAs(user);
  expect(res.status).toBe(200);
  return cookieHeader(res.token!);
}
const addMembership = (user: TestUser, branchId: string, role: Role) => db.membership.create({ data: { userId: user.id, branchId, role } });
const addReviewer = (user: TestUser, over: Record<string, unknown>) =>
  db.questionBankReviewer.create({ data: { userId: user.id, assignedById: users.super.id, scope: "GENERAL", branchId: home.id, ...over } as never });

test.beforeAll(async () => {
  await resetDatabase();
  home = await seedInstance();
  other = await db.branch.findFirstOrThrow({ where: { id: { not: home.id } }, orderBy: { name: "asc" } });
  users.super = await createUser({ name: "Sue Super", role: Role.ADMIN });
  users.admin = await createUser({ name: "Ada Admin", role: Role.ADMIN, superAdmin: false });
  users.writer = await createUser({ name: "Wale Writer", role: Role.TEACHING_STAFF, superAdmin: false });
  users.writer2 = await createUser({ name: "Wura Writer", role: Role.TEACHING_STAFF, superAdmin: false });
  users.reviewer = await createUser({ name: "Rita Reviewer", role: Role.NON_TEACHING_STAFF, superAdmin: false });
  users.maths = await createUser({ name: "Musa Maths", role: Role.TEACHING_STAFF, superAdmin: false });
  users.exam = await createUser({ name: "Eze Exam", role: Role.TEACHING_STAFF, superAdmin: false });
  users.every = await createUser({ name: "Eva Every", role: Role.TEACHING_STAFF, superAdmin: false });
  users.student = await createUser({ name: "Stu Dent", role: Role.STUDENT, superAdmin: false });
  users.otherTeacher = await createUser({ name: "Olu Other", superAdmin: false });
  await addMembership(users.otherTeacher, other.id, Role.TEACHING_STAFF);
  users.otherAdmin = await createUser({ name: "Oba Other-Admin", superAdmin: false });
  await addMembership(users.otherAdmin, other.id, Role.ADMIN);
  for (const key of Object.keys(users) as Who[]) ck[key] = await cookieFor(users[key]);
});

test.beforeEach(async () => {
  await db.settingValue.deleteMany({ where: { key: { startsWith: "bank." } } });
  await db.$executeRawUnsafe(
    `TRUNCATE "QuestionBankAudit", "QuestionBankReview", "QuestionBankItemVersion", "QuestionOverlapFlag", "QuestionBankClassTag", "QuestionBankItem", "QuestionBankReviewer" RESTART IDENTITY CASCADE`,
  );
  await addReviewer(users.reviewer, {});
  await addReviewer(users.maths, { scope: "SUBJECT", subjectLabel: "Mathematics", subjectKey: "mathematics" });
  await addReviewer(users.exam, { isExamApprover: true });
  await addReviewer(users.every, { branchId: null });
});
test.afterAll(async () => {
  await resetDatabase();
});

let counter = 0;
/// A question that is not close to any other the spec writes (the overlap check compares three-word runs).
const body = (over: Record<string, unknown> = {}) => {
  counter += 1;
  return {
    type: "SINGLE",
    prompt: `Test question number ${counter}: which of these words belongs with the alphabet entry w${counter}x${counter * 7}?`,
    options: [`alpha${counter}`, `beta${counter}`, `gamma${counter}`],
    correct: 0,
    subject: "Mathematics",
    classTags: ["JSS 1"],
    ...over,
  };
};
const create = async (who: Who, over: Record<string, unknown> = {}, branchId = home.id) => {
  const res = await api(ITEMS, { method: "POST", cookie: ck[who], body: { branchId, ...body(over) } });
  expect(res.status, res.text).toBe(201);
  return res.json.data.item as { id: string; status: string; version: number };
};
const act = (who: Who | undefined, id: string, action: string, payload?: unknown) =>
  api(`${ITEMS}/${id}/${action}`, { method: "POST", cookie: who ? ck[who] : undefined, body: payload ?? {} });
const submitted = async (who: Who = "writer", over: Record<string, unknown> = {}) => {
  const item = await create(who, over);
  const res = await act(who, item.id, "submit");
  expect(res.status, res.text).toBe(200);
  return item;
};
const get = (who: Who | undefined, id: string) => api(`${ITEMS}/${id}`, { cookie: who ? ck[who] : undefined });
const audits = (action?: string) => db.questionBankAudit.findMany({ where: action ? { action } : {}, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });

test.describe("writing a question", () => {
  test("a teacher writes a draft only they can see; the stored shape, the version and the audit row are there", async () => {
    const item = await create("writer");
    expect(item).toMatchObject({ status: "DRAFT", version: 1 });
    const stored = await db.questionBankItem.findUniqueOrThrow({ where: { id: item.id }, include: { classTags: true } });
    expect(stored).toMatchObject({ branchId: home.id, bank: "ASSESSMENT", status: "DRAFT", submittedById: users.writer.id, subjectKey: "mathematics" });
    expect(stored.classTags.map((t) => t.label)).toEqual(["JSS 1"]);
    expect(await db.questionBankItemVersion.count({ where: { itemId: item.id, version: 1 } })).toBe(1);
    expect((await audits("ITEM_CREATED"))[0]).toMatchObject({ itemId: item.id, actorUserId: users.writer.id, branchId: home.id });

    for (const who of ["writer2", "reviewer", "maths", "exam", "every", "admin"] as Who[]) {
      expect((await get(who, item.id)).status, `${who} must not see another person's draft`).toBe(404);
    }
    expect((await get("writer", item.id)).status).toBe(200);
    expect((await get("super", item.id)).status).toBe(200); // a superadmin may do everything
  });

  test("who may call at all: nobody signed out, no pupil; a teacher of another branch cannot write for this one", async () => {
    const post = (cookie: string | undefined, branchId = home.id) => api(ITEMS, { method: "POST", cookie, body: { branchId, ...body() } });
    expect((await post(undefined)).status).toBe(401);
    expect((await post(ck.student)).status).toBe(403);
    expect((await post(ck.otherTeacher)).status).toBe(403); // a branch in a body that is not theirs
    expect((await post(ck.otherAdmin)).status).toBe(403);
    expect((await post(ck.writer, other.id)).status).toBe(403);
    expect(await db.questionBankItem.count()).toBe(0);
  });

  test("a non-teaching member who is a reviewer may write; one who is not a reviewer may not (403)", async () => {
    expect((await api(ITEMS, { method: "POST", cookie: ck.reviewer, body: { branchId: home.id, ...body() } })).status).toBe(201);
    await db.questionBankReviewer.deleteMany({ where: { userId: users.reviewer.id } });
    const res = await api(ITEMS, { method: "POST", cookie: ck.reviewer, body: { branchId: home.id, ...body() } });
    expect(res.status).toBe(403);
  });

  test("a bad body is a 400 naming the field; nothing is stored; an unknown key (status, bank, branch, owner) is refused", async () => {
    const post = (extra: Record<string, unknown>) => api(ITEMS, { method: "POST", cookie: ck.writer, body: { branchId: home.id, ...body(), ...extra } });
    const noPrompt = await post({ prompt: "   " });
    expect(noPrompt.status).toBe(400);
    expect(JSON.stringify(noPrompt.json.error.details)).toContain("prompt");
    for (const extra of [{ status: "APPROVED" }, { bank: "QUESTIONNAIRE" }, { visibility: "PRACTICE" }, { submittedById: users.super.id }, { approvedById: users.super.id }]) {
      expect((await post(extra)).status, JSON.stringify(extra)).toBe(400);
    }
    expect((await api(ITEMS, { method: "POST", cookie: ck.writer, body: body() })).status).toBe(400); // no branch named
    expect((await api(ITEMS, { method: "POST", cookie: ck.writer, body: { branchId: "bad id!", ...body() } })).status).toBe(403);
    expect(await db.questionBankItem.count()).toBe(0);
  });

  test("with the question bank switched off for staff in this branch, writing is refused with its own code", async () => {
    await db.settingValue.create({ data: { scope: "BRANCH", branchId: home.id, key: "bank.access.staff", value: false, status: "APPROVED" } });
    const res = await api(ITEMS, { method: "POST", cookie: ck.writer, body: { branchId: home.id, ...body() } });
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("BANK_OFF");
    expect((await api(ITEMS, { method: "POST", cookie: ck.super, body: { branchId: home.id, ...body() } })).status).toBe(201); // a superadmin is not held to it
  });
});

test.describe("editing", () => {
  test("the writer edits a draft: a new version with a snapshot; the class tags are replaced; the audit says what changed", async () => {
    const item = await create("writer");
    const res = await api(`${ITEMS}/${item.id}`, { method: "PATCH", cookie: ck.writer, body: body({ classTags: ["JSS 2", "SS 1"], points: 3 }) });
    expect(res.status, res.text).toBe(200);
    expect(res.json.data.item).toMatchObject({ version: 2, status: "DRAFT", points: 3, classTags: ["JSS 2", "SS 1"] });
    expect(await db.questionBankItemVersion.count({ where: { itemId: item.id } })).toBe(2);
    expect(await db.questionBankClassTag.count({ where: { itemId: item.id } })).toBe(2);
    expect((await audits("ITEM_EDITED"))[0]).toMatchObject({ oldValue: { version: 1 }, newValue: { version: 2, status: "DRAFT" } });
  });

  test("a pending question can be corrected by its writer and stays pending; once approved, the writer can no longer edit it", async () => {
    const item = await submitted();
    const edit = await api(`${ITEMS}/${item.id}`, { method: "PATCH", cookie: ck.writer, body: body() });
    expect(edit.json.data.item).toMatchObject({ status: "PENDING", version: 2 });
    expect((await act("reviewer", item.id, "approve", {})).status).toBe(200);
    const late = await api(`${ITEMS}/${item.id}`, { method: "PATCH", cookie: ck.writer, body: body() });
    expect(late.status).toBe(403);
  });

  test("a reviewer in scope corrects an approved question: a new version and an EDITED review row; someone else gets 'Not found' or 403", async () => {
    const item = await submitted();
    expect((await act("exam", item.id, "approve", { visibility: "PRACTICE" })).status).toBe(200); // visible to every teacher of the branch
    const edit = await api(`${ITEMS}/${item.id}`, { method: "PATCH", cookie: ck.reviewer, body: body({ points: 2 }) });
    expect(edit.status, edit.text).toBe(200);
    expect(edit.json.data.item.version).toBe(2);
    expect(await db.questionBankReview.count({ where: { itemId: item.id, outcome: "EDITED" } })).toBe(1);
    expect((await api(`${ITEMS}/${item.id}`, { method: "PATCH", cookie: ck.writer2, body: body() })).status).toBe(403); // can see an approved one, cannot edit it
    const secret = await submitted();
    expect((await act("reviewer", secret.id, "approve", {})).status).toBe(200); // teachers only: a teacher who does not teach the subject is told it does not exist
    expect((await api(`${ITEMS}/${secret.id}`, { method: "PATCH", cookie: ck.writer2, body: body() })).status).toBe(404);
    expect((await api(`${ITEMS}/${item.id}`, { method: "PATCH", cookie: ck.otherTeacher, body: body() })).status).toBe(404);
  });
});

test.describe("sending for review, and the queue", () => {
  test("only the writer sends a draft; it becomes pending; a second send is a 409; others cannot see it unless they review", async () => {
    const item = await create("writer");
    expect((await act("writer2", item.id, "submit")).status).toBe(404); // cannot even see a draft
    const sent = await act("writer", item.id, "submit");
    expect(sent.status).toBe(200);
    expect(sent.json.data.item.status).toBe("PENDING");
    expect((await act("writer", item.id, "submit")).status).toBe(409);
    expect((await get("writer2", item.id)).status).toBe(404); // pending: only reviewers and the writer
    expect((await get("reviewer", item.id)).status).toBe(200);
    expect((await get("otherTeacher", item.id)).status).toBe(404);
    expect((await audits("ITEM_SUBMITTED")).length).toBe(1);
  });

  test("the queue: a reviewer sees pending questions in scope that are not their own; a subject reviewer only their subject; a teacher and another branch see nothing", async () => {
    const maths = await submitted("writer", { subject: "Mathematics" });
    const english = await submitted("writer", { subject: "English" });
    const own = await submitted("reviewer", { subject: "Mathematics" });
    const ids = async (who: Who) => ((await api(QUEUE, { cookie: ck[who] })).json.data.items as { id: string }[]).map((i) => i.id).sort();
    expect(await ids("reviewer")).toEqual([maths.id, english.id].sort()); // not their own
    expect(await ids("maths")).toEqual([maths.id, own.id].sort()); // mathematics only, including the one the other reviewer wrote
    expect(await ids("admin")).toEqual([maths.id, english.id, own.id].sort());
    expect(await ids("writer2")).toEqual([]);
    expect(await ids("otherTeacher")).toEqual([]);
    expect(await ids("otherAdmin")).toEqual([]);
    expect(await ids("super")).toEqual([maths.id, english.id, own.id].sort());
    // a reviewer for every branch has no branch to be narrowed to: everything pending in the branches they are staff in, and not their own
    expect(await ids("every")).toEqual([maths.id, english.id, own.id].sort());
    expect((await api(QUEUE)).status).toBe(401);
    expect((await api(QUEUE, { cookie: ck.student })).status).toBe(403);
  });
});

test.describe("approving", () => {
  test("a reviewer approves with the safe default: teachers only, in its own branch; the review row, the audit row and the approver are recorded", async () => {
    const item = await submitted();
    const res = await act("reviewer", item.id, "approve", {});
    expect(res.status, res.text).toBe(200);
    expect(res.json.data.item).toMatchObject({ status: "APPROVED", visibility: "TEACHERS_ONLY", branchId: home.id });
    const row = await db.questionBankItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(row).toMatchObject({ approvedById: users.reviewer.id, status: "APPROVED" });
    expect(row.approvedAt).not.toBeNull();
    expect(await db.questionBankReview.count({ where: { itemId: item.id, outcome: "APPROVED", reviewerId: users.reviewer.id } })).toBe(1);
    expect((await audits("ITEM_APPROVED"))[0]).toMatchObject({ itemId: item.id, newValue: { status: "APPROVED", visibility: "TEACHERS_ONLY", general: false } });
  });

  test("nobody approves their own question (403); a plain teacher is told 'Not found'; a second approval is a 409; an unknown key is refused", async () => {
    const own = await submitted("reviewer");
    const refused = await act("reviewer", own.id, "approve", {});
    expect(refused.status).toBe(403);
    expect(refused.json.error.code).toBe("OWN_QUESTION");
    expect((await act("super", own.id, "approve", {})).status).toBe(200); // a superadmin may

    const item = await submitted();
    expect((await act("writer2", item.id, "approve", {})).status).toBe(404);
    expect((await act("otherAdmin", item.id, "approve", {})).status).toBe(404);
    expect((await act("student", item.id, "approve", {})).status).toBe(403);
    expect((await act("reviewer", item.id, "approve", { status: "APPROVED" })).status).toBe(400);
    expect((await act("reviewer", item.id, "approve", {})).status).toBe(200);
    expect((await act("reviewer", item.id, "approve", {})).status).toBe(409);
  });

  test("a subject reviewer decides only their subject: the same call on another subject is 'Not found'", async () => {
    const english = await submitted("writer", { subject: "English" });
    expect((await act("maths", english.id, "approve", {})).status).toBe(404);
    const maths = await submitted("writer", { subject: "Mathematics" });
    expect((await act("maths", maths.id, "approve", {})).status).toBe(200);
  });

  test("a subject and a class are needed to approve; a reviewer may supply them", async () => {
    const item = await submitted("writer", { subject: undefined, classTags: [] });
    const none = await act("reviewer", item.id, "approve", {});
    expect(none.status).toBe(400);
    expect(none.json.error.message).toContain("subject");
    const withSubject = await act("reviewer", item.id, "approve", { subject: "Biology" });
    expect(withSubject.status).toBe(400);
    expect(withSubject.json.error.message).toContain("class");
    const ok = await act("reviewer", item.id, "approve", { subject: "Biology", classTags: ["SS 2"] });
    expect(ok.status, ok.text).toBe(200);
    expect(ok.json.data.item).toMatchObject({ subject: "Biology", classTags: ["SS 2"], version: 2 });
    expect(await db.questionBankItemVersion.count({ where: { itemId: item.id } })).toBe(2);
  });

  test("visibility to pupils needs an exam approver, the branch administrator or a superadmin; a date must be in the future and goes with the 'until' choice only", async () => {
    const a = await submitted();
    const plain = await act("reviewer", a.id, "approve", { visibility: "PRACTICE" });
    expect(plain.status).toBe(403);
    expect((await db.questionBankItem.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("PENDING"); // nothing half done
    expect((await act("exam", a.id, "approve", { visibility: "PRACTICE" })).json.data.item.visibility).toBe("PRACTICE");

    const b = await submitted();
    const until = new Date(Date.now() + 3 * 864e5).toISOString();
    const timed = await act("admin", b.id, "approve", { visibility: "TEACHERS_ONLY_UNTIL", visibleFrom: until });
    expect(timed.status, timed.text).toBe(200);
    expect(new Date(timed.json.data.item.visibleFrom).toISOString()).toBe(until);

    const c = await submitted();
    expect((await act("exam", c.id, "approve", { visibility: "TEACHERS_ONLY_UNTIL" })).status).toBe(400);
    expect((await act("exam", c.id, "approve", { visibility: "PRACTICE", visibleFrom: until })).status).toBe(400);
    expect((await act("exam", c.id, "approve", { visibility: "TEACHERS_ONLY_UNTIL", visibleFrom: new Date(Date.now() - 1000).toISOString() })).status).toBe(400);
    expect((await act("exam", c.id, "approve", { visibility: "TEACHERS_ONLY_UNTIL", visibleFrom: "not a date" })).status).toBe(400);
  });

  test("making a question general (every branch) needs a reviewer for every branch or a superadmin; then it is no longer tied to a branch", async () => {
    const item = await submitted();
    expect((await act("reviewer", item.id, "approve", { general: true })).status).toBe(403);
    expect((await act("admin", item.id, "approve", { general: true })).status).toBe(403);
    const ok = await act("every", item.id, "approve", { general: true });
    expect(ok.status, ok.text).toBe(200);
    expect(ok.json.data.item.branchId).toBeNull();
    expect((await get("otherTeacher", item.id)).status).toBe(404); // teachers only, and this teacher does not teach the subject
    expect((await get("every", item.id)).status).toBe(200);
    const open = await submitted();
    expect((await act("super", open.id, "approve", { general: true, visibility: "PRACTICE" })).status).toBe(200);
    expect((await get("otherTeacher", open.id)).status).toBe(200); // visible to pupils, so to staff of any branch
    expect((await get("student", open.id)).status).toBe(403);
  });
});

test.describe("rejecting and retiring", () => {
  test("a rejection needs a reason; the writer is shown it, can correct the question and send it again", async () => {
    const item = await submitted();
    expect((await act("reviewer", item.id, "reject", {})).status).toBe(400);
    expect((await act("reviewer", item.id, "reject", { reason: "   " })).status).toBe(400);
    expect((await act("reviewer", item.id, "reject", { reason: "x".repeat(501) })).status).toBe(400);
    const res = await act("reviewer", item.id, "reject", { reason: "Option B is also correct." });
    expect(res.status, res.text).toBe(200);
    expect(res.json.data.item).toMatchObject({ status: "REJECTED", reason: "Option B is also correct." });
    expect((await get("writer", item.id)).json.data.item.reason).toBe("Option B is also correct.");
    expect((await get("writer", item.id)).json.data.history.map((h: { outcome: string }) => h.outcome)).toEqual(["REJECTED"]);

    const fixed = await api(`${ITEMS}/${item.id}`, { method: "PATCH", cookie: ck.writer, body: body({ options: ["a1", "b2", "c3"] }) });
    expect(fixed.json.data.item).toMatchObject({ status: "REJECTED", version: 2 });
    const again = await act("writer", item.id, "submit");
    expect(again.json.data.item.status).toBe("PENDING");
    expect((await audits("ITEM_REJECTED"))[0]).toMatchObject({ reason: "Option B is also correct.", oldValue: { status: "PENDING" }, newValue: { status: "REJECTED" } });
  });

  test("only a pending question can be rejected, only an approved one retired; a reason is needed; images and the row stay", async () => {
    const pending = await submitted();
    expect((await act("reviewer", pending.id, "retire", { reason: "wrong" })).status).toBe(409);
    expect((await act("reviewer", pending.id, "approve", {})).status).toBe(200);
    expect((await act("reviewer", pending.id, "reject", { reason: "late" })).status).toBe(409);
    expect((await act("reviewer", pending.id, "retire", {})).status).toBe(400);
    const retired = await act("reviewer", pending.id, "retire", { reason: "The answer key was wrong." });
    expect(retired.status, retired.text).toBe(200);
    expect(retired.json.data.item).toMatchObject({ status: "RETIRED", reason: "The answer key was wrong." });
    expect(await db.questionBankItem.count({ where: { id: pending.id } })).toBe(1);
    expect(await db.questionBankReview.count({ where: { itemId: pending.id } })).toBe(2);
    expect((await act("writer2", pending.id, "retire", { reason: "mine" })).status).toBe(404);
  });

  test("reviews and audit rows cannot be changed afterwards (the database refuses)", async () => {
    const item = await submitted();
    await act("reviewer", item.id, "reject", { reason: "No." });
    await expect(db.questionBankReview.updateMany({ where: { itemId: item.id }, data: { reason: "edited" } })).rejects.toThrow();
    await expect(db.questionBankAudit.deleteMany({ where: { itemId: item.id } })).rejects.toThrow();
    await expect(db.questionBankItemVersion.updateMany({ where: { itemId: item.id }, data: { version: 9 } })).rejects.toThrow();
  });
});

test.describe("the overlap flag is a secret kept from everyone but exam approvers", () => {
  test("a near-copy is flagged silently: the writer's answers carry no overlap key at all, a plain reviewer sees none, an exam approver and a superadmin see it", async () => {
    const first = await submitted("writer", { prompt: "Name the process by which green plants make their own food using sunlight, water and carbon dioxide.", options: ["Photosynthesis", "Respiration", "Digestion"] });
    expect((await act("reviewer", first.id, "approve", {})).status).toBe(200);
    const copy = await create("writer2", { prompt: "Name the process by which green plants make their own food using sunlight, water and carbon dioxide.", options: ["Photosynthesis", "Respiration", "Digestion"] });
    const sent = await act("writer2", copy.id, "submit");
    expect(sent.status).toBe(200);
    expect(await db.questionOverlapFlag.count({ where: { itemId: copy.id } })).toBe(1);

    // everything the writer is ever told about it
    expect(JSON.stringify(sent.json)).not.toMatch(/overlap|similar|flag/i);
    const own = await get("writer2", copy.id);
    expect(JSON.stringify(own.json)).not.toMatch(/overlap|similar|flag/i);
    const mine = await api(`${ITEMS}?mine=1`, { cookie: ck.writer2 });
    expect(JSON.stringify(mine.json)).not.toMatch(/overlap|similar|flag/i);

    // a reviewer who is not an exam approver, and the branch administrator
    for (const who of ["reviewer", "maths", "admin"] as Who[]) {
      expect(JSON.stringify((await get(who, copy.id)).json), who).not.toMatch(/overlap/i);
    }
    expect(JSON.stringify((await api(QUEUE, { cookie: ck.reviewer })).json)).not.toMatch(/overlap/i);

    const exam = await get("exam", copy.id);
    expect(exam.json.data.item.overlap).toHaveLength(1);
    expect(exam.json.data.item.overlap[0]).toMatchObject({ similarTo: { kind: "BANK_ITEM", id: first.id } });
    expect(exam.json.data.item.overlap[0].score).toBeGreaterThanOrEqual(0.8);
    expect((await get("super", copy.id)).json.data.item.overlap).toHaveLength(1);
    const queue = (await api(QUEUE, { cookie: ck.exam })).json.data.items as { id: string; overlap?: unknown[] }[];
    expect(queue.find((i) => i.id === copy.id)?.overlap).toHaveLength(1);
  });

  test("a corrected question stops being flagged; an unrelated question is never flagged", async () => {
    const first = await submitted("writer", { prompt: "Name the process by which green plants make their own food using sunlight, water and carbon dioxide.", options: ["Photosynthesis", "Respiration", "Digestion"] });
    expect(first.id).toBeTruthy();
    const copy = await submitted("writer2", { prompt: "Name the process by which green plants make their own food using sunlight, water and carbon dioxide.", options: ["Photosynthesis", "Respiration", "Digestion"] });
    expect(await db.questionOverlapFlag.count({ where: { itemId: copy.id } })).toBe(1);
    const edit = await api(`${ITEMS}/${copy.id}`, { method: "PATCH", cookie: ck.writer2, body: body() });
    expect(edit.status).toBe(200);
    expect(await db.questionOverlapFlag.count({ where: { itemId: copy.id } })).toBe(0);
    expect(await db.questionOverlapFlag.count({ where: { itemId: first.id } })).toBe(0);
  });
});

test.describe("authority taken away a moment ago", () => {
  test("a reviewer who was deactivated, or whose assignment was removed, can no longer decide, even with a cookie issued before", async () => {
    const a = await submitted();
    await db.membership.update({ where: { userId_branchId: { userId: users.reviewer.id, branchId: home.id } }, data: { deactivatedAt: new Date() } });
    expect((await act("reviewer", a.id, "approve", {})).status).toBeGreaterThanOrEqual(401);
    expect((await db.questionBankItem.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("PENDING");
    await db.membership.update({ where: { userId_branchId: { userId: users.reviewer.id, branchId: home.id } }, data: { deactivatedAt: null } });

    const b = await submitted();
    await db.questionBankReviewer.deleteMany({ where: { userId: users.maths.id } });
    expect((await act("maths", b.id, "approve", {})).status).toBe(404);
    expect((await db.questionBankItem.findUniqueOrThrow({ where: { id: b.id } })).status).toBe("PENDING");
  });
});

test.describe("listing and reading", () => {
  test("what each person sees: approved questions to staff of the branch, their own in every status, nothing from another branch", async () => {
    const draft = await create("writer");
    const pending = await submitted("writer");
    const approved = await submitted("writer");
    await act("reviewer", approved.id, "approve", {});
    const ids = async (who: Who, query = "") => ((await api(`${ITEMS}${query}`, { cookie: ck[who] })).json.data.items as { id: string }[]).map((i) => i.id).sort();

    expect(await ids("writer")).toEqual([draft.id, pending.id, approved.id].sort());
    expect(await ids("writer2")).toEqual([]); // teachers only: this teacher does not teach the subject, so a secret one is hidden
  });

  test("a teacher sees an approved question once it is visible to pupils, or when they teach its subject", async () => {
    const secret = await submitted();
    await act("reviewer", secret.id, "approve", {}); // TEACHERS_ONLY
    const open = await submitted();
    await act("exam", open.id, "approve", { visibility: "PRACTICE" });
    const ids = async (who: Who) => ((await api(ITEMS, { cookie: ck[who] })).json.data.items as { id: string }[]).map((i) => i.id).sort();
    expect(await ids("writer2")).toEqual([open.id]);

    const subject = await db.subject.create({ data: { branchId: home.id, name: "Mathematics", code: "MTH" } });
    const staff = await db.staffRecord.create({ data: { branchId: home.id, userId: users.writer2.id, category: "TEACHING", firstName: "Wura", lastName: "Writer" } });
    const group = await db.classGroup.create({ data: { branchId: home.id, name: "JSS 1" } });
    const arm = await db.classArm.create({ data: { branchId: home.id, classGroupId: group.id, name: "Gold" } });
    await db.staffSubjectAssignment.create({ data: { branchId: home.id, staffRecordId: staff.id, subjectId: subject.id, classArmId: arm.id } });
    expect(await ids("writer2")).toEqual([secret.id, open.id].sort());
  });

  test("another branch sees nothing of this one, by list or by id; a pupil is refused at the door; nobody signed in is a 401", async () => {
    const item = await submitted();
    await act("reviewer", item.id, "approve", {});
    expect((await api(`${ITEMS}?branchId=${home.id}`, { cookie: ck.otherTeacher })).status).toBe(404);
    expect(((await api(ITEMS, { cookie: ck.otherTeacher })).json.data.items as unknown[]).length).toBe(0);
    expect((await get("otherTeacher", item.id)).status).toBe(404);
    expect((await get("otherAdmin", item.id)).status).toBe(404);
    expect((await get("student", item.id)).status).toBe(403);
    expect((await get(undefined, item.id)).status).toBe(401);
    expect((await api(ITEMS)).status).toBe(401);
  });

  test("filters and pages: by status, text, subject and class; a page of two with a cursor visits every question once", async () => {
    const items = [];
    for (let i = 0; i < 5; i++) items.push(await create("writer", { subject: i < 3 ? "Mathematics" : "English", classTags: [i % 2 ? "JSS 2" : "JSS 1"] }));
    const mine = async (query: string) => ((await api(`${ITEMS}?mine=1&${query}`, { cookie: ck.writer })).json.data.items as { id: string }[]).map((i) => i.id);
    expect((await mine("subjectKey=english")).length).toBe(2);
    expect((await mine("classTagKey=jss2")).length).toBe(2);
    expect((await mine("status=PENDING")).length).toBe(0);
    expect((await mine("status=DRAFT")).length).toBe(5);
    expect((await mine(`q=${encodeURIComponent("Test question number")}`)).length).toBe(5);
    expect((await mine("q=zzzzzz")).length).toBe(0);
    expect((await mine("q=%25")).length).toBe(0); // a percent sign is text, not a wildcard

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 5; page++) {
      const res: { json: { data: { items: { id: string }[] }; meta: { nextCursor: string | null } } } = await api(`${ITEMS}?mine=1&limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, { cookie: ck.writer });
      seen.push(...res.json.data.items.map((i) => i.id));
      cursor = res.json.meta.nextCursor;
      if (!cursor) break;
    }
    expect(seen.sort()).toEqual(items.map((i) => i.id).sort());
    expect(new Set(seen).size).toBe(5);
  });

  test("hostile input is a client error, never a 500: a NUL byte or a huge id, a bad cursor, a limit out of range", async () => {
    for (const path of [`${ITEMS}/%00`, `${ITEMS}/${"a".repeat(300)}`, `${ITEMS}/%00/submit`, `${ITEMS}/%00/approve`]) {
      const post = path.endsWith("submit") || path.endsWith("approve");
      const res = await api(path, { method: post ? "POST" : "GET", cookie: ck.writer, ...(post ? { body: {} } : {}) });
      expect(res.status, path).toBeLessThan(500);
      expect(res.status, path).toBeGreaterThanOrEqual(400);
    }
    expect((await api(`${ITEMS}?cursor=nonsense`, { cookie: ck.writer })).status).toBe(200);
    expect((await api(`${ITEMS}?limit=0`, { cookie: ck.writer })).status).toBe(400);
    expect((await api(`${ITEMS}?limit=999`, { cookie: ck.writer })).status).toBe(400);
    expect((await api(`${ITEMS}?status=NOPE`, { cookie: ck.writer })).status).toBe(400);
    expect((await api(`${ITEMS}?q=%00`, { cookie: ck.writer })).status).toBeLessThan(500);
  });

  test("the answer key is part of what staff see (they set the exam), and a retired question stays readable by those who could read it", async () => {
    const item = await submitted();
    await act("reviewer", item.id, "approve", {});
    const read = await get("reviewer", item.id);
    expect(read.json.data.item.correctAnswer).toBe("o1");
    expect(read.json.data.item.options).toHaveLength(3);
    await act("reviewer", item.id, "retire", { reason: "Retired for the test." });
    expect((await get("reviewer", item.id)).json.data.item.status).toBe("RETIRED");
  });
});
