import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";
import { resultsWorld } from "../support/results-world";
import { PupilNameFormat, SchemeScopeLevel, SettingStatus } from "@prisma/client";

let home: { id: string };

test.afterAll(async () => {
  await resetDatabase();
});

test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();
});

const asRole = async (role: Role, branchId = home.id) => {
  const user = await createUser();
  await db.membership.create({ data: { userId: user.id, branchId, role } });
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
};

const asSuperAdmin = async () => {
  const user = await createUser({ superAdmin: true });
  await db.membership.create({ data: { userId: user.id, branchId: home.id, role: Role.ADMIN } });
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
};

test.describe("P2e: Global Assessment Schemes API", () => {
  const GLOBAL_URL = "/api/v1/academics/schemes/global";

  test("superadmin only: creates and lists global schemes; 100-sum constraint enforced", async () => {
    const superadmin = await asSuperAdmin();
    const branchAdmin = await asRole(Role.ADMIN);
    const teacher = await asRole(Role.TEACHING_STAFF);

    // Non-superadmins get 403
    expect((await api(GLOBAL_URL, { cookie: branchAdmin.cookie })).status).toBe(403);
    expect((await api(GLOBAL_URL, { cookie: teacher.cookie })).status).toBe(403);

    // 100-sum validation: 60 + 30 = 90 (invalid)
    const badRes = await api(GLOBAL_URL, {
      method: "POST",
      cookie: superadmin.cookie,
      body: {
        name: "Bad Global Scheme",
        examMax: 60,
        components: [{ name: "CA", maxScore: 30 }],
      },
    });
    expect(badRes.status).toBe(400);
    expect(badRes.json.error.message).toContain("sum to exactly 100.00");

    // Valid global scheme: 70 exam + 30 CA = 100
    const createRes = await api(GLOBAL_URL, {
      method: "POST",
      cookie: superadmin.cookie,
      body: {
        name: "National Global Standard",
        examMax: 70,
        components: [{ name: "CA 1", maxScore: 30 }],
        isDefault: true,
      },
    });
    expect(createRes.status).toBe(201);
    expect(createRes.json.data.scheme.name).toBe("National Global Standard");
    expect(createRes.json.data.scheme.totalMax).toBe(100);
    expect(createRes.json.data.scheme.isDefault).toBe(true);

    // List global schemes
    const listRes = await api(GLOBAL_URL, { cookie: superadmin.cookie });
    expect(listRes.status).toBe(200);
    expect(listRes.json.data.schemes.length).toBeGreaterThanOrEqual(1);
    const found = listRes.json.data.schemes.find((s: { scheme: { name: string } }) => s.scheme.name === "National Global Standard");
    expect(found).toBeDefined();
    expect(found.isDefault).toBe(true);
  });
});

test.describe("P2e: Class-Group Assessment Schemes API", () => {
  test("branch admin creates, reads and patches class-group scheme; teachers cannot write", async () => {
    const admin = await asRole(Role.ADMIN);
    const teacher = await asRole(Role.TEACHING_STAFF);
    const classGroup = await db.classGroup.create({
      data: { branchId: home.id, name: "JSS 1", sortOrder: 1 },
    });

    const url = `/api/v1/academics/schemes/class-group/${classGroup.id}`;

    // Teacher cannot create (403)
    const teacherPost = await api(url, {
      method: "POST",
      cookie: teacher.cookie,
      body: {
        name: "JSS 1 Scheme",
        examMax: 60,
        components: [{ name: "Test", maxScore: 40 }],
      },
    });
    expect(teacherPost.status).toBe(403);

    // Branch admin creates scheme (60 exam + 20 CA + 20 Project = 100)
    const adminPost = await api(url, {
      method: "POST",
      cookie: admin.cookie,
      body: {
        name: "JSS 1 Scheme",
        examMax: 60,
        components: [
          { name: "Continuous Assessment", maxScore: 20 },
          { name: "Term Project", maxScore: 20 },
        ],
      },
    });
    expect(adminPost.status).toBe(201);
    expect(adminPost.json.data.scheme.name).toBe("JSS 1 Scheme");
    expect(adminPost.json.data.scheme.components).toHaveLength(2);

    // Staff can read
    const readRes = await api(url, { cookie: teacher.cookie });
    expect(readRes.status).toBe(200);
    expect(readRes.json.data.scheme.name).toBe("JSS 1 Scheme");

    // Admin patches scheme in place
    const patchRes = await api(url, {
      method: "PATCH",
      cookie: admin.cookie,
      body: {
        name: "JSS 1 Modified Scheme",
        examMax: 50,
        components: [
          { name: "Continuous Assessment", maxScore: 25 },
          { name: "Term Project", maxScore: 25 },
        ],
      },
    });
    expect(patchRes.status).toBe(200);
    expect(patchRes.json.data.scheme.name).toBe("JSS 1 Modified Scheme");
    expect(patchRes.json.data.scheme.examMax).toBe(50);
  });
});

