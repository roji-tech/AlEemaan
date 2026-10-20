import type { NextRequest } from "next/server";
import { fail, noStore } from "@/lib/api/envelope";
import { withAuth, type AuthContext, type WithAuthOptions } from "@/lib/auth/with-auth";
import { branchGrant } from "@/lib/auth/with-branch";
import { heldRoleIn } from "@/lib/auth/branch-access";
import { isPlausibleId } from "@/lib/api/ids";
import { MAX_BODY_BYTES } from "@/lib/api/validate";

// `withAuth` plus "and the branch this request names is the caller's" - for the routes whose handler passes a `branchId` from the query string or the body straight
// to a service (coursework, announcements, timetable, communication, promotion). Found by the browser security run (2026-10-19): `withAuth({ roles })` only says
// "a role in SOME branch", and those handlers never asked about THIS one, so any signed-in teacher could read or change another branch's data by changing the id.
//
//   export const GET = withAuthGated("read-any", async (req, auth) => { ... }, { roles: [...] });
//
// The level is the caller's authority needed over that branch:
//   "administer"   a superadmin, or an ADMIN of that very branch
//   "staff-write"  ADMIN or TEACHING_STAFF held in that branch (the roles that record or change things)
//   "staff-read"   any staff role held in that branch
//   "read-any"     any membership in that branch, including a student's or a parent's (content they may read)
// The gate has to judge every branch the handler will act on, wherever the request names it: the handlers behind it read their branch from the query, from the body, or (the
// retry route) from the body first and the query second, and some parse the body whatever the Content-Type header says. So:
//   - the branch is read from `?branchId=` AND from the body's `branchId`; the body is read for every request with one (any method but GET and HEAD, any Content-Type), and a body
//     that is not JSON names no branch (the handler's own parse fails);
//   - every id the request names is checked, and a request that names two DIFFERENT branches is refused with a 400 before any handler runs;
//   - a body over MAX_BODY_BYTES (1 MiB, declared or actual) is refused with a 413 before it is parsed: the gate reads the whole body to look for a branch, so it reads no more than the cap;
//   - a body `branchId` that is present but is not text is refused with a 400; `null` and absent name nothing (a school-wide announcement is `branchId: null`, and the handler decides
//     who may make one).
// The gate sees the query and a JSON body, nothing else. A route that takes its branch from a form (multipart or urlencoded) or from anywhere else must NOT rely on it: it uses
// `withBranch`, which checks the value the handler actually parsed.
// A request naming no branch goes on to the handler, which answers its own 400. A branch that is not the caller's is "not found" when it came from the URL (it never confirms that
// something exists there) and a 403 when it was named in a body (ADR 0014: a branch in a body is not secret) - the same words withBranch uses.

export type GateLevel = "administer" | "staff-write" | "staff-read" | "read-any";

type Named = { id: string; from: "query" | "body" };
type InBody = { kind: "none" } | { kind: "id"; id: string } | { kind: "not-text" } | { kind: "too-large" };
type Naming = { named: Named | null; refusal: "DISAGREE" | "NOT_TEXT" | "TOO_LARGE" | null };

/// The request's body as text, read from a copy so the handler can still read its own, never more than the cap: `null` when it is larger.
async function boundedBodyText(req: NextRequest): Promise<string | null> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  const body = req.clone().body;
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      // Not awaited, on purpose. The clone is one half of a tee, and a cancel of one half settles only when the OTHER half is cancelled too: that half belongs to a handler
      // that will never run, so awaiting it here held a chunked, over-cap request open for ever (found by the first run of the size test).
      reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/// What the body says about the branch. Read whatever the Content-Type says (see above).
async function branchInBody(req: NextRequest): Promise<InBody> {
  if (req.method === "GET" || req.method === "HEAD") return { kind: "none" };
  const text = await boundedBodyText(req);
  if (text === null) return { kind: "too-large" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { kind: "none" }; // not JSON: it names no branch, and a handler that reads it fails on its own
  }
  const id = parsed && typeof parsed === "object" ? (parsed as { branchId?: unknown }).branchId : undefined;
  if (id === undefined || id === null || id === "") return { kind: "none" };
  return typeof id === "string" ? { kind: "id", id } : { kind: "not-text" };
}

async function namedBranch(req: NextRequest): Promise<Naming> {
  const queried = new URL(req.url).searchParams.getAll("branchId").filter(Boolean);
  const inBody = await branchInBody(req);
  if (inBody.kind === "too-large") return { named: null, refusal: "TOO_LARGE" };
  if (inBody.kind === "not-text") return { named: null, refusal: "NOT_TEXT" };
  const ids = new Set([...queried, ...(inBody.kind === "id" ? [inBody.id] : [])]);
  if (ids.size > 1) return { named: null, refusal: "DISAGREE" };
  const [id] = [...ids];
  return { named: id ? { id, from: inBody.kind === "id" ? "body" : "query" } : null, refusal: null };
}

export function withAuthGated<C = unknown>(
  level: GateLevel,
  handler: (req: NextRequest, auth: AuthContext, routeContext: C) => Promise<Response> | Response,
  options: WithAuthOptions = {},
) {
  return withAuth<C>(async (req, auth, routeContext) => {
    const { named, refusal } = await namedBranch(req);
    if (refusal === "TOO_LARGE") return noStore(fail("That request is too large.", 413, "PAYLOAD_TOO_LARGE"));
    if (refusal === "DISAGREE") return noStore(fail("branchId in the URL and in the body must name the same branch.", 400, "VALIDATION"));
    if (refusal === "NOT_TEXT") return noStore(fail("branchId must be text.", 400, "VALIDATION"));
    if (named) {
      // An id that cannot be a branch id (a NUL byte, a control character, a huge string) is a refusal like any other branch that is not the caller's, not a database
      // error: Postgres rejects a NUL in a parameter and the request would end as a 500.
      const allowed =
        isPlausibleId(named.id) &&
        (level === "read-any"
          ? (await heldRoleIn(auth.userId, named.id)) !== null
          : (
              await branchGrant(
                auth.userId,
                named.id,
                level === "staff-read" ? "staff-read" : level === "staff-write" ? "staff-write" : "administer",
              )
            ).ok);
      if (!allowed) {
        return noStore(
          named.from === "body" ? fail("You don't have access to that branch.", 403, "FORBIDDEN") : fail("Not found", 404, "NOT_FOUND"),
        );
      }
    }
    return handler(req, auth, routeContext);
  }, options);
}
