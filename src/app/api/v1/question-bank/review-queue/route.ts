import { z } from "zod";
import { ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuthGated } from "@/lib/auth/branch-gate";
import { idSchema } from "@/lib/question-bank/validation";
import { reviewQueue } from "@/lib/question-bank/review-service";
import { BANK_STAFF_ROLES } from "@/lib/question-bank/items-http";

const Query = z.object({ branchId: idSchema.optional() });
type QueryParsed = Parsed<undefined, z.infer<typeof Query>>;

/// GET /api/v1/question-bank/review-queue?branchId=  The pending questions the caller has authority to decide, oldest first, never their own (a superadmin, who may decide anything, sees their own too). Overlap
/// flags are carried only on the questions where the caller is an exam approver. A person who reviews nothing gets an empty list.
export const GET = withAuthGated(
  "staff-read",
  validate({ query: Query }, async (_req, auth, _ctx, { query }: QueryParsed) => ok(await reviewQueue({ userId: auth.userId, branchId: query.branchId }))),
  { roles: BANK_STAFF_ROLES },
);
