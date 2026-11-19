import { SessionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { portalBaseFromAppUrl, readPortalConfig } from "@/lib/portals";
import type { AdminScope } from "@/lib/auth/branch-access";
import { mayActForGuardian } from "@/lib/guardians/rules";
import { formatCode, hashAccessCode, newAccessCode } from "./door";

// Access codes (task 0113 D7, D8; task 0094 D7, D9). A pupil code is the pupil's; a guardian code is the GUARDIAN's (one per parent, whatever the number of children: the maintainer's
// "won't that be stressful?"). A code is shown ONCE, to print or copy; only its hash is kept. A new one stops the old one at once and ends its owner's open sessions (`portalVersion`).
// Audited without the code. The caller has checked the authority (routes: withBranch "administer" for a pupil or a class; `mayActForGuardian` for a guardian).

export const CLASS_SHEET_MAX = 100;
export type Which = "pupil" | "guardian" | "both";

export type Slip = {
  studentId: string;
  name: string;
  admissionNo: string;
  className: string | null;
  branchName: string;
  pupilCode?: string;
  /// The guardian half: whose it is, the code when one was made now, the other children it opens, or a note saying which code to use.
  guardianName?: string;
  guardianCode?: string;
  family?: string[];
  guardianNote?: string;
};

/// Where each code is used: the student. and parent. sign-in pages of this school (null when that portal is off: the slip then says the school's own address).
export function signInAddresses(appUrl = process.env.APP_URL ?? ""): {
  pupil: string | null;
  guardian: string | null;
  school: string | null;
} {
  const { config } = readPortalConfig();
  const strip = (u: string | null) => (u ? `${u.replace(/^https?:\/\//, "")}/login` : null);
  let school: string | null = null;
  try {
    school = appUrl ? `${new URL(appUrl).host}/portal` : null;
  } catch {
    school = null;
  }
  return {
    pupil: strip(portalBaseFromAppUrl("student", appUrl, config)),
    guardian: strip(portalBaseFromAppUrl("parent", appUrl, config)),
    school,
  };
}

/// A pupil's codes as the Access codes dialog shows them: when the pupil code was made, and each guardian of the pupil with when their code was made, whether they are blocked from this
/// child, and whether this administrator may make their code.
export async function codeStatus(scope: AdminScope, studentId: string) {
  const s = await prisma.studentRecord.findUnique({
    where: { id: studentId },
    select: {
      firstName: true,
      lastName: true,
      pupilCodeAt: true,
      branch: { select: { name: true, studentLoginEnabled: true, parentLoginEnabled: true, legacyPortalSecrets: true } },
      guardians: {
        orderBy: [{ isMain: "desc" }, { createdAt: "asc" }],
        select: {
          isMain: true,
          blockedAt: true,
          guardian: { select: { id: true, name: true, codeAt: true, children: { select: { branchId: true } } } },
        },
      },
    },
  });
  if (!s) return null;
  return {
    name: `${s.firstName} ${s.lastName}`,
    pupil: s.pupilCodeAt?.toISOString() ?? null,
    guardians: s.guardians.map((l) => ({
      guardianId: l.guardian.id,
      name: l.guardian.name,
      isMain: l.isMain,
      blocked: l.blockedAt !== null,
      codeAt: l.guardian.codeAt?.toISOString() ?? null,
      canAct: mayActForGuardian(scope, [...new Set(l.guardian.children.map((c) => c.branchId))]),
    })),
    branch: {
      name: s.branch.name,
      studentOpen: s.branch.studentLoginEnabled,
      parentOpen: s.branch.parentLoginEnabled,
      legacy: s.branch.legacyPortalSecrets,
    },
    signIn: signInAddresses(),
  };
}

const PUPIL_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  admissionNo: true,
  branch: { select: { name: true } },
  enrollments: { orderBy: { enrolledAt: "desc" as const }, take: 1, select: { className: true, arm: true } },
  guardians: {
    where: { blockedAt: null, guardian: { archivedAt: null } },
    orderBy: [{ isMain: "desc" as const }, { createdAt: "asc" as const }],
    take: 1,
    select: {
      guardian: {
        select: {
          id: true,
          name: true,
          codeAt: true,
          children: {
            select: {
              branchId: true,
              blockedAt: true,
              studentId: true,
              student: { select: { firstName: true, lastName: true, archivedAt: true } },
            },
          },
        },
      },
    },
  },
};
type PupilRow = {
  id: string;
  firstName: string;
  lastName: string;
  admissionNo: string;
  branch: { name: string };
  enrollments: { className: string; arm: string | null }[];
  guardians: {
    guardian: {
      id: string;
      name: string;
      codeAt: Date | null;
      children: {
        branchId: string;
        blockedAt: Date | null;
        studentId: string;
        student: { firstName: string; lastName: string; archivedAt: Date | null };
      }[];
    };
  }[];
};

