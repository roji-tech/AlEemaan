import { z } from "zod";
import { Role } from "@prisma/client";
import { fail, noStore, ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { setHandover } from "@/lib/finance/fee-items";
import { feeItemFailure, handoverBody } from "@/lib/finance/fee-items-http";

type Context = { params: Promise<{ studentId: string; feeId: string }> };
const query = z.object({ branchId: z.string().trim().min(1).max(64) });

/// PUT /api/v1/finance/students/[studentId]/fee-items/[feeId]/handover?branchId= { received, receivedOn?, note? } (task 0122)
/// Record that a pupil received a tracked item (the uniform), or undo it. It records only: no invoice or payment waits for it.
export const PUT = withAuth<Context>(
  validate<z.infer<typeof handoverBody>, z.infer<typeof query>, AuthContext, Context>(
    { body: handoverBody, query },
    withBranch<Parsed<z.infer<typeof handoverBody>, z.infer<typeof query>>, AuthContext, Context>(
      { of: ({ query: q }) => q.branchId, as: "administer" },
      async (_req, auth, ctx, { body, query: q }) => {
        try {
          const { studentId, feeId } = await ctx.params;
          return noStore(
            ok(
              await setHandover(q.branchId, studentId, feeId, body.received, auth.userId, { receivedOn: body.receivedOn, note: body.note }),
            ),
          );
        } catch (error) {
          const known = feeItemFailure(error);
          if (known) return known;
          console.error("[FEE_HANDOVER_ERROR]", error);
          return fail("Unable to record the handover", 500, "INTERNAL");
        }
      },
    ),
  ),
  { roles: [Role.ADMIN] },
);