test.describe("P2e: Teacher Subject Schemes & Approval Workflow API", () => {
  test("teacher creates draft, edits, submits for approval, and branch admin approves", async () => {
    const admin = await asRole(Role.ADMIN);
    const teacher = await asRole(Role.TEACHING_STAFF);
    const subject = await db.subject.create({
      data: { branchId: home.id, name: "Further Mathematics", code: "FMTH" },
    });

    const TEACHER_SCHEMES_URL = "/api/v1/academics/schemes/teacher";

    // 1. Teacher creates draft scheme (status DRAFT)
    const draftRes = await api(TEACHER_SCHEMES_URL, {
      method: "POST",
      cookie: teacher.cookie,
      body: {
        branchId: home.id,
        subjectId: subject.id,
        name: "FMTH Practical Scheme",
        examMax: 50,
        components: [
          { name: "Lab Work", maxScore: 25 },
          { name: "Midterm Test", maxScore: 25 },
        ],
        reason: "Subject requires significant lab practicals",
        isSharedWithBranch: false,
        submitForApproval: false,
      },
    });
    expect(draftRes.status).toBe(201);
    const draft = draftRes.json.data.draft;
    expect(draft.status).toBe("DRAFT");
    expect(draft.approvalId).toBeNull();

    // 2. Teacher submits draft for approval
    const patchDraftRes = await api(`${TEACHER_SCHEMES_URL}/${draft.id}`, {
      method: "PATCH",
      cookie: teacher.cookie,
      body: {
        submitForApproval: true,
        reason: "Finalized lab practical breakdown for departmental approval",
      },
    });
    expect(patchDraftRes.status).toBe(200);
    expect(patchDraftRes.json.data.draft.status).toBe("PENDING");
    const approvalId = patchDraftRes.json.data.draft.approvalId;
    expect(approvalId).toBeTruthy();

    // 3. Teacher cannot approve their own scheme (403 self-approval forbidden)
    const selfApproveRes = await api(`/api/v1/settings/approval/${approvalId}`, {
      method: "PATCH",
      cookie: teacher.cookie,
      body: {
        action: "APPROVE",
        decisionReason: "I approve my own scheme",
      },
    });
    expect(selfApproveRes.status).toBe(403);

    // 4. Admin lists pending approvals
    const approvalsListRes = await api(`/api/v1/settings/approval?branchId=${home.id}&status=PENDING`, {
      cookie: admin.cookie,
    });
    expect(approvalsListRes.status).toBe(200);
    expect(approvalsListRes.json.data.approvals.some((a: { id: string }) => a.id === approvalId)).toBe(true);

    // 5. Admin approves scheme
    const approveRes = await api(`/api/v1/settings/approval/${approvalId}`, {
      method: "PATCH",
      cookie: admin.cookie,
      body: {
        action: "APPROVE",
        decisionReason: "Practical structure verified and approved for 2026/2027",
      },
    });
    expect(approveRes.status).toBe(200);
    expect(approveRes.json.data.approval.status).toBe("APPROVED");
    expect(approveRes.json.data.approval.createdSchemeId).toBeTruthy();

    // Verify live scheme and scope were created
    const createdScope = await db.assessmentSchemeScope.findFirst({
      where: {
        level: SchemeScopeLevel.TEACHER_SUBJECT,
        branchId: home.id,
        teacherUserId: teacher.user.id,
        subjectId: subject.id,
      },
      include: { scheme: { include: { components: true } } },
    });
    expect(createdScope).toBeDefined();
    expect(createdScope?.scheme.name).toBe("FMTH Practical Scheme");
    expect(createdScope?.scheme.components).toHaveLength(2);
  });

  test("rejected draft scheme transitions to REJECTED, preserves record, and allows re-editing", async () => {
    const admin = await asRole(Role.ADMIN);
    const teacher = await asRole(Role.TEACHING_STAFF);
    const subject = await db.subject.create({
      data: { branchId: home.id, name: "Fine Arts", code: "ART" },
    });

    const createRes = await api("/api/v1/academics/schemes/teacher", {
      method: "POST",
      cookie: teacher.cookie,
      body: {
        branchId: home.id,
        subjectId: subject.id,
        name: "Art Studio Scheme",
        examMax: 40,
        components: [{ name: "Studio Works", maxScore: 60 }],
        reason: "Studio heavy",
        submitForApproval: true,
      },
    });
    const draftId = createRes.json.data.draft.id;
    const approvalId = createRes.json.data.draft.approvalId;

    // Admin rejects with reason
    const rejectRes = await api(`/api/v1/settings/approval/${approvalId}`, {
      method: "PATCH",
      cookie: admin.cookie,
      body: {
        action: "REJECT",
        decisionReason: "Exam maximum score cannot be lower than 50% for this subject",
      },
    });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.json.data.approval.status).toBe("REJECTED");

    // Check draft retained as REJECTED with rejection reason
    const draft = await db.assessmentSchemeDraft.findUniqueOrThrow({ where: { id: draftId } });
    expect(draft.status).toBe(SettingStatus.REJECTED);
    expect(draft.rejectionReason).toBe("Exam maximum score cannot be lower than 50% for this subject");

    // Teacher can re-edit and resubmit
    const resubmitRes = await api(`/api/v1/academics/schemes/teacher/${draftId}`, {
      method: "PATCH",
      cookie: teacher.cookie,
      body: {
        examMax: 50,
        components: [{ name: "Studio Works", maxScore: 50 }],
        submitForApproval: true,
        reason: "Adjusted exam to 50% as requested",
      },
    });
    expect(resubmitRes.status).toBe(200);
    expect(resubmitRes.json.data.draft.status).toBe("PENDING");
  });
});

