import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DEFAULT_SCHOOL_NAME, contactFields } from "@/lib/settings/school-settings";
import {
  PROFILE_FIELDS,
  mergeProfile,
  setValue,
  type EffectiveProfile,
  type ProfileField,
  type ProfileValues,
} from "@/lib/settings/branch-profile-rules";

// School details per branch (task 0115, task 0101 D4). The pure rules (what a branch shows, where each value came from) are in branch-profile-rules.ts; this file reads and writes them.

type Row = Partial<Record<ProfileField, string | null>> | null | undefined;

const valuesOf = (row: Row): ProfileValues => {
  const values = {} as ProfileValues;
  for (const field of PROFILE_FIELDS) values[field] = setValue(row?.[field]);
  return values;
};

/// What a branch shows about itself: the school's name (school-wide) and, for each of the six details, the branch's own value when it has one, else the school's, with where it came
/// from. THE one place that answers this: anything printed or sent about ONE branch asks here, so no screen decides for itself. A document that spans branches, or has none, keeps the
/// school-wide row. Reads only: it never creates the school's row (an empty school gives the default name and no details).
export async function profileFor(branchId: string): Promise<EffectiveProfile & { schoolName: string }> {
  const [school, own] = await Promise.all([
    prisma.schoolSettings.findUnique({ where: { id: "global" } }),
    prisma.branchProfile.findUnique({ where: { branchId } }),
  ]);
  return { schoolName: school?.name ?? DEFAULT_SCHOOL_NAME, ...mergeProfile(school, own) };
}

export type BranchProfileView = {
  /// The school-wide values (what "Using the school's" refers to).
  school: ProfileValues;
  /// The branch's own values; null where it has none.
  branch: ProfileValues;
  effective: EffectiveProfile;
};

/// The three views of one branch's details the screen needs.
export async function branchProfileView(branchId: string): Promise<BranchProfileView> {
  const [school, own] = await Promise.all([
    prisma.schoolSettings.findUnique({ where: { id: "global" } }),
    prisma.branchProfile.findUnique({ where: { branchId } }),
  ]);
  return { school: valuesOf(school), branch: valuesOf(own), effective: mergeProfile(school, own) };
}

// The same rules as the school's own form (`contactFields`), except that blank or only spaces clears the branch's value (null) instead of being refused: "Using the school's" again.
const clearable = <T extends z.ZodType>(field: T) =>
  z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? null : value), field);

export const branchProfilePatchSchema = z.strictObject({
  branchId: z.string().trim().min(1).max(64),
  principal: clearable(contactFields.principal),
  phone: clearable(contactFields.phone),
  motto: clearable(contactFields.motto),
  address: clearable(contactFields.address),
  email: clearable(contactFields.email),
  website: clearable(contactFields.website),
});
export type BranchProfilePatch = z.infer<typeof branchProfilePatchSchema>;

export const branchProfileQuerySchema = z.object({ branchId: z.string().trim().min(1).max(64) });

async function writeOnce(actorUserId: string, branchId: string, patch: Partial<Record<ProfileField, string | null>>) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.branchProfile.findUnique({ where: { branchId } });
    const before: Partial<ProfileValues> = {};
    const after: Partial<ProfileValues> = {};
    const data: Partial<ProfileValues> = {};
    for (const field of PROFILE_FIELDS) {
      const asked = patch[field];
      if (asked === undefined) continue; // not sent: left as it is
      const next = setValue(asked);
      const was = setValue(existing?.[field]);
      if (next === was) continue;
      before[field] = was;
      after[field] = next;
      data[field] = next;
    }
    const changed = (Object.keys(data) as ProfileField[]).sort((a, b) => PROFILE_FIELDS.indexOf(a) - PROFILE_FIELDS.indexOf(b));
    if (changed.length === 0) return changed;
    const row = existing
      ? await tx.branchProfile.update({ where: { branchId }, data })
      : await tx.branchProfile.create({ data: { branchId, ...data } });
    await tx.auditLog.create({
      data: {
        actorUserId,
        action: "BRANCH_PROFILE_UPDATED",
        targetType: "BranchProfile",
        targetId: row.id,
        beforeValue: { branchId, ...before },
        afterValue: { branchId, ...after },
      },
    });
    return changed;
  });
}

/// Saves the details that CHANGED (a field not sent, or sent with the value it already has, is left alone and not audited; blank or null clears the branch's own value). Returns the names
/// of the fields that changed, in screen order, and writes nothing at all when there are none. Two first saves at once make one row: the loser reads it and updates.
export async function updateBranchProfile(
  actorUserId: string,
  branchId: string,
  patch: Partial<Record<ProfileField, string | null>>,
): Promise<ProfileField[]> {
  try {
    return await writeOnce(actorUserId, branchId, patch);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return writeOnce(actorUserId, branchId, patch);
    throw error;
  }
}
