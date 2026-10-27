import { z } from "zod";
import { ok } from "@/lib/api/envelope";
import { validate, readJsonBody, type Parsed } from "@/lib/api/validate";
import { withAuthGated } from "@/lib/auth/branch-gate";
import { idSchema } from "@/lib/question-bank/validation";
import { createItem, listItems, LIST_MAX } from "@/lib/question-bank/items-service";
import { BANK_STAFF_ROLES, failure } from "@/lib/question-bank/items-http";
import { fail } from "@/lib/api/envelope";

// The question bank's questions (task 0032 slice 2.1). Who may call is decided in the services by `rules.ts`; the gate here only checks the branch the request names.

const Query = z.object({
  branchId: idSchema.optional(),
  status: z.enum(["DRAFT", "PENDING", "APPROVED", "REJECTED", "RETIRED"]).optional(),
  q: z.string().trim().min(1).max(100).optional(),
  subjectKey: z.string().trim().min(1).max(80).optional(),
  classTagKey: z.string().trim().min(1).max(40).optional(),
  mine: z.enum(["1", "true"]).optional(),
  cursor: z.string().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(LIST_MAX).optional(),
});
type ListParsed = Parsed<undefined, z.infer<typeof Query>>;

/// GET /api/v1/question-bank/items?branchId=&status=&q=&subjectKey=&classTagKey=&mine=1&cursor=&limit=
/// A page of the questions the caller may see, newest first. Every row has passed `staffMaySee`; a draft is its writer's alone.
export const GET = withAuthGated(
  "staff-read",
  validate({ query: Query }, async (_req, auth, _ctx, { query }: ListParsed) => {
    const { mine, ...rest } = query;
    const page = await listItems({ userId: auth.userId, query: { ...rest, mine: mine !== undefined } });
    return ok({ items: page.items }, { nextCursor: page.nextCursor });
  }),
  { roles: BANK_STAFF_ROLES },
);

/// POST /api/v1/question-bank/items  { branchId, type, prompt, ... }  A new question, saved as a DRAFT only its writer sees. The rest of the body is `parseItem`'s.
export const POST = withAuthGated(
  "staff-read",
  async (req, auth) => {
    const read = await readJsonBody(req);
    if (!read.ok) return read.response;
    const { branchId, ...item } = (read.json && typeof read.json === "object" && !Array.isArray(read.json) ? read.json : {}) as Record<string, unknown>;
    const branch = idSchema.safeParse(branchId);
    if (!branch.success) return fail("Choose the branch the question is for.", 400, "VALIDATION");
    const result = await createItem({ userId: auth.userId, branchId: branch.data, body: item });
    if (!result.ok) return failure(result);
    return ok({ item: result.item }, {}, 201);
  },
  { roles: BANK_STAFF_ROLES },
);
