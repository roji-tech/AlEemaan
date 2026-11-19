import { prisma } from "@/lib/db";
import { fail } from "@/lib/api/envelope";
import { readPupilFilters, type PupilFilters } from "@/lib/students/list-filters";

/// The pupil list's filters from the address, checked against the database (task 0103 D1): a class needs a branch, and a class or arm that is not that branch's is a 404, exactly like an
/// unknown id, so the answer never says that it exists elsewhere. Shared by the list and its export.
export async function readListFilters(
  params: URLSearchParams,
  branchId: string | undefined,
): Promise<{ ok: true; filters: PupilFilters } | { ok: false; response: ReturnType<typeof fail> }> {
  const parsed = readPupilFilters(params);
  if (!parsed.success) return { ok: false, response: fail(parsed.error.issues[0]?.message ?? "Those filters cannot be used.", 400, "VALIDATION") };
  const filters = parsed.data;
  if (filters.classGroupId) {
    if (!branchId) return { ok: false, response: fail("Choose the branch before its class.", 400, "VALIDATION") };
    const group = await prisma.classGroup.findFirst({ where: { id: filters.classGroupId, branchId }, select: { id: true } });
    if (!group) return { ok: false, response: fail("No such class.", 404, "NOT_FOUND") };
    if (filters.classArmId) {
      const arm = await prisma.classArm.findFirst({ where: { id: filters.classArmId, branchId, classGroupId: group.id }, select: { id: true } });
      if (!arm) return { ok: false, response: fail("No such arm.", 404, "NOT_FOUND") };
    }
  }
  return { ok: true, filters };
}
