import { z } from "zod";
import { ID_PATTERN } from "@/lib/api/ids";
import { parsePolicy, type PartPaymentPolicy } from "./part-payment";

// Every body is `.strict()`: a key the route does not know is a mistake or an attack, and it is refused, never ignored.

const minimum = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("NONE") }).strict(),
  z.object({ kind: z.literal("AMOUNT"), value: z.number() }).strict(),
  z.object({ kind: z.literal("PERCENT"), value: z.number() }).strict(),
]);

const policy = z
  .object({ allowed: z.boolean(), minimum })
  .strict()
  // The same strict reading the server uses for what it stored: an amount of up to two decimals, at most a billion; a percentage from 1 to 100.
  .refine(
    (value) => parsePolicy(value) !== undefined,
    "The smallest part must be an amount in naira with at most two decimals, or a percentage from 1 to 100",
  )
  .transform((value) => parsePolicy(value) as PartPaymentPolicy);

export const partPaymentSettingSchema = z
  .object({
    scope: z.enum(["GLOBAL", "BRANCH"]),
    branchId: z.string().regex(ID_PATTERN, "The branch is not valid").optional(),
    /// null removes the stored value (back to the default: part payments allowed, any amount).
    policy: policy.nullable(),
    reason: z.string().trim().max(200).optional(),
  })
  .strict()
  .refine(
    (value) => (value.scope === "BRANCH") === (value.branchId !== undefined),
    "A branch value names the branch and a school value does not",
  );

export const payInFullSchema = z.object({ payInFull: z.boolean() }).strict();
