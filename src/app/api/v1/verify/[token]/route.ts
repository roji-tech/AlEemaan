import { ok, fail } from "@/lib/api/envelope";
import { getClientIp, reserveAttempt } from "@/lib/auth/rate-limit";
import { verifyToken } from "@/lib/academics/report-card";

type Context = { params: Promise<{ token: string }> };

// GET /api/v1/verify/[token]   PUBLIC. Says that one published result is genuine and where and when it belongs - and nothing about its marks: no scores, no admission
// number, no other pupil. A token that does not exist, was never issued or has been withdrawn gets the same plain "not found". Rate limited per client address.
export async function GET(req: Request, context: Context) {
  if (!(await reserveAttempt(`verify:${getClientIp(req)}`, 60)))
    return fail("Too many checks. Please wait a few minutes and try again.", 429, "RATE_LIMITED");
  const result = await verifyToken((await context.params).token);
  return result ? ok({ verification: result }) : fail("This verification code was not found.", 404, "NOT_FOUND");
}
