import { after } from "next/server";
import { z } from "zod";
import { fail, ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { reserveAttempt } from "@/lib/auth/rate-limit";
import { mailInvitation } from "@/lib/invitations/mail";
import { listDraftIds, sendDraftInvitation } from "@/lib/invitations/service";
import { scopeOrForbidden } from "@/lib/members/http";

// POST /api/v1/invitations/drafts/send { ids? }   (task 0101 D2: "Send all drafts")
// Sends the caller's drafts, oldest first, at most BATCH in one request: the ones named in `ids`, or every draft they may see. Each send is counted against the administrator's creating limit
// (30 per five minutes) like any invitation; when it runs out the rest are left as drafts and `rateLimited` says so. The answer lists each draft's outcome and how many drafts remain, so the
// screen can call again until none do. E-mails go out after the response. ADMIN only; a branch administrator sees only their branches' drafts (and never an administrator's).
const BATCH = 20;
const CREATES_PER_WINDOW = 30;
const body = z.strictObject({ ids: z.array(z.string().min(1).max(64)).max(200).optional() });

export const POST = withAuth(
  validate({ body }, async (_req, auth: AuthContext, _ctx: unknown, { body: input }) => {
    const scope = await scopeOrForbidden(auth.userId);
    if (scope instanceof Response) return scope;
    const wanted = input.ids ? [...new Set(input.ids)].slice(0, BATCH) : await listDraftIds(scope, BATCH);
    const outcomes: { id: string; email?: string; result: "sent" | "skipped" | "rate-limited"; why?: string }[] = [];
    const mails: { email: string; token: string; branchName: string; role: Parameters<typeof mailInvitation>[0]["role"] }[] = [];
    let rateLimited = false;
    for (const id of wanted) {
      if (!(await reserveAttempt(`invite:create:${auth.userId}`, CREATES_PER_WINDOW))) {
        rateLimited = true;
        outcomes.push({ id, result: "rate-limited" });
        break;
      }
      const result = await sendDraftInvitation(auth.userId, id, scope);
      if (result.ok) {
        outcomes.push({ id, email: result.invitation.email, result: "sent" });
        mails.push({
          email: result.invitation.email,
          token: result.token,
          branchName: result.invitation.branchName,
          role: result.invitation.role,
        });
      } else {
        outcomes.push({ id, result: "skipped", why: result.reason });
      }
    }
    after(async () => {
      for (const m of mails) {
        try {
          await mailInvitation({ ...m, inviterName: auth.user.name });
        } catch (error) {
          console.error("[invitations] mail failed:", error instanceof Error ? error.message : error);
        }
      }
    });
    const remaining = (await listDraftIds(scope, 1000)).length;
    if (rateLimited && mails.length === 0) return fail("Too many invitations. Please try again in a few minutes.", 429, "RATE_LIMITED");
    return ok({ outcomes, sent: mails.length, remaining, rateLimited });
  }),
  { roles: ["ADMIN"] },
);
