import { test, expect } from "@playwright/test";
import { createUser, db, resetDatabase, seedInstance } from "../support/db";
import { resultsWorld } from "../support/results-world";
import { resolveEffectiveScheme, canSelfApproveResults } from "@/lib/settings/approvals";
import { transitionResults } from "@/lib/academics/results-workflow";
import { SchemeScopeLevel, SettingStatus, SettingScope, Role } from "@prisma/client";

let home: { id: string };

test.afterAll(async () => {
  await resetDatabase();
});

test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();
});

test.describe("P2e: resolveEffectiveScheme hierarchy", () => {
  test("walks hierarchy: teacher subject > class group > branch default > global default", async () => {
    const w = await resultsWorld(home.id, "hier");
    const teacher = await createUser();

    const otherBranch = await db.branch.findFirstOrThrow({
      where: { id: { not: home.id } },
      orderBy: { name: "asc" },
    });

    // 1. Create a Global Default Scheme (in otherBranch, tagged as GLOBAL scope)
    const globalScheme = await db.assessmentScheme.create({
      data: {
        branchId: otherBranch.id,
        name: "Global Default Scheme",
        totalMax: 100,
        examMax: 70,
      },
    });
    await db.assessmentComponent.create({
      data: {
        branchId: otherBranch.id,
        schemeId: globalScheme.id,
        name: "CA",
        maxScore: 30,
        sortOrder: 1,
      },
    });
    await db.assessmentSchemeScope.create({
      data: {
        schemeId: globalScheme.id,
        level: SchemeScopeLevel.GLOBAL,
        isDefault: true,
      },
    });

    // When only global exists (if no branch/class scheme matched)
    const resolvedGlobal = await resolveEffectiveScheme({
      branchId: "non-existent-branch",
    });
    expect(resolvedGlobal?.source).toBe("GLOBAL_DEFAULT");
    expect(resolvedGlobal?.schemeId).toBe(globalScheme.id);
    expect(resolvedGlobal?.examMax).toBe(70);

    // 2. Branch Default Scheme (from resultsWorld) beats Global Default
    const resolvedBranch = await resolveEffectiveScheme({
      branchId: home.id,
    });
    expect(resolvedBranch?.source).toBe("BRANCH_DEFAULT");
    expect(resolvedBranch?.schemeId).toBe(w.scheme.id);
    expect(resolvedBranch?.examMax).toBe(60);

    // 3. Class Group Scheme beats Branch Default
    const classScheme = await db.assessmentScheme.create({
      data: {
        branchId: home.id,
        classGroupId: w.group.id,
        name: "Class Group Scheme",
        totalMax: 100,
        examMax: 50,
      },
    });
    await db.assessmentComponent.createMany({
      data: [
        { branchId: home.id, schemeId: classScheme.id, name: "CA 1", maxScore: 25, sortOrder: 1 },
        { branchId: home.id, schemeId: classScheme.id, name: "CA 2", maxScore: 25, sortOrder: 2 },
      ],
    });

    const resolvedClass = await resolveEffectiveScheme({
      branchId: home.id,
      classGroupId: w.group.id,
    });
    expect(resolvedClass?.source).toBe("CLASS_GROUP");
    expect(resolvedClass?.schemeId).toBe(classScheme.id);
    expect(resolvedClass?.examMax).toBe(50);

    // 4. Teacher's Approved Subject Scheme beats Class Group Scheme
    const teacherGroup = await db.classGroup.create({
      data: { branchId: home.id, name: "Teacher Class Group" },
    });
    const teacherScheme = await db.assessmentScheme.create({
      data: {
        branchId: home.id,
        classGroupId: teacherGroup.id,
        name: "Teacher Custom Maths Scheme",
        totalMax: 100,
        examMax: 40,
      },
    });
    await db.assessmentComponent.createMany({
      data: [
        { branchId: home.id, schemeId: teacherScheme.id, name: "Project", maxScore: 30, sortOrder: 1 },
        { branchId: home.id, schemeId: teacherScheme.id, name: "Test", maxScore: 30, sortOrder: 2 },
      ],
    });
    await db.assessmentSchemeScope.create({
      data: {
        schemeId: teacherScheme.id,
        level: SchemeScopeLevel.TEACHER_SUBJECT,
        branchId: home.id,
        teacherUserId: teacher.id,
        subjectId: w.subject.id,
      },
    });

    const resolvedTeacher = await resolveEffectiveScheme({
      branchId: home.id,
      classGroupId: w.group.id,
      teacherUserId: teacher.id,
      subjectId: w.subject.id,
    });
    expect(resolvedTeacher?.source).toBe("TEACHER_SUBJECT");
    expect(resolvedTeacher?.schemeId).toBe(teacherScheme.id);
    expect(resolvedTeacher?.examMax).toBe(40);
    expect(resolvedTeacher?.isPending).toBe(false);
  });

  test("teacher pending draft scheme is resolved as pending when includeTeacherDrafts is true", async () => {
    const w = await resultsWorld(home.id, "draft");
    const teacher = await createUser();

    const draft = await db.assessmentSchemeDraft.create({
      data: {
        branchId: home.id,
        teacherUserId: teacher.id,
        subjectId: w.subject.id,
        name: "Pending Physics Scheme",
        caParts: [
          { name: "Lab Work", maxScore: 30, sortOrder: 1 },
          { name: "Weekly Quiz", maxScore: 20, sortOrder: 2 },
        ],
        examMax: 50,
        totalMax: 100,
        reason: "Physics requires dedicated laboratory assessment",
        status: SettingStatus.PENDING,
      },
    });

    // Without includeTeacherDrafts, falls back to branch default
    const withoutDrafts = await resolveEffectiveScheme({
      branchId: home.id,
      classGroupId: w.group.id,
      teacherUserId: teacher.id,
      subjectId: w.subject.id,
      includeTeacherDrafts: false,
    });
    expect(withoutDrafts?.source).toBe("BRANCH_DEFAULT");

    // With includeTeacherDrafts, resolves the teacher's pending draft
    const withDrafts = await resolveEffectiveScheme({
      branchId: home.id,
      classGroupId: w.group.id,
      teacherUserId: teacher.id,
      subjectId: w.subject.id,
      includeTeacherDrafts: true,
    });
    expect(withDrafts?.source).toBe("TEACHER_DRAFT_PENDING");
    expect(withDrafts?.schemeId).toBe(draft.id);
    expect(withDrafts?.isPending).toBe(true);
    expect(withDrafts?.examMax).toBe(50);
    expect(withDrafts?.components).toHaveLength(2);
  });
});

