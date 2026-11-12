import { Role } from "@prisma/client";
import { fail, ok } from "@/lib/api/envelope";
import type { Result } from "./common";

/// Who may reach a programs route at all: anyone holding a staff role (a program admin can be a teacher). The service decides what each of them may do with a given program.
export const PROGRAM_ROUTE_ROLES = [Role.ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF] as const;

/// A service result as the standard envelope: the data on success (with `status`, 200 unless a route says 201), the refusal's status, code, message and field details otherwise.
export function respond<T>(result: Result<T>, status = 200) {
  return result.ok ? ok(result.data, {}, status) : fail(result.message, result.status, result.code, result.details);
}
