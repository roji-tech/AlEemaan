import { Prisma } from "@prisma/client";
import { parseBands, type Band } from "./assessment-rules";
import { change, done, refuse, writeAudit, type Result } from "./common";
import { parseSignatories, wordingProblem, type Signatory } from "./completion-rules";

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
});

export async function updateProgramSettings(
  actorUserId: string,
  programId: string,
  input: ProgramSettingsInput,
): Promise<Result<ProgramSettings>> {
  return change(actorUserId, programId, "manage", async ({ tx, program }) => {
    const before = settingsOf(program);
    const next: ProgramSettings = { ...before, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) };
    if (JSON.stringify(next) === JSON.stringify(before)) return done(next);
    const problem = wordingProblem({ title: next.certTitle, body: next.certBody, signatories: next.certSignatories });
    if (problem) {
      const field = /title/i.test(problem) ? "certTitle" : /signator/i.test(problem) ? "certSignatories" : "certBody";
      return refuse(400, "VALIDATION", problem, [{ path: `body.${field}`, message: problem }]);
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
