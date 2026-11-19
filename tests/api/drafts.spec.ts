import "../support/env";
import { test, expect } from "@playwright/test";
import { Gender, Role } from "@prisma/client";
import { createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// Task 0101 D1 (batch 3a) over real HTTP: draft staff and draft pupils. A draft is saved with only the names (and the kind / the gender), is completed only when it has what a finished record
// needs (and says what is missing when it does not), and is left out of everything that counts people or acts on them. Who may do each is checked first.

let home: { id: string };
let other: { id: string };
test.afterAll(async () => {
  await resetDatabase();
});
test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();
  other = await db.branch.findFirstOrThrow({ where: { id: { not: home.id } }, orderBy: { name: "asc" } });
});

const asRole = async (role: Role, branchIds: string[] = [home.id]) => {
  const user = await createUser();
  for (const branchId of branchIds) await db.membership.create({ data: { userId: user.id, branchId, role } });
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
};
// A superadmin holds at least one membership (a flag alone grants nothing); `role: ADMIN` gives both, and every branch can then be administered.
const superAdmin = async () => {
  const user = await createUser({ role: Role.ADMIN });
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
};
const details = (res: { json: { error?: { details?: { path: string; message: string }[] } } }) =>
  (res.json.error?.details ?? []).filter((d) => d.path === "missing").map((d) => d.message);

let n = 0;
const staffBody = (extra: object = {}) => ({ branchId: home.id, category: "TEACHING", firstName: `Ada${++n}`, lastName: "Obi", ...extra });
const createStaff = (cookie: string, extra: object = {}) => api("/api/v1/staff", { method: "POST", cookie, body: staffBody(extra) });
const listStaff = (cookie: string, branchId = home.id) => api(`/api/v1/staff?branchId=${branchId}&status=live&q=`, { cookie });

