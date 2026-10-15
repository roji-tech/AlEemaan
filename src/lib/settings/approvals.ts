import { SettingScope, SettingStatus, SchemeScopeLevel } from "@prisma/client";
import { prisma } from "@/lib/db";
import { toHundredths, DEFAULT_PART_NAMES, PART_NAME_MAX, type HierarchicalSchemeInput } from "@/lib/academics/scoring";

export type SchemeResolutionSource = "TEACHER_SUBJECT" | "TEACHER_DRAFT_PENDING" | "CLASS_GROUP" | "BRANCH_DEFAULT" | "GLOBAL_DEFAULT";

export type ResolvedScheme = {
  source: SchemeResolutionSource;
  schemeId: string;
  name: string;
  totalMax: number;
  examMax: number;
  isPending: boolean; // if true, marks can be entered/reviewed but CANNOT be published
  components: { name: string; maxScore: number; sortOrder: number }[];
};

export type SchemeResolutionQuery = {
  branchId: string;
  classGroupId?: string | null;
  teacherUserId?: string | null;
  subjectId?: string | null;
  includeTeacherDrafts?: boolean;
};

/**
 * Validates a hierarchical CA/exam scheme input (maintainer decisions 2026-10-15).
 * - Parts must total exactly 100 (sum(caParts) + exam === 100).
 * - At least one CA part and exactly one Exam part (exam > 0).
 * - Part names are optional (default to "CA", "Project", "Exam"). Max 64 chars if provided.
 * - Names must be unique ignoring case.
 */
export function validateHierarchicalScheme(input: HierarchicalSchemeInput): {
  valid: boolean;
  error?: string;
  normalizedComponents?: { name: string; maxScore: number; sortOrder: number }[];
} {
  const exam = toHundredths(input.examMax);
  if (exam === null || exam <= 0) {
    return { valid: false, error: "Exam maximum score must be a positive number." };
  }

  if (!input.caParts || input.caParts.length === 0) {
    return { valid: false, error: "A scheme must have at least one continuous assessment (CA) part." };
  }

  let totalHundredths = exam;
  const seenNames = new Set<string>();
  const normalizedComponents: { name: string; maxScore: number; sortOrder: number }[] = [];

  for (let i = 0; i < input.caParts.length; i++) {
    const part = input.caParts[i];
    const score = toHundredths(part.maxScore);
    if (score === null || score <= 0) {
      return { valid: false, error: `CA part ${i + 1} maximum score must be a positive number.` };
    }

    let name = typeof part.name === "string" ? part.name.replace(/\s+/g, " ").trim() : "";
    if (!name) {
      name = i < DEFAULT_PART_NAMES.length - 1 ? DEFAULT_PART_NAMES[i] : `CA ${i + 1}`;
    }

    if (name.length > PART_NAME_MAX) {
      return { valid: false, error: `Part name "${name}" exceeds maximum length of ${PART_NAME_MAX} characters.` };
    }

    const lower = name.toLowerCase();
    if (seenNames.has(lower) || lower === "exam") {
      return { valid: false, error: `Duplicate part name "${name}". Each part name must be unique.` };
    }
    seenNames.add(lower);

    totalHundredths += score;
    normalizedComponents.push({
      name,
      maxScore: score / 100,
      sortOrder: i + 1,
    });
  }

  // Exactly 100.00
  if (totalHundredths !== 10000) {
    return {
      valid: false,
      error: `Continuous assessment parts and exam must sum to exactly 100.00 (current sum: ${(totalHundredths / 100).toFixed(2)}).`,
    };
  }

  return { valid: true, normalizedComponents };
}

/**
 * Resolves the effective assessment scheme walking the specificity hierarchy:
 * 1. Teacher's subject scheme (or teacher's active pending draft if includeTeacherDrafts is true)
 * 2. Class-group scheme
 * 3. Branch default scheme
 * 4. Global default scheme
 */