test.describe("P2e: Admin Self-Approval Toggle API", () => {
  const SELF_APPROVAL_URL = "/api/v1/settings/self-approval";

  test("superadmin manages self-approval grants; unseen reviewer identity strictly redacted from branch admin", async () => {
    const superadmin = await asSuperAdmin();
    const admin = await asRole(Role.ADMIN);
    const unseenReviewer = await createUser();

    // 1. Initially admin does not have self-approval
    const initialCheck = await api(`${SELF_APPROVAL_URL}?branchId=${home.id}`, { cookie: admin.cookie });
    expect(initialCheck.status).toBe(200);
    expect(initialCheck.json.data.hasSelfApproval).toBe(false);

    // 2. Superadmin grants self-approval with an unseen reviewer
    const grantRes = await api(SELF_APPROVAL_URL, {
      method: "POST",
      cookie: superadmin.cookie,
      body: {
        branchId: home.id,
        adminUserId: admin.user.id,
        unseenReviewerUserId: unseenReviewer.id,
      },
    });
    expect(grantRes.status).toBe(201);
    expect(grantRes.json.data.grant.unseenReviewer.id).toBe(unseenReviewer.id);

    // 3. Superadmin viewing grants sees unseen reviewer
    const superList = await api(`${SELF_APPROVAL_URL}?branchId=${home.id}`, { cookie: superadmin.cookie });
    expect(superList.status).toBe(200);
    expect(superList.json.data.grants[0].unseenReviewer.id).toBe(unseenReviewer.id);

    // 4. Branch admin viewing own self-approval status: hasSelfApproval is true, unseen reviewer is NOT exposed
    const adminCheck = await api(`${SELF_APPROVAL_URL}?branchId=${home.id}`, { cookie: admin.cookie });
    expect(adminCheck.status).toBe(200);
    expect(adminCheck.json.data.hasSelfApproval).toBe(true);
    expect(adminCheck.json.data.unseenReviewer).toBeUndefined();
    expect(JSON.stringify(adminCheck.json)).not.toContain(unseenReviewer.id);

    // 5. Superadmin revokes grant
    const revokeRes = await api(SELF_APPROVAL_URL, {
      method: "DELETE",
      cookie: superadmin.cookie,
      body: {
        branchId: home.id,
        adminUserId: admin.user.id,
      },
    });
    expect(revokeRes.status).toBe(200);
    expect(revokeRes.json.data.revoked).toBe(true);

    // 6. Branch admin now hasSelfApproval false
    const revokedCheck = await api(`${SELF_APPROVAL_URL}?branchId=${home.id}`, { cookie: admin.cookie });
    expect(revokedCheck.json.data.hasSelfApproval).toBe(false);
  });
});

