import { z } from "zod";
import { fail } from "@/lib/api/envelope";
import { FinanceError } from "@/lib/finance/service";

// What the fee-item routes (task 0122) share: the answer for a refusal, and the bodies they accept.

const STATUS: Record<string, number> = { NOT_FOUND: 404, VALIDATION: 400, INVOICE_LOCKED: 409, NOT_OPTIONAL: 409, NOT_TRACKED: 409 };

/// A FinanceError becomes its answer; anything else is for the caller to log and answer 500.
export function feeItemFailure(error: unknown) {
  if (error instanceof FinanceError) return fail(error.message, STATUS[error.code ?? ""] ?? 400, error.code ?? "FINANCE_ERROR");
  return null;
}

export const optOutBody = z.strictObject({ optedOut: z.boolean(), note: z.string().trim().max(300).nullable().optional() });
export const handoverBody = z.strictObject({
  received: z.boolean(),
  receivedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Give the day as YYYY-MM-DD.")
    .nullable()
    .optional(),
  note: z.string().trim().max(300).nullable().optional(),
});