async function classOf(name = "Basic 3", arm = "A") {
  const session =
    (await db.academicSession.findFirst({ where: { branchId: home.id, status: "ACTIVE" } })) ??
    (await db.academicSession.create({
      data: { branchId: home.id, label: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-07-31"), status: "ACTIVE" },
    }));
  const group =
    (await db.classGroup.findFirst({ where: { branchId: home.id, name } })) ??
    (await db.classGroup.create({ data: { branchId: home.id, name } }));
  const classArm = await db.classArm.create({ data: { branchId: home.id, classGroupId: group.id, name: arm } });
  return { session, group, arm: classArm };
}
async function pupil(first: string, opts: { draft?: boolean; into?: Awaited<ReturnType<typeof classOf>> } = {}) {
  const student = await db.studentRecord.create({
    data: {
      branchId: home.id,
      firstName: first,
      lastName: "Aliyu",
      gender: Gender.FEMALE,
      dateOfBirth: new Date("2017-03-04"),
      admissionNo: `2026/${String(++n).padStart(4, "0")}`,
      guardianName: "Mr Aliyu",
      guardianPhone: "08031234567",
      isDraft: opts.draft ?? false,
    },
  });
  if (opts.into)
    await db.studentEnrollment.create({
      data: {
        branchId: home.id,
        studentId: student.id,
        sessionId: opts.into.session.id,
        className: opts.into.group.name,
        arm: opts.into.arm.name,
        classArmId: opts.into.arm.id,
        status: "ACTIVE",
      },
    });
  return student;
}

test.describe("draft staff", () => {
  test("saved with the names and the kind; completing is refused with the list of what is missing, then allowed once it is there; audited", async () => {
    const admin = await asRole(Role.ADMIN);
    const normal = await createStaff(admin.cookie);
    expect(normal.status).toBe(201);
    expect(normal.json.data.staff).toMatchObject({ isDraft: false, missing: [] }); // a record that is not a draft has nothing to finish

    const made = await createStaff(admin.cookie, { isDraft: true });
    expect(made.status).toBe(201);
    const draft = made.json.data.staff as { id: string; isDraft: boolean; missing: string[] };
    expect(draft.isDraft).toBe(true);
    expect(draft.missing).toEqual(["gender", "e-mail or phone"]);

    const refused = await api(`/api/v1/staff/${draft.id}/complete`, { method: "POST", cookie: admin.cookie });
    expect(refused.status).toBe(409);
    expect(refused.json.error.code).toBe("INCOMPLETE");
    expect(refused.json.error.message).toContain("Missing: gender, e-mail or phone");
    expect(details(refused)).toEqual(["gender", "e-mail or phone"]);
    expect((await db.staffRecord.findUniqueOrThrow({ where: { id: draft.id } })).isDraft).toBe(true);

    // Saved again with more: still a draft until it is completed on purpose.
    const patched = await api(`/api/v1/staff/${draft.id}`, {
      method: "PATCH",
      cookie: admin.cookie,
      body: { gender: "FEMALE", email: `ada-${Date.now()}@school.example` },
    });
    expect(patched.status).toBe(200);
    expect(patched.json.data.staff).toMatchObject({ isDraft: true, missing: [] });

    const done = await api(`/api/v1/staff/${draft.id}/complete`, { method: "POST", cookie: admin.cookie });
    expect(done.status).toBe(200);
    expect(done.json.data.staff).toMatchObject({ isDraft: false, missing: [] });
    // Completing again is safe and writes nothing more.
    expect((await api(`/api/v1/staff/${draft.id}/complete`, { method: "POST", cookie: admin.cookie })).status).toBe(200);

    expect(await db.auditLog.count({ where: { action: "STAFF_COMPLETED", targetId: draft.id } })).toBe(1);
    const completed = await db.auditLog.findFirstOrThrow({ where: { action: "STAFF_COMPLETED", targetId: draft.id } });
    expect(completed.beforeValue).toEqual({ isDraft: true });
    expect(completed.afterValue).toEqual({ isDraft: false });
    const createdAudit = await db.auditLog.findFirstOrThrow({ where: { action: "STAFF_CREATED", targetId: draft.id } });
    expect(createdAudit.afterValue).toMatchObject({ isDraft: true });
  });

  test("an update can put a record back to a draft but never clears the flag; a person in use cannot become one", async () => {
    const admin = await asRole(Role.ADMIN);
    const free = (await createStaff(admin.cookie)).json.data.staff as { id: string };
    const marked = await api(`/api/v1/staff/${free.id}`, { method: "PATCH", cookie: admin.cookie, body: { isDraft: true } });
    expect(marked.status).toBe(200);
    expect(marked.json.data.staff.isDraft).toBe(true);
    expect(await db.auditLog.count({ where: { action: "STAFF_DRAFT_SET", targetId: free.id } })).toBe(1);
    // The flag is cleared by Complete only.
    expect((await api(`/api/v1/staff/${free.id}`, { method: "PATCH", cookie: admin.cookie, body: { isDraft: false } })).status).toBe(400);

    // With a sign-in, a subject, or an invitation waiting, a record is in use: it cannot be marked as a draft.
    const member = await createUser();
    await db.membership.create({ data: { userId: member.id, branchId: home.id, role: Role.TEACHING_STAFF } });
    const signedIn = await db.staffRecord.create({
      data: { branchId: home.id, category: "TEACHING", firstName: "Linked", lastName: "Person", userId: member.id },
    });
    const refused = await api(`/api/v1/staff/${signedIn.id}`, { method: "PATCH", cookie: admin.cookie, body: { isDraft: true } });
    expect(refused.status).toBe(409);
    expect(refused.json.error.message).toMatch(/sign-in/i);
    expect((await db.staffRecord.findUniqueOrThrow({ where: { id: signedIn.id } })).isDraft).toBe(false);
  });

  test("a draft is left out: no invitation, no subjects, no class teacher, no sign-in link, no transfer, no attendance grant", async () => {
    const admin = await superAdmin();
    const draft = (await db.staffRecord.create({
      data: {
        branchId: home.id,
        category: "TEACHING",
        firstName: "Dee",
        lastName: "Raft",
        email: `dee-${Date.now()}@school.example`,
        isDraft: true,
      },
    })) as { id: string };
    const live = await db.staffRecord.create({
      data: { branchId: home.id, category: "TEACHING", firstName: "Liv", lastName: "Ing", email: `liv-${Date.now()}@school.example` },
    });
    const { group, arm } = await classOf();
    const subject = await db.subject.create({ data: { branchId: home.id, name: "English" } });
    await db.subjectOffering.create({ data: { branchId: home.id, classGroupId: group.id, subjectId: subject.id } });

    // Invitation: skipped with the reason, nothing sent; a live record in the same call is invited.
    const invited = await api("/api/v1/staff/invite", {
      method: "POST",
      cookie: admin.cookie,
      body: { branchId: home.id, staffIds: [draft.id, live.id] },
    });
    expect(invited.status).toBe(200);
    const byId = Object.fromEntries(
      (invited.json.data.outcomes as { staffId: string; result: string; why?: string }[]).map((o) => [o.staffId, o]),
    );
    expect(byId[draft.id]).toMatchObject({ result: "skipped" });
    expect(byId[draft.id].why).toMatch(/draft/i);
    expect(byId[live.id].result).toBe("invited");
    expect(await db.invitation.count({ where: { staffRecordId: draft.id } })).toBe(0);

    // Subjects.
    const assigned = await api(`/api/v1/staff/${draft.id}/assignments`, {
      method: "POST",
      cookie: admin.cookie,
      body: { subjectId: subject.id, classArmId: arm.id },
    });
    expect(assigned.status).toBe(409);
    expect(assigned.json.error.message).toMatch(/Complete this draft/);
    expect(
      (
        await api(`/api/v1/staff/${live.id}/assignments`, {
          method: "POST",
          cookie: admin.cookie,
          body: { subjectId: subject.id, classArmId: arm.id },
        })
      ).status,
    ).toBe(201);

    // Class teacher: the same route works for a live record and refuses a draft.
    const asTeacher = (staffRecordId: string) =>
      api(`/api/v1/academics/arms/${arm.id}/class-teacher`, {
        method: "PATCH",
        cookie: admin.cookie,
        body: { branchId: home.id, staffRecordId },
      });
    expect((await asTeacher(draft.id)).status).toBe(400);
    expect((await db.classArm.findUniqueOrThrow({ where: { id: arm.id } })).classTeacherId).toBeNull();
    expect((await asTeacher(live.id)).status).toBe(200);

    // Sign-in link: no accounts are offered, and a link is refused.
    const member = await createUser();
    await db.membership.create({ data: { userId: member.id, branchId: home.id, role: Role.TEACHING_STAFF } });
    const offered = await api(`/api/v1/staff/${draft.id}/account`, { cookie: admin.cookie });
    expect(offered.status).toBe(200);
    expect(offered.json.data.accounts).toEqual([]);
    const linked = await api(`/api/v1/staff/${draft.id}/account`, { method: "PUT", cookie: admin.cookie, body: { userId: member.id } });
    expect(linked.status).toBe(409);
    expect(linked.json.error.message).toMatch(/Complete this draft/);

    // Transfer: refused until it is complete.
    const moved = await api(`/api/v1/staff/${draft.id}/transfer`, {
      method: "POST",
      cookie: admin.cookie,
      body: { toBranchId: other.id, mode: "also" },
    });
    expect(moved.status).toBe(409);
    expect(moved.json.error.message).toMatch(/Complete this draft/);

    // Attendance access.
    const grant = (staffRecordId: string) =>
      api("/api/v1/academics/attendance/grants", {
        method: "POST",
        cookie: admin.cookie,
        body: { branchId: home.id, staffRecordId, classArmId: arm.id },
      });
    expect((await grant(draft.id)).status).toBe(400);
    expect((await grant(live.id)).status).toBe(201);
  });

  test("the list shows drafts with their flag, a teacher reads them but cannot complete or create one", async () => {
    const admin = await asRole(Role.ADMIN);
    const teacher = await asRole(Role.TEACHING_STAFF);
    const draft = (await createStaff(admin.cookie, { isDraft: true })).json.data.staff as { id: string };
    await createStaff(admin.cookie);
    const seen = await listStaff(teacher.cookie);
    expect(seen.status).toBe(200);
    const rows = seen.json.data.staff as { id: string; isDraft: boolean; missing: string[] }[];
    expect(rows.find((r) => r.id === draft.id)).toMatchObject({ isDraft: true, missing: ["gender", "e-mail or phone"] });
    expect(rows.filter((r) => r.isDraft)).toHaveLength(1);

    expect((await api(`/api/v1/staff/${draft.id}/complete`, { method: "POST", cookie: teacher.cookie })).status).toBe(403);
    expect((await createStaff(teacher.cookie, { isDraft: true })).status).toBe(403);
    expect((await api(`/api/v1/staff/${draft.id}/complete`, { method: "POST" })).status).toBe(401);
    // Another branch's administrator is told there is no such record.
    const elsewhere = await asRole(Role.ADMIN, [other.id]);
    expect((await api(`/api/v1/staff/${draft.id}/complete`, { method: "POST", cookie: elsewhere.cookie })).status).toBe(404);
  });
});

test.describe("draft pupils", () => {
  test("saved with the names and the gender; a class, a date of birth and a guardian are added by editing; completing is refused with the list, then allowed; audited", async () => {
    const admin = await asRole(Role.ADMIN);
    const { group, arm } = await classOf();
    const made = await api("/api/v1/students", {
      method: "POST",
      cookie: admin.cookie,
      body: { branchId: home.id, firstName: "Zainab", lastName: "Aliyu", gender: "FEMALE", isDraft: true },
    });
    expect(made.status).toBe(201);
    const id = made.json.data.student.id as string;
    expect(made.json.data.student.isDraft).toBe(true);

    const read = await api(`/api/v1/students/${id}`, { cookie: admin.cookie });
    expect(read.json.data.student).toMatchObject({
      isDraft: true,
      missing: ["date of birth", "class", "guardian name", "guardian phone or e-mail"],
    });

    const refused = await api(`/api/v1/students/${id}/complete`, { method: "POST", cookie: admin.cookie });
    expect(refused.status).toBe(409);
    expect(refused.json.error.code).toBe("INCOMPLETE");
    expect(details(refused)).toEqual(["date of birth", "class", "guardian name", "guardian phone or e-mail"]);

    // A class on an edit places a pupil who has none.
    const edited = await api(`/api/v1/students/${id}`, {
      method: "PATCH",
      cookie: admin.cookie,
      body: { dateOfBirth: "2017-03-04", guardianName: "Mr Aliyu", guardianPhone: "08031234567", className: group.name, arm: arm.name },
    });
    expect(edited.status).toBe(200);
    expect(edited.json.data.enrolled).toBe(true);
    expect(edited.json.data.student.isDraft).toBe(true);
    expect(await db.studentEnrollment.count({ where: { studentId: id, status: "ACTIVE", classArmId: arm.id } })).toBe(1);

    const done = await api(`/api/v1/students/${id}/complete`, { method: "POST", cookie: admin.cookie });
    expect(done.status).toBe(200);
    expect(done.json.data.student.isDraft).toBe(false);
    expect((await api(`/api/v1/students/${id}/complete`, { method: "POST", cookie: admin.cookie })).status).toBe(200);
    expect(await db.auditLog.count({ where: { action: "STUDENT_COMPLETED", targetId: id } })).toBe(1);
    const created = await db.auditLog.findFirstOrThrow({ where: { action: "STUDENT_CREATED", targetId: id } });
    expect(created.afterValue).toMatchObject({ isDraft: true });

    // A class on an edit never moves a pupil who is already in one (that is Promotion's job).
    const other2 = await classOf("Basic 4", "B");
    const again = await api(`/api/v1/students/${id}`, {
      method: "PATCH",
      cookie: admin.cookie,
      body: { className: other2.group.name, arm: other2.arm.name },
    });
    expect(again.status).toBe(200);
    expect(await db.studentEnrollment.count({ where: { studentId: id, status: "ACTIVE" } })).toBe(1);
    expect(await db.studentEnrollment.count({ where: { studentId: id, classArmId: arm.id } })).toBe(1);

    // And back to a draft on purpose.
    const back = await api(`/api/v1/students/${id}`, { method: "PATCH", cookie: admin.cookie, body: { isDraft: true } });
    expect(back.status).toBe(200);
    expect(back.json.data.student.isDraft).toBe(true);
    expect(await db.auditLog.count({ where: { action: "STUDENT_DRAFT_SET", targetId: id } })).toBe(1);
    expect((await api(`/api/v1/students/${id}`, { method: "PATCH", cookie: admin.cookie, body: { isDraft: false } })).status).toBe(400);
  });

  test("a draft is left out of the class, the arm count, the attendance roll and the invoices; it stays in the list and its export, with its flag", async () => {
    const admin = await asRole(Role.ADMIN);
    const cls = await classOf();
    await pupil("Aisha", { into: cls });
    const draft = await pupil("Dee", { draft: true, into: cls });

    // Class list: the arm counts one pupil, not two.
    const classes = await api(`/api/v1/academics/class-groups?branchId=${home.id}`, { cookie: admin.cookie });
    const arms = (classes.json.data.classGroups as { arms: { id: string; enrolments: number }[] }[]).flatMap((g) => g.arms);
    expect(arms.find((a) => a.id === cls.arm.id)?.enrolments).toBe(1);

    // Attendance roll.
    const roll = await api(`/api/v1/academics/attendance?branchId=${home.id}&classArmId=${cls.arm.id}`, { cookie: admin.cookie });
    expect(roll.status).toBe(200);
    expect((roll.json.data.students as { firstName: string }[]).map((s) => s.firstName)).toEqual(["Aisha"]);
    const marked = await api("/api/v1/academics/attendance", {
      method: "POST",
      cookie: admin.cookie,
      body: {
        branchId: home.id,
        classArmId: cls.arm.id,
        date: new Date().toISOString().slice(0, 10),
        records: [{ studentId: draft.id, status: "PRESENT" }],
      },
    });
    expect(marked.status).toBeGreaterThanOrEqual(400);
    expect(await db.attendanceRecord.count({ where: { studentId: draft.id } })).toBe(0);

    // Invoices: one invoice, for the pupil who counts.
    const period = await db.academicPeriod.create({
      data: {
        branchId: home.id,
        sessionId: cls.session.id,
        ordinal: 1,
        label: "1st Term",
        startDate: new Date("2026-09-01"),
        isCurrent: true,
      },
    });
    await db.feeStructure.create({
      data: { branchId: home.id, periodId: period.id, classGroupId: cls.group.id, name: "Tuition", amount: 50000 },
    });
    const generated = await api("/api/v1/finance/invoices", {
      method: "POST",
      cookie: admin.cookie,
      body: { branchId: home.id, periodId: period.id },
    });
    expect(generated.status).toBe(201);
    expect(generated.json.data.created).toBe(1);
    expect(await db.invoice.count({ where: { studentId: draft.id } })).toBe(0);

    // The list shows both, flagged, with the count of drafts; the filter narrows; a nonsense value is refused.
    const all = await api(`/api/v1/students?branchId=${home.id}`, { cookie: admin.cookie });
    const students = all.json.data.students as { firstName: string; isDraft: boolean; missing: string[] }[];
    expect(students.map((s) => s.firstName).sort()).toEqual(["Aisha", "Dee"]);
    expect(students.find((s) => s.firstName === "Dee")).toMatchObject({ isDraft: true, missing: [] }); // everything is there; it is a draft until completed
    expect(students.find((s) => s.firstName === "Aisha")).toMatchObject({ isDraft: false, missing: [] });
    expect(all.json.data.drafts).toBe(1);
    const only = await api(`/api/v1/students?branchId=${home.id}&draft=YES`, { cookie: admin.cookie });
    expect((only.json.data.students as { firstName: string }[]).map((s) => s.firstName)).toEqual(["Dee"]);
    const none = await api(`/api/v1/students?branchId=${home.id}&draft=NO`, { cookie: admin.cookie });
    expect((none.json.data.students as { firstName: string }[]).map((s) => s.firstName)).toEqual(["Aisha"]);
    expect((await api(`/api/v1/students?branchId=${home.id}&draft=MAYBE`, { cookie: admin.cookie })).status).toBe(400);

    // The export follows the list: the same filter, the same rows; "all" holds both.
    const exported = await api("/api/v1/exports", {
      method: "POST",
      cookie: admin.cookie,
      body: { kind: "pupils", branchId: home.id, scope: "shown", pupils: { q: "", show: "live", query: "&draft=YES" } },
    });
    expect(exported.status).toBe(200);
    expect((exported.json.data.rows as string[][]).map((r) => r[0])).toEqual(["Dee"]);
    const everyone = await api("/api/v1/exports", {
      method: "POST",
      cookie: admin.cookie,
      body: { kind: "pupils", branchId: home.id, scope: "all" },
    });
    expect(everyone.json.data.count).toBe(2);
  });

  test("a draft pupil has no family sign-in, and is not shown to a parent whose other child signs in", async () => {
    const cls = await classOf();
    const live = await pupil("Aisha", { into: cls });
    const draft = await pupil("Dee", { draft: true, into: cls }); // the same guardian phone: a sibling
    const signIn = (admissionNo: string, secret: string) => api("/api/v1/portal/session", { body: { admissionNo, secret } });
    const wrong = await signIn(live.admissionNo, "wrong-secret");
    expect(wrong.status).toBe(401);
    // The draft is refused with the very same answer as a wrong secret: it is not revealed to exist.
    const refused = await signIn(draft.admissionNo, "08031234567");
    expect(refused.status).toBe(401);
    expect(refused.json.error.message).toBe(wrong.json.error.message);
    const ok = await signIn(live.admissionNo, "08031234567");
    expect(ok.status).toBe(200);
    expect((ok.json.data.siblingStudents as { id: string }[]).map((s) => s.id)).toEqual([live.id]);
    expect(JSON.stringify(ok.json)).not.toContain(draft.id);
  });

  test("who may: a teacher reads drafts but cannot create, complete or mark one; another branch's administrator finds nothing", async () => {
    const admin = await asRole(Role.ADMIN);
    const teacher = await asRole(Role.TEACHING_STAFF);
    const elsewhere = await asRole(Role.ADMIN, [other.id]);
    const draft = await pupil("Dee", { draft: true });

    const seen = await api(`/api/v1/students?branchId=${home.id}`, { cookie: teacher.cookie });
    expect(seen.status).toBe(200);
    expect(seen.json.data.students[0]).toMatchObject({ isDraft: true });
    expect(
      (
        await api("/api/v1/students", {
          method: "POST",
          cookie: teacher.cookie,
          body: { branchId: home.id, firstName: "No", lastName: "Way", gender: "MALE", isDraft: true },
        })
      ).status,
    ).toBe(403);
    expect((await api(`/api/v1/students/${draft.id}/complete`, { method: "POST", cookie: teacher.cookie })).status).toBe(403);
    expect((await api(`/api/v1/students/${draft.id}`, { method: "PATCH", cookie: teacher.cookie, body: { isDraft: true } })).status).toBe(
      403,
    );
    expect((await api(`/api/v1/students/${draft.id}/complete`, { method: "POST" })).status).toBe(401);
    expect((await api(`/api/v1/students/${draft.id}/complete`, { method: "POST", cookie: elsewhere.cookie })).status).toBe(404);
    expect((await api(`/api/v1/students/${draft.id}/complete`, { method: "POST", cookie: admin.cookie })).status).toBe(409);
  });
});

test.describe("Add many as drafts", () => {
  test("staff: every row is saved as a draft when asked, normal records otherwise; the audit says which", async () => {
    const admin = await asRole(Role.ADMIN);
    const rows = (prefix: string) => [
      { line: 1, values: { category: "Teaching", firstName: `${prefix}One`, lastName: "Tester" } },
      { line: 2, values: { category: "Non-teaching", firstName: `${prefix}Two`, lastName: "Tester" } },
    ];
    const asDrafts = await api("/api/v1/staff/import", {
      method: "POST",
      cookie: admin.cookie,
      body: { branchId: home.id, dryRun: false, asDraft: true, rows: rows("Dr") },
    });
    expect(asDrafts.status).toBe(201);
    expect(asDrafts.json.data.saved).toBe(2);
    expect(await db.staffRecord.count({ where: { firstName: { startsWith: "Dr" }, isDraft: true } })).toBe(2);
    const plain = await api("/api/v1/staff/import", {
      method: "POST",
      cookie: admin.cookie,
      body: { branchId: home.id, dryRun: false, rows: rows("No") },
    });
    expect(plain.status).toBe(201);
    expect(await db.staffRecord.count({ where: { firstName: { startsWith: "No" }, isDraft: false } })).toBe(2);
    const bulk = await db.auditLog.findMany({ where: { action: "STAFF_BULK_IMPORTED" }, orderBy: { createdAt: "asc" } });
    expect(bulk.map((a) => (a.afterValue as { asDraft?: boolean }).asDraft)).toEqual([true, false]);
    // The rows' own rules still apply: a draft file with a row missing a name is refused like any other.
    const bad = await api("/api/v1/staff/import", {
      method: "POST",
      cookie: admin.cookie,
      body: {
        branchId: home.id,
        dryRun: false,
        asDraft: true,
        rows: [{ line: 1, values: { category: "Teaching", firstName: "", lastName: "Tester" } }],
      },
    });
    expect(bad.status).toBe(422);
    expect(await db.staffRecord.count({ where: { lastName: "Tester", firstName: "" } })).toBe(0);
    // Not a boolean: refused.
    expect(
      (
        await api("/api/v1/staff/import", {
          method: "POST",
          cookie: admin.cookie,
          body: { branchId: home.id, dryRun: true, asDraft: "yes", rows: rows("Zz") },
        })
      ).status,
    ).toBe(400);
  });

  test("pupils: every row is saved as a draft when asked, with its class; the audit says which", async () => {
    const admin = await asRole(Role.ADMIN);
    const cls = await classOf();
    const rows = (prefix: string) => [
      {
        line: 1,
        values: { firstName: `${prefix}Amina`, lastName: "Importer", gender: "Female", className: cls.group.name, arm: cls.arm.name },
      },
      { line: 2, values: { firstName: `${prefix}Bilal`, lastName: "Importer", gender: "Male" } },
    ];
    const asDrafts = await api("/api/v1/students/import", {
      method: "POST",
      cookie: admin.cookie,
      body: { branchId: home.id, dryRun: false, asDraft: true, rows: rows("Dr") },
    });
    expect(asDrafts.status).toBe(201);
    expect(await db.studentRecord.count({ where: { firstName: { startsWith: "Dr" }, isDraft: true } })).toBe(2);
    expect(await db.studentEnrollment.count({ where: { student: { firstName: "DrAmina" }, status: "ACTIVE" } })).toBe(1);
    const plain = await api("/api/v1/students/import", {
      method: "POST",
      cookie: admin.cookie,
      body: { branchId: home.id, dryRun: false, rows: rows("No") },
    });
    expect(plain.status).toBe(201);
    expect(await db.studentRecord.count({ where: { firstName: { startsWith: "No" }, isDraft: false } })).toBe(2);
    const bulk = await db.auditLog.findMany({ where: { action: "STUDENTS_BULK_IMPORTED" }, orderBy: { createdAt: "asc" } });
    expect(bulk.map((a) => (a.afterValue as { asDraft?: boolean }).asDraft)).toEqual([true, false]);
    // The drafts are not on the class's roll or in its count.
    const roll = await api(`/api/v1/academics/attendance?branchId=${home.id}&classArmId=${cls.arm.id}`, { cookie: admin.cookie });
    expect(roll.json.data.students.map((s: { firstName: string }) => s.firstName)).toEqual(["NoAmina"]);
  });

  test("who may: a teacher cannot import, drafts or not", async () => {
    const teacher = await asRole(Role.TEACHING_STAFF);
    const body = {
      branchId: home.id,
      dryRun: true,
      asDraft: true,
      rows: [{ line: 1, values: { category: "Teaching", firstName: "A", lastName: "B" } }],
    };
    expect((await api("/api/v1/staff/import", { method: "POST", cookie: teacher.cookie, body })).status).toBe(403);
  });
});