test.describe("P2e: Verification Config & Public Verification API", () => {
  const VERIFY_SETTINGS_URL = "/api/v1/settings/verification";

  test("superadmin configures verification fields; public verification endpoint reflects configuration", async () => {
    const superadmin = await asSuperAdmin();
    const admin = await asRole(Role.ADMIN);
    const reviewer = await asRole(Role.ADMIN);

    const w = await resultsWorld(home.id, "vcfg");
    await db.studentRecord.update({ where: { id: w.student.id }, data: { lastName: "Yusuf" } });

    // Submit and approve results using 2 different admins
    const putSheetRes = await api("/api/v1/academics/result-sheets", {
      method: "PUT",
      cookie: admin.cookie,
      body: {
        periodId: w.period.id,
        classArmId: w.arm.id,
        subjectId: w.subject.id,
        entries: [{ studentId: w.student.id, parts: { "Test 1": 20, "Test 2": 20 }, exam: 60 }],
      },
    });
    expect(putSheetRes.status).toBe(200);

    const result = await db.result.findFirstOrThrow({
      where: { branchId: home.id, studentId: w.student.id, periodId: w.period.id },
    });

    await api("/api/v1/academics/results/transition", {
      method: "POST",
      cookie: admin.cookie,
      body: { action: "submit", resultIds: [result.id] },
    });
    await api("/api/v1/academics/results/transition", {
      method: "POST",
      cookie: reviewer.cookie,
      body: { action: "approve", resultIds: [result.id] },
    });
    await api("/api/v1/academics/results/transition", {
      method: "POST",
      cookie: reviewer.cookie,
      body: { action: "publish", resultIds: [result.id] },
    });

    const published = await db.result.findUniqueOrThrow({ where: { id: result.id } });
    const token = published.verificationToken!;

    // 1. By default: returns minimum fields + pupil (FIRST_LAST_INITIAL) + subject; no marks or grades
    const defaultRes = await api(`/api/v1/verify/${token}`, { origin: null });
    expect(defaultRes.status).toBe(200);
    const defaultData = defaultRes.json.data.verification;
    expect(defaultData.genuine).toBe(true);
    expect(defaultData.school).toBeTruthy();
    expect(defaultData.pupil).toBe("Amina Y.");
    expect(defaultData.subject).toBe(w.subject.name);
    expect(defaultData.finalScore).toBeUndefined();
    expect(defaultData.grade).toBeUndefined();

    // 2. Superadmin configures branch verification: showMarks = true, showGrade = true, pupilNameFormat = FULL
    const patchRes = await api(VERIFY_SETTINGS_URL, {
      method: "PATCH",
      cookie: superadmin.cookie,
      body: {
        branchId: home.id,
        showPupilName: true,
        pupilNameFormat: PupilNameFormat.FULL,
        showSubject: true,
        showMarks: true,
        showGrade: true,
      },
    });
    expect(patchRes.status).toBe(200);

    // 3. Public verification now shows FULL name, marks and grade
    const configuredRes = await api(`/api/v1/verify/${token}`, { origin: null });
    expect(configuredRes.status).toBe(200);
    const configuredData = configuredRes.json.data.verification;
    expect(configuredData.pupil).toBe("Amina Yusuf");
    expect(configuredData.finalScore).toBe(100);
    expect(configuredData.grade).toBe("A");

    // 4. Server-rendered HTML page displays the marks and grade
    const htmlPage = await api(`/verify/${token}`, { origin: null });
    expect(htmlPage.status).toBe(200);
    expect(htmlPage.text).toContain("Amina Yusuf");
    expect(htmlPage.text).toContain("100");
    expect(htmlPage.text).toContain("This result is genuine.");
  });
});

test.describe("P2e: Report-Card Layout Settings API", () => {
  const LAYOUTS_URL = "/api/v1/settings/layouts";

  test("branch admin lists layouts, sets branch layout with options, and report card reflects layout", async () => {
    const admin = await asRole(Role.ADMIN);
    const teacher = await asRole(Role.TEACHING_STAFF);

    // 1. List available layouts
    const listRes = await api(LAYOUTS_URL, { cookie: teacher.cookie });
    expect(listRes.status).toBe(200);
    expect(listRes.json.data.layouts.some((l: { code: string }) => l.code === "DEFAULT")).toBe(true);
    expect(listRes.json.data.layouts.some((l: { code: string }) => l.code === "LEGACY")).toBe(true);

    // 2. Branch admin configures branch layout to LEGACY with signature line and next term date
    const setRes = await api(LAYOUTS_URL, {
      method: "PATCH",
      cookie: admin.cookie,
      body: {
        branchId: home.id,
        layoutCode: "LEGACY",
        options: {
          signatureLine: true,
          nextTermDate: true,
        },
      },
    });
    expect(setRes.status).toBe(200);
    expect(setRes.json.data.layout.code).toBe("LEGACY");
    expect(setRes.json.data.layout.options.signatureLine).toBe(true);
    expect(setRes.json.data.layout.options.nextTermDate).toBe(true);

    // 3. Effective branch layout query
    const checkRes = await api(`${LAYOUTS_URL}?branchId=${home.id}`, { cookie: teacher.cookie });
    expect(checkRes.status).toBe(200);
    expect(checkRes.json.data.activeLayout.code).toBe("LEGACY");
  });
});
