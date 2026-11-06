import { prisma } from "@/lib/db";
import { effectiveSwitch } from "@/lib/settings/ceiling-switch";

// Programs: the three-level switch every optional part of a program shares (attendance, assessments, fees). The school's value and each branch's are the ceiling (the shared ceiling switch);
// the program has its own flag. On for a program only when the school, the program and at least one of its branches have it on. A branch that has it off only leaves its own people out
// while the others go on. What was recorded stays readable whatever the switches say.

export type FeatureState = {
  on: boolean;
  /// Who decided it is off: the school, the program itself, or every branch of the program.
  offBy: "SCHOOL" | "PROGRAM" | "BRANCH" | null;
  /// The branches whose own switch is off.
  branchesOff: { id: string; name: string }[];
  onBranchIds: Set<string>;
};

type Stored = (branchIds: readonly string[]) => Promise<{ school: boolean | undefined; branch: Map<string, boolean | undefined> }>;

export async function featureStateOf(stored: Stored, programId: string, programFlag: boolean): Promise<FeatureState> {
  const links = await prisma.programBranch.findMany({
    where: { programId },
    select: { branchId: true, branch: { select: { name: true } } },
  });
  const ids = links.map((link) => link.branchId);
  const { school, branch } = await stored(ids);
  const onBranchIds = new Set(ids.filter((id) => effectiveSwitch(school, branch.get(id))));
  const offBy = school === false ? "SCHOOL" : !programFlag ? "PROGRAM" : onBranchIds.size === 0 ? "BRANCH" : null;
  return {
    on: offBy === null,
    offBy,
    onBranchIds,
    branchesOff: links.filter((link) => !onBranchIds.has(link.branchId)).map((link) => ({ id: link.branchId, name: link.branch.name })),
  };
}
