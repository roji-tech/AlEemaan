import { SchemeScopeLevel, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

// The assessment scheme set for a class group, read the same way by the one-class route and the whole-branch list (task 0112, task 0108 D3: the Scheme levels section asked once per
// class; ten classes were ten requests). A class's scheme is the one a CLASS_GROUP scope points to, else a live scheme made for that class. No scheme is `null`, a normal state (task 0108).

const withComponents = { components: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } } satisfies Prisma.AssessmentSchemeInclude;
type SchemeRow = Prisma.AssessmentSchemeGetPayload<{ include: typeof withComponents }>;

export type ClassGroupScheme = {
  id: string;
  branchId: string;
  classGroupId: string | null;
  name: string;
  totalMax: number;
  examMax: number;
  version: number;
  locked: boolean;
  archived: boolean;
  components: { id: string; name: string; maxScore: number; sortOrder: number }[];
};

export function serializeScheme(scheme: SchemeRow): ClassGroupScheme {
  return {
    id: scheme.id,
    branchId: scheme.branchId,
    classGroupId: scheme.classGroupId,
    name: scheme.name,
    totalMax: Number(scheme.totalMax),
    examMax: Number(scheme.examMax),
    version: scheme.version,
    locked: scheme.lockedAt !== null,
    archived: scheme.archivedAt !== null,
    components: scheme.components.map((c) => ({ id: c.id, name: c.name, maxScore: Number(c.maxScore), sortOrder: c.sortOrder })),
  };
}

/// The scheme of each of these class groups of ONE branch (the caller has already checked the branch): two queries, whatever the number of classes. Every id asked for is in the answer.
export async function schemesForClassGroups(branchId: string, classGroupIds: string[]): Promise<Record<string, ClassGroupScheme | null>> {
  const answer: Record<string, ClassGroupScheme | null> = Object.fromEntries(classGroupIds.map((id) => [id, null]));
  if (classGroupIds.length === 0) return answer;
  const [scopes, own] = await Promise.all([
    prisma.assessmentSchemeScope.findMany({
      where: { level: SchemeScopeLevel.CLASS_GROUP, branchId, classGroupId: { in: classGroupIds }, scheme: { archivedAt: null } },
      orderBy: { createdAt: "asc" },
      include: { scheme: { include: withComponents } },
    }),
    prisma.assessmentScheme.findMany({
      where: { branchId, classGroupId: { in: classGroupIds }, archivedAt: null },
      orderBy: { createdAt: "asc" },
      include: withComponents,
    }),
  ]);
  // A scope wins over a scheme made for the class, as in the one-class read; the first of each kind (the oldest) when there are several.
  for (const row of own) if (row.classGroupId && answer[row.classGroupId] === null) answer[row.classGroupId] = serializeScheme(row);
  const fromScope = new Set<string>();
  for (const scope of scopes) {
    if (!scope.classGroupId || fromScope.has(scope.classGroupId)) continue;
    fromScope.add(scope.classGroupId);
    answer[scope.classGroupId] = serializeScheme(scope.scheme);
  }
  return answer;
}