test.describe("P2e: SettingApproval lifecycle", () => {
  test("creates approval request in PENDING and resolves as APPROVED or REJECTED", async () => {
    const actor = await createUser();
    const decider = await createUser();

    const approval = await db.settingApproval.create({
      data: {
        settingKey: "assessment_scheme_custom",
        targetType: "ASSESSMENT_SCHEME",
        scope: SettingScope.BRANCH,
        branchId: home.id,
        actorUserId: actor.id,
        reason: "Requesting custom CA allocation for Arabic branch",
        status: SettingStatus.PENDING,
      },
    });

    expect(approval.status).toBe(SettingStatus.PENDING);
    expect(approval.decidedAt).toBeNull();

    // Decided: APPROVED
    const approved = await db.settingApproval.update({
      where: { id: approval.id },
      data: {
        status: SettingStatus.APPROVED,
        deciderUserId: decider.id,
        decidedAt: new Date(),
        decisionReason: "Approved for 2026/2027 academic session",
      },
    });
    expect(approved.status).toBe(SettingStatus.APPROVED);
    expect(approved.deciderUserId).toBe(decider.id);

    // Rejection workflow
    const rejectedReq = await db.settingApproval.create({
      data: {
        settingKey: "assessment_scheme_custom_2",
        targetType: "ASSESSMENT_SCHEME",
        scope: SettingScope.BRANCH,
        branchId: home.id,
        actorUserId: actor.id,
        reason: "Invalid scheme sum",
        status: SettingStatus.PENDING,
      },
    });

    const rejected = await db.settingApproval.update({
      where: { id: rejectedReq.id },
      data: {
        status: SettingStatus.REJECTED,
        deciderUserId: decider.id,
        decidedAt: new Date(),
        decisionReason: "Parts do not sum to 100",
      },
    });
    expect(rejected.status).toBe(SettingStatus.REJECTED);
    expect(rejected.decisionReason).toBe("Parts do not sum to 100");
  });
});