const slipOf = (p: {
  id: string;
  firstName: string;
  lastName: string;
  admissionNo: string;
  branch: { name: string };
  enrollments: PupilRow["enrollments"];
}): Slip => {
  const e = p.enrollments[0];
  return {
    studentId: p.id,
    name: `${p.firstName} ${p.lastName}`,
    admissionNo: p.admissionNo,
    className: e ? `${e.className}${e.arm ? ` ${e.arm}` : ""}` : null,
    branchName: p.branch.name,
  };
};

/// The other children a guardian's code opens: their allowed links to live pupils, by name.
const otherChildren = (guardian: PupilRow["guardians"][number]["guardian"], exceptStudentId: string) =>
  guardian.children
    .filter((c) => c.studentId !== exceptStudentId && !c.blockedAt && !c.student.archivedAt)
    .map((c) => `${c.student.firstName} ${c.student.lastName}`);

type PupilWrite = { id: string; hash: string; at: Date };
type GuardianWrite = { id: string; hash: string; at: Date };

async function commit(actorUserId: string, pupils: PupilWrite[], guardians: GuardianWrite[]) {
  await prisma.$transaction(async (tx) => {
    // One write per owner, raising its version: every session of that pupil or guardian made before ends at its next request.
    for (const p of pupils)
      await tx.studentRecord.update({
        where: { id: p.id },
        data: { pupilCodeHash: p.hash, pupilCodeAt: p.at, portalVersion: { increment: 1 } },
      });
    for (const g of guardians)
      await tx.guardian.update({ where: { id: g.id }, data: { codeHash: g.hash, codeAt: g.at, portalVersion: { increment: 1 } } });
    const audits = [
      ...pupils.map((p) => ({
        actorUserId,
        action: "ACCESS_CODE_REGENERATED",
        targetType: "StudentRecord",
        targetId: p.id,
        afterValue: { which: "pupil", sessionsEnded: true },
      })),
      ...guardians.map((g) => ({
        actorUserId,
        action: "GUARDIAN_CODE_ISSUED",
        targetType: "Guardian",
        targetId: g.id,
        afterValue: { sessionsEnded: true },
      })),
    ];
    if (audits.length > 0) await tx.auditLog.createMany({ data: audits });
  });
}

/// One pupil's new pupil code, from the Students screen ("forgot the code").
export async function regeneratePupilCode(actorUserId: string, studentId: string): Promise<Slip | null> {
  const pupil = await prisma.studentRecord.findFirst({ where: { id: studentId, archivedAt: null }, select: PUPIL_SELECT });
  if (!pupil) return null;
  const code = newAccessCode();
  await commit(actorUserId, [{ id: pupil.id, hash: hashAccessCode(code, pupil.id, "pupil"), at: new Date() }], []);
  return { ...slipOf(pupil), pupilCode: formatCode(code) };
}

