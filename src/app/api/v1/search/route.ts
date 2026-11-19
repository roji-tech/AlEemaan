import { z } from "zod";
import { ok, fail, noStore } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { reserveAttempt } from "@/lib/auth/rate-limit";
import { QUERY_MAX, QUERY_MIN, searchRecords } from "@/lib/search/records";

// GET /api/v1/search?q=   records for the top-bar search (task 0113): pupils, staff, classes, subjects, invoices, and people with an account for a superadmin.
// Staff only. What each kind may return, and from which branches, is decided in `searchRecords` (lib/search/records.ts). Rate limited per person: the screen waits for a pause in the typing,
// so SEARCH_LIMIT requests in the limiter's window (5 minutes) is generous for a person and a ceiling for a script. Never cached.
const SEARCH_LIMIT = 150;
const query = z.object({ q: z.string().max(QUERY_MAX, `Use at most ${QUERY_MAX} characters`) });
type Query = Parsed<undefined, z.infer<typeof query>>;

export const GET = withAuth(
  validate({ query }, async (_req, auth: AuthContext, _ctx: unknown, { query }: Query) => {
    if (query.q.trim().length < QUERY_MIN) return noStore(ok({ results: [] }));
    if (!(await reserveAttempt(`search:user:${auth.userId}`, SEARCH_LIMIT))) {
      return noStore(fail("Too many searches in a few minutes. Please wait a moment.", 429, "RATE_LIMITED"));
    }
    try {
      return noStore(ok({ results: await searchRecords(auth.userId, query.q) }));
    } catch (error) {
      console.error("[SEARCH_ERROR]", error);
      return noStore(fail("Search is unavailable at the moment.", 500, "INTERNAL"));
    }
  }),
  { roles: ["ADMIN", "TEACHING_STAFF", "NON_TEACHING_STAFF"] },
);