test.describe("P2e: canSelfApproveResults & AdminSelfApprovalGrant", () => {
  test("superadmin can always self-approve without grant", async () => {
    const superadmin = await createUser();
    const result = await canSelfApproveResults(superadmin.id, home.id, true);
    expect(result.allowed).toBe(true);
  });

  test("regular admin cannot self-approve without grant", async () => {
    const admin = await createUser();
    const result = await canSelfApproveResults(admin.id, home.id, false);
    expect(result.allowed).toBe(false);
  });

  test("admin with active grant can self-approve, returning unseen reviewer if assigned", async () => {
    const superadmin = await createUser();
    const admin = await createUser();
    const reviewer = await createUser();

    await db.adminSelfApprovalGrant.create({
      data: {
        branchId: home.id,
        adminUserId: admin.id,
        grantedBySuperadminId: superadmin.id,
        unseenReviewerUserId: reviewer.id,
      },
    });

    const result = await canSelfApproveResults(admin.id, home.id, false);
    expect(result.allowed).toBe(true);
    expect(result.unseenReviewerUserId).toBe(reviewer.id);
  });

  test("revoked grant disallows self-approval", async () => {
    const superadmin = await createUser();
    const admin = await createUser();

    const grant = await db.adminSelfApprovalGrant.create({
      data: {
        branchId: home.id,
        adminUserId: admin.id,
        grantedBySuperadminId: superadmin.id,
      },
    });

    // Revoke
    await db.adminSelfApprovalGrant.update({
      where: { id: grant.id },
      data: { revokedAt: new Date() },
    });

    const result = await canSelfApproveResults(admin.id, home.id, false);
    expect(result.allowed).toBe(false);
  });
});

test.describe("P2e: Publishing guard on unapproved schemes", () => {
  test("results under a pending draft scheme cannot be published until approved", async () => {
    const w = await resultsWorld(home.id, "guard");
    const teacher = await createUser();
    const admin = await createUser();

    const pendingScheme = await db.assessmentScheme.create({
      data: {
        branchId: home.id,
        classGroupId: w.group.id,
        name: "Pending Chemistry Scheme",
        totalMax: 100,
        examMax: 60,
      },
    });
    await db.assessmentComponent.create({
      data: {
        branchId: home.id,
        schemeId: pendingScheme.id,
        name: "Lab",
        maxScore: 40,
        sortOrder: 1,
      },
    });

    const approval = await db.settingApproval.create({
      data: {
        settingKey: "scheme_approval",
        targetType: "ASSESSMENT_SCHEME",
        targetId: pendingScheme.id,
        scope: SettingScope.BRANCH,
        branchId: home.id,
        actorUserId: teacher.id,
        reason: "Chemistry lab allocation",
        status: SettingStatus.PENDING,
      },
    });

    const result = await db.result.create({
      data: {
        branchId: home.id,
        studentId: w.student.id,
        subjectId: w.subject.id,
        periodId: w.period.id,
        classArmId: w.arm.id,
        schemeId: pendingScheme.id,
        scaleId: w.scale.id,
        componentScores: [{ name: "Lab", max: 40, score: 35 }],
        examScore: 50,
        examMax: 60,
        caTotal: 35,
        total: 85,
        maxScore: 100,
        gradeLetter: "A",
        gradeRemark: "Excellent",
        status: "APPROVED",
        enteredByUserId: teacher.id,
        submittedByUserId: teacher.id,
        submittedAt: new Date(),
        approvedByUserId: admin.id,
        approvedAt: new Date(),
      },
    });

    // Attempting to publish must fail with ConflictError
    await expect(
      transitionResults(admin.id, Role.ADMIN, home.id, {
        action: "publish",
        resultIds: [result.id],
      }),
    ).rejects.toThrow(/cannot be published until the scheme is approved/i);

    // Now approve the scheme
    await db.settingApproval.update({
      where: { id: approval.id },
      data: { status: SettingStatus.APPROVED, deciderUserId: admin.id, decidedAt: new Date() },
    });

    // Publishing now succeeds
    const transition = await transitionResults(admin.id, Role.ADMIN, home.id, {
      action: "publish",
      resultIds: [result.id],
    });
    expect(transition.action).toBe("publish");
    expect(transition.status).toBe("PUBLISHED");
  });
});
