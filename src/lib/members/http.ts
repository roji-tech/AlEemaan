import { z } from "zod";
import { Role } from "@prisma/client";
import { fail } from "@/lib/api/envelope";
import { adminScope, type AdminScope } from "@/lib/auth/branch-access";
import type { MemberFailure } from "./service";

// The HTTP face of the members/invitations rules: one place that turns a refusal into a status, a stable `code` and words a person can
// act on. An unknown member id is ONE answer (NOT_FOUND) — see service.ts.

export const ROLES = Object.values(Role) as [Role, ...Role[]];

/// A path parameter that cannot be an id of ours is the same "no such thing" as one that merely does not exist.
export const isPlausibleId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value);

export const emailField = z
  .string({ error: "Enter an email address." })
  .trim()
  .max(254, "That email address is too long.")
  .email("Enter a valid email address.")
  .toLowerCase();

export const roleField = z.enum(ROLES, { error: "Choose a role." });
export const branchIdField = z.string().min(1).max(64);

export const notFound = (what: string) => fail(`No such ${what}.`, 404, "NOT_FOUND");

export function memberFailure(reason: MemberFailure): Response {
  switch (reason) {
    case "NOT_FOUND":
      return notFound("member");
    case "SELF":
      return fail("You can't change your own access here. Ask another administrator.", 409, "SELF");
    case "LAST_SUPERADMIN":
      return fail("This is the school's last superadmin. Make someone else a superadmin first.", 409, "LAST_SUPERADMIN");
    case "ADMIN_ONLY":
      return fail("Only a superadmin can make or change an administrator or a superadmin.", 403, "FORBIDDEN");
    case "OUT_OF_SCOPE":
      return fail("You can only manage people in the branches you administer.", 403, "FORBIDDEN");
    case "INVALID_BRANCH":
      return fail("Choose one of the school's branches.", 400, "VALIDATION", [
        { path: "body.branchId", message: "Choose one of the school's branches." },
      ]);
    case "BRANCH_TAKEN":
      return fail("This person already has access in that branch.", 409, "BRANCH_TAKEN", [
        { path: "body.branchId", message: "This person already has access in that branch." },
      ]);
    case "DEACTIVATED":
      return fail("This person is deactivated. Reactivate them first.", 409, "DEACTIVATED");
    case "SUPERADMIN_ONLY":
      return fail("Only a superadmin can say who may approve results.", 403, "FORBIDDEN");
    case "NOT_APPROVER_ROLE":
      return fail(
        "Only teaching and non-teaching staff are given this. An administrator can approve results already.",
        409,
        "NOT_APPROVER_ROLE",
        [{ path: "body.canApproveResults", message: "Only teaching and non-teaching staff can be given this." }],
      );
  }
}

/// The caller's administration scope at THIS moment, or the 403 the `roles` gate gives when they have none (a membership deactivated between
/// the gate and here must not turn into a 404 about someone else's member). Every administrator route starts from this.
export async function scopeOrForbidden(userId: string): Promise<AdminScope | Response> {
  const scope = await adminScope(userId);
  if (!scope.superAdmin && scope.branchIds.length === 0) return fail("You don't have permission to do that", 403, "FORBIDDEN");
  return scope;
}
