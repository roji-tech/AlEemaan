import { fail } from "@/lib/api/envelope";
import { ConflictError, ForbiddenError } from "@/lib/academics/structure";
import { DomainError } from "@/lib/academics/sessions";

export const READ_ROLES = ["ADMIN", "TEACHING_STAFF", "NON_TEACHING_STAFF"] as const;

/// Runs a structure operation and turns its refusals into responses. A `ConflictError` (a duplicate name, an archived parent, a subject of another branch) is
/// a 409 with the message written for the caller; any other exception is logged and answered with a fixed 500 (ISS-0006: an exception's text is never returned).
export async function structureCall(label: string, run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ForbiddenError) return fail(error.message, 403, "FORBIDDEN");
    if (error instanceof ConflictError) return fail(error.message, 409, "CONFLICT");
    if (error instanceof DomainError) return fail(error.message, 400, "VALIDATION");
    console.error(`[${label}]`, error);
    return fail("Something went wrong. Nothing was changed.", 500, "INTERNAL");
  }
}

export const notFound = (what: string) => fail(`${what} not found`, 404, "NOT_FOUND");
