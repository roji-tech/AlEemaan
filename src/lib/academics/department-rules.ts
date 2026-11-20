import "@/lib/zod-csp";
import { z } from "zod";

// The rules of departments (task 0101 D7), with NO database in them, so the browser and the server run the very same ones and every rule is unit-tested: the name, the words the person is
// told, who may do what to a department, and what choosing a head changes. `departments.ts` is the database side.

export const DEPARTMENT_NAME_MAX = 80;
export const DEPARTMENT_DESCRIPTION_MAX = 300;

/// A department's name: trimmed, inner runs of spaces collapsed ("Arabic  and   Islamic Studies" is "Arabic and Islamic Studies"), 1 to 80 characters.
export const departmentName = z
  .string()
  .transform((value) => value.trim().replace(/\s+/g, " "))
  .pipe(z.string().min(1, "Give a name.").max(DEPARTMENT_NAME_MAX, `Use at most ${DEPARTMENT_NAME_MAX} characters.`));
/// A line about the department, optional; a blank one is "none" and is stored as null.
export const departmentDescription = z
  .string()
  .trim()
  .max(DEPARTMENT_DESCRIPTION_MAX, `Use at most ${DEPARTMENT_DESCRIPTION_MAX} characters.`);

export const DEPARTMENT_TAKEN = "This branch already has a department with that name.";
export const DEPARTMENTS_OFF = "Departments are turned off for this branch.";
export const DEPARTMENT_ARCHIVED = "This department is archived. Restore it first.";
export const HEAD_CHANGED = "The head of this department changed while you were looking. Reload and try again.";

/// A blank description is not stored.
export const descriptionOrNull = (value: string | null | undefined): string | null => {
  const text = (value ?? "").trim();
  return text === "" ? null : text;
};

export type DepartmentAction = "read" | "members" | "subjects" | "rename" | "archive" | "head" | "switch";

/// May this caller do `action` to a department? `administers`: an administrator of the branch or a superadmin. `staff`: holds a staff role in the branch. `headOfThis`: is the head of THIS
/// department (a live staff record of the branch linked to their account). A head manages the members and the subjects of their own department and nothing more; everything else
/// (renaming, archiving, choosing the head, the branch's switch) is for administrators. Any staff role reads.
export function mayDoToDepartment(who: { administers: boolean; staff: boolean; headOfThis: boolean }, action: DepartmentAction): boolean {
  if (who.administers) return true;
  if (action === "read") return who.staff;
  if (action === "members" || action === "subjects") return who.staff && who.headOfThis;
  return false;
}

export type MemberLike = { staffRecordId: string; isHead: boolean };
export type HeadChange = {
  /// The head now, or null when there is none.
  oldHeadId: string | null;
  /// The head after: the person chosen, or null when the head is removed.
  newHeadId: string | null;
  changed: boolean;
  /// The person chosen is not yet a member: they are made one in the same step.
  addsMember: boolean;
};

/// What choosing `staffRecordId` as the head (or null for none) does to a department's members. The old head stays a member; the new one becomes the head, and a member too if they were not.
export function headChange(members: readonly MemberLike[], staffRecordId: string | null): HeadChange {
  const oldHeadId = members.find((m) => m.isHead)?.staffRecordId ?? null;
  return {
    oldHeadId,
    newHeadId: staffRecordId,
    changed: oldHeadId !== staffRecordId,
    addsMember: staffRecordId !== null && !members.some((m) => m.staffRecordId === staffRecordId),
  };
}

/// "HOD: Mrs Amina Yusuf", or "No head yet".
export const headLine = (headName: string | null): string => (headName ? `HOD: ${headName}` : "No head yet");

/// One short sentence for the audit row's reader and the notice on screen: "3 people added".
export const peopleText = (count: number): string => `${count} ${count === 1 ? "person" : "people"}`;
export const subjectsText = (count: number): string => `${count} ${count === 1 ? "subject" : "subjects"}`;
