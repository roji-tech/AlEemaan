import { z } from "zod";
import { fail } from "@/lib/api/envelope";
import { ID_PATTERN } from "@/lib/api/ids";
import { reserveAttempt } from "@/lib/auth/rate-limit";
import { stepUpFailure, stepUpProofSchema, verifyStepUpProof, type StepUpProofInput } from "@/lib/auth/step-up";
import { UNSECTIONED_VALUES } from "./unsectioned-approval";
import type { ApproverSettingsFailure } from "./approver-settings";
import { SCOPES_PER_PERSON_MAX } from "./section-rules";

// The HTTP face of the sections and approver-scope settings (task 0039, slice 2b): the request bodies, the limiter, and the one place that turns a refusal into a status, a
// stable `code` and words a person can act on. An unknown id and another branch's id share ONE answer (NOT_FOUND), as everywhere else. Every write carries a fresh proof
// (`stepUp`): changing who may approve results is the kind of change a stolen session should not be able to make quietly.

const idField = z.string({ error: "Give an id." }).regex(ID_PATTERN, "Give an id.");
const nameField = z.string({ error: "Give a name." }).max(400, "That is too long.");
const sortOrderField = z.number({ error: "The order must be a whole number from 0 to 999." }).int().min(0).max(999);

export const branchQuery = z.object({ branchId: idField });

export const createSectionBody = z.strictObject({ branchId: idField, name: nameField, sortOrder: sortOrderField.optional(), stepUp: stepUpProofSchema });

export const updateSectionBody = z
  .strictObject({
    name: nameField.optional(),
    sortOrder: sortOrderField.optional(),
    archived: z.boolean({ error: "Say whether it is archived." }).optional(),
    stepUp: stepUpProofSchema,
  })
  .refine((body) => body.name !== undefined || body.sortOrder !== undefined || body.archived !== undefined, {
    message: "Give at least one of name, sortOrder and archived.",
  });

export const placeClassGroupBody = z.strictObject({ sectionId: idField.nullable(), stepUp: stepUpProofSchema });

const scopeEntry = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("GENERAL") }),
  z.strictObject({ kind: z.literal("SECTION"), sectionId: idField }),
  z.strictObject({ kind: z.literal("CLASS"), classGroupId: idField }),
]);
export const setScopesBody = z.strictObject({
  branchId: idField,
  scopes: z.array(scopeEntry, { error: "Give the scopes as a list." }).max(SCOPES_PER_PERSON_MAX, "That is too many."),
  stepUp: stepUpProofSchema,
});

export const unsectionedBody = z.strictObject({ branchId: idField, value: z.enum(UNSECTIONED_VALUES, { error: "Choose one of the two." }), stepUp: stepUpProofSchema });

const WRITES_PER_WINDOW = 120;
/// One superadmin's changes to sections and scopes are limited like the Users page's: a runaway client cannot hammer the approval setup.
export async function settingsWriteLimited(userId: string): Promise<Response | null> {
  if (await reserveAttempt(`approver-settings:write:${userId}`, WRITES_PER_WINDOW)) return null;
  return fail("Too many changes. Please try again in a few minutes.", 429, "RATE_LIMITED");
}

/// The fresh proof of a write, or the response that refuses it. Asked AFTER the cheap checks (does the branch exist), so a proof is not spent on a request that cannot work.
export async function proofRefusal(userId: string, proof: StepUpProofInput): Promise<Response | null> {
  const result = await verifyStepUpProof(userId, proof);
  return result.ok ? null : stepUpFailure(result);
}

export function approverSettingsFailure(reason: ApproverSettingsFailure, what?: string): Response {
  switch (reason) {
    case "NOT_FOUND":
      return fail(`No such ${what ?? "item"}.`, 404, "NOT_FOUND");
    case "INVALID_NAME":
      return fail("Give it a name of 1 to 80 characters.", 400, "VALIDATION", [{ path: "body.name", message: "Give it a name (not blank, at most 80 characters)." }]);
    case "NAME_TAKEN":
      return fail("Another section in that branch already has that name.", 409, "NAME_TAKEN", [
        { path: "body.name", message: "Another section in that branch already has that name." },
      ]);
    case "ARCHIVED":
      return fail(`That ${what ?? "item"} is archived. Restore it first.`, 409, "ARCHIVED");
    case "NOT_AN_APPROVER":
      return fail("That person does not hold the permission to approve results. Give them the permission first.", 409, "NOT_AN_APPROVER");
    case "GENERAL_WITH_OTHERS":
      return fail("General already covers every class. Remove the other entries, or remove General.", 400, "VALIDATION", [
        { path: "body.scopes", message: "General already covers every class." },
      ]);
  }
}