export async function resolveEffectiveScheme(query: SchemeResolutionQuery): Promise<ResolvedScheme | null> {
  const { branchId, classGroupId, teacherUserId, subjectId, includeTeacherDrafts } = query;

  // 1. Teacher's subject scheme
  if (teacherUserId && subjectId) {
    // Check for approved teacher-subject scope
    const teacherScope = await prisma.assessmentSchemeScope.findFirst({
      where: {
        level: SchemeScopeLevel.TEACHER_SUBJECT,
        branchId,
        teacherUserId,
        subjectId,
        scheme: { archivedAt: null },
      },
      include: {
        scheme: {
          include: {
            components: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
          },
        },
      },
    });

    if (teacherScope?.scheme) {
      return {
        source: "TEACHER_SUBJECT",
        schemeId: teacherScope.scheme.id,
        name: teacherScope.scheme.name,
        totalMax: Number(teacherScope.scheme.totalMax),
        examMax: Number(teacherScope.scheme.examMax),
        isPending: false,
        components: teacherScope.scheme.components.map((c) => ({
          name: c.name,
          maxScore: Number(c.maxScore),
          sortOrder: c.sortOrder,
        })),
      };
    }

    // Check for active pending draft by teacher if allowed
    if (includeTeacherDrafts) {
      const draft = await prisma.assessmentSchemeDraft.findFirst({
        where: {
          branchId,
          teacherUserId,
          subjectId,
          status: SettingStatus.PENDING,
        },
        orderBy: { updatedAt: "desc" },
      });

      if (draft) {
        const caParts = Array.isArray(draft.caParts) ? (draft.caParts as { name: string; maxScore: number; sortOrder: number }[]) : [];
        return {
          source: "TEACHER_DRAFT_PENDING",
          schemeId: draft.id,
          name: `${draft.name} (Pending Approval)`,
          totalMax: Number(draft.totalMax),
          examMax: Number(draft.examMax),
          isPending: true,
          components: caParts.map((c, i) => ({
            name: c.name || `CA ${i + 1}`,
            maxScore: Number(c.maxScore),
            sortOrder: c.sortOrder ?? i + 1,
          })),
        };
      }
    }
  }

  // 2. Class-group scheme
  if (classGroupId) {
    // Check AssessmentSchemeScope for class group
    const groupScope = await prisma.assessmentSchemeScope.findFirst({
      where: {
        level: SchemeScopeLevel.CLASS_GROUP,
        branchId,
        classGroupId,
        scheme: { archivedAt: null },
      },
      include: {
        scheme: {
          include: {
            components: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
          },
        },
      },
    });

    if (groupScope?.scheme) {
      return {
        source: "CLASS_GROUP",
        schemeId: groupScope.scheme.id,
        name: groupScope.scheme.name,
        totalMax: Number(groupScope.scheme.totalMax),
        examMax: Number(groupScope.scheme.examMax),
        isPending: false,
        components: groupScope.scheme.components.map((c) => ({
          name: c.name,
          maxScore: Number(c.maxScore),
          sortOrder: c.sortOrder,
        })),
      };
    }

    // Also check direct AssessmentScheme.classGroupId
    const directGroupScheme = await prisma.assessmentScheme.findFirst({
      where: { branchId, classGroupId, archivedAt: null },
      include: { components: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
    });

    if (directGroupScheme) {
      return {
        source: "CLASS_GROUP",
        schemeId: directGroupScheme.id,
        name: directGroupScheme.name,
        totalMax: Number(directGroupScheme.totalMax),
        examMax: Number(directGroupScheme.examMax),
        isPending: false,
        components: directGroupScheme.components.map((c) => ({
          name: c.name,
          maxScore: Number(c.maxScore),
          sortOrder: c.sortOrder,
        })),
      };
    }
  }

  // 3. Branch default scheme
  const branchScope = await prisma.assessmentSchemeScope.findFirst({
    where: {
      level: SchemeScopeLevel.BRANCH,
      branchId,
      isDefault: true,
      scheme: { archivedAt: null },
    },
    include: {
      scheme: {
        include: {
          components: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
        },
      },
    },
  });

  if (branchScope?.scheme) {
    return {
      source: "BRANCH_DEFAULT",
      schemeId: branchScope.scheme.id,
      name: branchScope.scheme.name,
      totalMax: Number(branchScope.scheme.totalMax),
      examMax: Number(branchScope.scheme.examMax),
      isPending: false,
      components: branchScope.scheme.components.map((c) => ({
        name: c.name,
        maxScore: Number(c.maxScore),
        sortOrder: c.sortOrder,
      })),
    };
  }

  const directBranchDefault = await prisma.assessmentScheme.findFirst({
    where: { branchId, classGroupId: null, archivedAt: null },
    include: { components: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
  });

  if (directBranchDefault) {
    return {
      source: "BRANCH_DEFAULT",
      schemeId: directBranchDefault.id,
      name: directBranchDefault.name,
      totalMax: Number(directBranchDefault.totalMax),
      examMax: Number(directBranchDefault.examMax),
      isPending: false,
      components: directBranchDefault.components.map((c) => ({
        name: c.name,
        maxScore: Number(c.maxScore),
        sortOrder: c.sortOrder,
      })),
    };
  }

  // 4. Global default scheme
  const globalScope = await prisma.assessmentSchemeScope.findFirst({
    where: {
      level: SchemeScopeLevel.GLOBAL,
      isDefault: true,
      scheme: { archivedAt: null },
    },
    include: {
      scheme: {
        include: {
          components: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
        },
      },
    },
  });

  if (globalScope?.scheme) {
    return {
      source: "GLOBAL_DEFAULT",
      schemeId: globalScope.scheme.id,
      name: globalScope.scheme.name,
      totalMax: Number(globalScope.scheme.totalMax),
      examMax: Number(globalScope.scheme.examMax),
      isPending: false,
      components: globalScope.scheme.components.map((c) => ({
        name: c.name,
        maxScore: Number(c.maxScore),
        sortOrder: c.sortOrder,
      })),
    };
  }

  return null;
}

/**
 * Checks whether changes to a setting key for a given branch require superadmin approval.
 */
export async function isSettingApprovalEnforced(branchId: string, settingKey: string): Promise<boolean> {
  const enforcement = await prisma.settingValue.findFirst({
    where: {
      key: `enforce_approval_${settingKey}`,
      OR: [{ scope: SettingScope.BRANCH, branchId }, { scope: SettingScope.GLOBAL }],
      status: SettingStatus.APPROVED,
    },
    orderBy: { scope: "desc" }, // BRANCH beats GLOBAL
  });

  if (!enforcement) return false;
  return enforcement.value === true || enforcement.value === "true";
}

/**
 * Checks if a user is permitted to self-approve results for a branch.
 * Superadmins are always permitted.
 * Branch admins are permitted IF and ONLY IF granted an active AdminSelfApprovalGrant by a superadmin.
 */
export async function canSelfApproveResults(
  userId: string,
  branchId: string,
  isSuperAdmin: boolean,
): Promise<{ allowed: boolean; unseenReviewerUserId?: string | null }> {
  if (isSuperAdmin) {
    return { allowed: true };
  }

  const grant = await prisma.adminSelfApprovalGrant.findUnique({
    where: {
      branchId_adminUserId: { branchId, adminUserId: userId },
    },
  });

  if (!grant || grant.revokedAt !== null) {
    return { allowed: false, unseenReviewerUserId: grant?.unseenReviewerUserId ?? null };
  }

  return { allowed: true, unseenReviewerUserId: grant.unseenReviewerUserId };
}

/**
 * Ensures standard report card layouts exist in the database.
 */
export async function ensureDefaultReportCardLayouts() {
  const layouts = [
    {
      code: "DEFAULT",
      name: "Standard Layout",
      type: "DEFAULT" as const,
      isLegacy: false,
      options: { logo: true, signatureLine: true, nextTermDate: true },
    },
    {
      code: "LEGACY",
      name: "Legacy Layout",
      type: "LEGACY" as const,
      isLegacy: true,
      options: { logo: true, signatureLine: false, nextTermDate: false },
    },
  ];

  for (const layout of layouts) {
    await prisma.reportCardLayout.upsert({
      where: { code: layout.code },
      create: layout,
      update: { name: layout.name, isLegacy: layout.isLegacy },
    });
  }
}

/**
 * Gets available report card layouts.
 */
export async function getReportCardLayouts() {
  await ensureDefaultReportCardLayouts();
  return prisma.reportCardLayout.findMany({
    orderBy: [{ isLegacy: "asc" }, { code: "asc" }],
  });
}

/**
 * Resolves the effective report card layout for a branch.
 */
export async function getBranchReportCardLayout(branchId: string) {
  await ensureDefaultReportCardLayouts();

  // Check branch setting value
  const setting = await prisma.settingValue.findFirst({
    where: {
      key: "report_card_layout",
      OR: [{ scope: SettingScope.BRANCH, branchId }, { scope: SettingScope.GLOBAL }],
      status: SettingStatus.APPROVED,
    },
    orderBy: { scope: "desc" },
  });

  const layoutCode =
    setting && typeof setting.value === "object" && setting.value !== null && "layoutCode" in setting.value
      ? String((setting.value as { layoutCode: string }).layoutCode)
      : "DEFAULT";

  const customOptions =
    setting && typeof setting.value === "object" && setting.value !== null && "options" in setting.value
      ? (setting.value as { options: Record<string, boolean> }).options
      : undefined;

  const layout =
    (await prisma.reportCardLayout.findUnique({ where: { code: layoutCode } })) ??
    (await prisma.reportCardLayout.findUnique({ where: { code: "DEFAULT" } }));

  if (!layout) {
    return {
      code: "DEFAULT",
      name: "Standard Layout",
      isLegacy: false,
      options: { logo: true, signatureLine: true, nextTermDate: true, ...customOptions },
    };
  }

  const baseOptions = typeof layout.options === "object" && layout.options !== null ? (layout.options as Record<string, boolean>) : {};

  return {
    code: layout.code,
    name: layout.name,
    isLegacy: layout.isLegacy,
    options: { ...baseOptions, ...customOptions },
  };
}

/**
 * Resolves the verification page configuration for a branch (falling back to global, then defaults).
 */
export async function getVerificationPageConfig(branchId?: string | null) {
  if (branchId) {
    const branchConfig = await prisma.verificationPageConfig.findUnique({
      where: { branchId },
    });
    if (branchConfig) return branchConfig;
  }

  const globalConfig = await prisma.verificationPageConfig.findFirst({
    where: { branchId: null },
  });
  if (globalConfig) return globalConfig;

  return {
    id: "default",
    branchId: branchId ?? null,
    showPupilName: true,
    pupilNameFormat: "FIRST_LAST_INITIAL" as const,
    showSubject: true,
    showMarks: false,
    showGrade: false,
  };
}