/// A guardian's new code (the caller checked `mayActForGuardian`): one code for all their children, named on the slip. Null when the guardian is unknown or archived.
export async function issueGuardianCode(actorUserId: string, guardianId: string) {
  const guardian = await prisma.guardian.findFirst({
    where: { id: guardianId, archivedAt: null },
    select: {
      id: true,
      name: true,
      children: {
        where: { blockedAt: null, student: { archivedAt: null } },
        orderBy: { createdAt: "asc" },
        select: {
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              admissionNo: true,
              branch: { select: { name: true } },
              enrollments: { orderBy: { enrolledAt: "desc" as const }, take: 1, select: { className: true, arm: true } },
            },
          },
        },
      },
    },
  });
  if (!guardian) return null;
  const code = newAccessCode();
  await commit(actorUserId, [], [{ id: guardian.id, hash: hashAccessCode(code, guardian.id, "guardian"), at: new Date() }]);
  return {
    guardianId: guardian.id,
    guardianName: guardian.name,
    code: formatCode(code),
    children: guardian.children.map((c) => slipOf(c.student)),
  };
}

/// The live pupils of one class (or one arm) of the branch, in the branch's active session (any session when none is active): how many a class sheet would replace.
export async function classPupils(branchId: string, classGroupId: string, classArmId?: string): Promise<PupilRow[]> {
  const active = await prisma.academicSession.findFirst({
    where: { branchId, status: SessionStatus.ACTIVE, archivedAt: null },
    select: { id: true },
  });
  return prisma.studentRecord.findMany({
    where: {
      branchId,
      archivedAt: null,
      enrollments: {
        some: { ...(active ? { sessionId: active.id } : {}), classArm: { classGroupId, ...(classArmId ? { id: classArmId } : {}) } },
      },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
    take: CLASS_SHEET_MAX + 1,
    select: PUPIL_SELECT,
  });
}

/// A class sheet (task 0113 D8): a new pupil code for every pupil (the dialog said how many it replaces), and for each pupil's main allowed guardian one code across the sheet. Brothers
/// and sisters on the sheet share it; a guardian who already holds a code keeps it (the slip says so); a guardian whose code this administrator may not make (children in a branch they
/// do not run) is left to the school office. So a parent never holds two codes.
export async function regenerateClass(actorUserId: string, scope: AdminScope, pupils: PupilRow[], which: Which): Promise<Slip[]> {
  const now = new Date();
  const pupilWrites: PupilWrite[] = [];
  const guardianWrites: GuardianWrite[] = [];
  const madeNow = new Map<string, { code: string; first: string }>();
  const slips: Slip[] = [];
  for (const pupil of pupils) {
    const slip = slipOf(pupil);
    if (which !== "guardian") {
      const code = newAccessCode();
      pupilWrites.push({ id: pupil.id, hash: hashAccessCode(code, pupil.id, "pupil"), at: now });
      slip.pupilCode = formatCode(code);
    }
    if (which !== "pupil") {
      const guardian = pupil.guardians[0]?.guardian;
      if (!guardian) {
        slip.guardianNote = "No guardian on record. Add one under the pupil's Guardians, then make their code.";
      } else {
        slip.guardianName = guardian.name;
        slip.family = otherChildren(guardian, pupil.id);
        const already = madeNow.get(guardian.id);
        if (already) {
          slip.guardianCode = formatCode(already.code);
          slip.guardianNote = `The same code as on ${already.first}'s slip: one code for all of ${guardian.name}'s children.`;
        } else if (guardian.codeAt) {
          slip.guardianNote = "Use the guardian code you already have. Lost it? The school can make a new one.";
        } else if (!mayActForGuardian(scope, [...new Set(guardian.children.map((c) => c.branchId))])) {
          slip.guardianNote = "The school office will give the guardian code.";
        } else {
          const code = newAccessCode();
          madeNow.set(guardian.id, { code, first: `${pupil.firstName} ${pupil.lastName}` });
          guardianWrites.push({ id: guardian.id, hash: hashAccessCode(code, guardian.id, "guardian"), at: now });
          slip.guardianCode = formatCode(code);
        }
      }
    }
    slips.push(slip);
  }
  await commit(actorUserId, pupilWrites, guardianWrites);
  return slips;
}
