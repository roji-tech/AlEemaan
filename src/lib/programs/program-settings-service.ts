import { Prisma, type ProgressGuardianDetail, type ProgressWriters } from "@prisma/client";
import { parseBands, type Band } from "./assessment-rules";
import { change, done, refuse, writeAudit, type Result } from "./common";
import { parseSignatories, wordingProblem, type Signatory } from "./completion-rules";
import { isPresetKey, presetSchema, type PresetKey } from "./progress-templates";

// The program's own settings (task 0043): its switches and numbers, the grade bands, the completion rule and the wording of its certificates. A super admin or a program admin; saving what is
// stored already writes nothing; every change is audited with the old and new values.

export type ProgramSettings = {
  attendanceEnabled: boolean;
  lowAttendancePercent: number;
  assessmentsEnabled: boolean;
  gradeBands: Band[];
  feesEnabled: boolean;
  certTitle: string;
  certBody: string;
  certSignatories: Signatory[];
  completionMinAverage: number | null;
  completionRequirePassed: boolean;
  noCertWhileOwing: boolean;
  progressEnabled: boolean;
  progressTemplate: PresetKey | null;
  progressWriters: ProgressWriters;
  progressRequireVerification: boolean;
  progressFourEyes: boolean;
  progressLockInactivity: number;
  progressLockRelease: number;
  progressStudentView: boolean;
  progressGuardianView: boolean;
  progressGuardianDetail: ProgressGuardianDetail;
};
export type ProgramSettingsInput = Partial<ProgramSettings>;

type Stored = Pick<
  Prisma.ProgramGetPayload<object>,
  | "attendanceEnabled"
  | "lowAttendancePercent"
  | "assessmentsEnabled"
  | "gradeBands"
  | "feesEnabled"
  | "certTitle"
  | "certBody"
  | "certSignatories"
  | "completionMinAverage"
  | "completionRequirePassed"
  | "noCertWhileOwing"
  | "progressEnabled"
  | "progressTemplate"
  | "progressWriters"
  | "progressRequireVerification"
  | "progressFourEyes"
  | "progressLockInactivity"
  | "progressLockRelease"
  | "progressStudentView"
  | "progressGuardianView"
  | "progressGuardianDetail"
>;

export const settingsOf = (program: Stored): ProgramSettings => ({
  attendanceEnabled: program.attendanceEnabled,
  lowAttendancePercent: program.lowAttendancePercent,
  assessmentsEnabled: program.assessmentsEnabled,
  gradeBands: parseBands(program.gradeBands),
  feesEnabled: program.feesEnabled,
  certTitle: program.certTitle,
  certBody: program.certBody,
  certSignatories: parseSignatories(program.certSignatories),
  completionMinAverage: program.completionMinAverage === null ? null : Number(program.completionMinAverage),
  completionRequirePassed: program.completionRequirePassed,
  noCertWhileOwing: program.noCertWhileOwing,
  progressEnabled: program.progressEnabled,
  progressTemplate: isPresetKey(program.progressTemplate) ? program.progressTemplate : null,
  progressWriters: program.progressWriters,
  progressRequireVerification: program.progressRequireVerification,
  progressFourEyes: program.progressFourEyes,
  progressLockInactivity: program.progressLockInactivity,
  progressLockRelease: program.progressLockRelease,
  progressStudentView: program.progressStudentView,
  progressGuardianView: program.progressGuardianView,
  progressGuardianDetail: program.progressGuardianDetail,
});

export async function updateProgramSettings(
  actorUserId: string,
  programId: string,
  input: ProgramSettingsInput,
): Promise<Result<ProgramSettings>> {
  return change(actorUserId, programId, "manage", async ({ tx, program, viewer }) => {
    const before = settingsOf(program);
    const next: ProgramSettings = { ...before, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) };
    if (JSON.stringify(next) === JSON.stringify(before)) return done(next);
    const problem = wordingProblem({ title: next.certTitle, body: next.certBody, signatories: next.certSignatories });
    if (problem) {
      const field = /title/i.test(problem) ? "certTitle" : /signator/i.test(problem) ? "certSignatories" : "certBody";
      return refuse(400, "VALIDATION", problem, [{ path: `body.${field}`, message: problem }]);
    }
    // Progress records: the template is chosen once records are wanted; it cannot be swapped under records already kept; four-eyes is the school's decision, not a program admin's.
    if (next.progressFourEyes !== before.progressFourEyes && viewer.level !== "SUPER")
      return refuse(403, "FORBIDDEN", "Only a super admin can change whether someone else has to verify an entry.");
    if (next.progressEnabled && !next.progressTemplate)
      return refuse(400, "VALIDATION", "Choose a template before turning progress records on.", [
        { path: "body.progressTemplate", message: "Choose a template first." },
      ]);
    if (next.progressTemplate !== before.progressTemplate && next.progressTemplate) {
      if ((await tx.progressRecord.count({ where: { programId: program.id } })) > 0)
        return refuse(409, "TEMPLATE_IN_USE", "Records have been started with the current template, so it can't be swapped.");
      const exists = await tx.progressTemplate.findFirst({
        where: { programId: program.id, key: next.progressTemplate, version: 1 },
        select: { id: true },
      });
      if (!exists)
        await tx.progressTemplate.create({
          data: {
            programId: program.id,
            key: next.progressTemplate,
            version: 1,
            schema: presetSchema(next.progressTemplate) as unknown as Prisma.InputJsonValue,
            createdByUserId: actorUserId,
          },
        });
    }
    await tx.program.update({
      where: { id: program.id },
      data: {
        attendanceEnabled: next.attendanceEnabled,
        lowAttendancePercent: next.lowAttendancePercent,
        assessmentsEnabled: next.assessmentsEnabled,
        feesEnabled: next.feesEnabled,
        gradeBands: next.gradeBands.length === 0 ? Prisma.DbNull : (next.gradeBands as unknown as Prisma.InputJsonValue),
        certTitle: next.certTitle,
        certBody: next.certBody,
        certSignatories: next.certSignatories.length === 0 ? Prisma.DbNull : (next.certSignatories as unknown as Prisma.InputJsonValue),
        completionMinAverage: next.completionMinAverage,
        completionRequirePassed: next.completionRequirePassed,
        noCertWhileOwing: next.noCertWhileOwing,
        progressEnabled: next.progressEnabled,
        progressTemplate: next.progressTemplate,
        progressWriters: next.progressWriters,
        progressRequireVerification: next.progressRequireVerification,
        progressFourEyes: next.progressFourEyes,
        progressLockInactivity: next.progressLockInactivity,
        progressLockRelease: next.progressLockRelease,
        progressStudentView: next.progressStudentView,
        progressGuardianView: next.progressGuardianView,
        progressGuardianDetail: next.progressGuardianDetail,
      },
    });
    await writeAudit(tx, {
      programId: program.id,
      actorUserId,
      action: "PROGRAM_SETTINGS_CHANGED",
      targetType: "Program",
      targetId: program.id,
      before: before as unknown as Prisma.InputJsonValue,
      after: next as unknown as Prisma.InputJsonValue,
    });
    return done(next);
  });
}
