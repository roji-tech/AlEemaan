import type { NextRequest, NextResponse } from "next/server";
import { z, type ZodType } from "zod";
import { fail, type ErrorDetail } from "@/lib/api/envelope";
import { holdsNul, NUL_MESSAGE } from "@/lib/api/no-nul";
import { readBoundedText } from "@/lib/api/read-body";

// Input validation for route handlers (domain-implementation-plan.md §0.5.G — ported from Octalve Edu §0.5.3, A). A route declares the zod schema for
// its body and/or query string; this wrapper does the rest, the same way every time:
//   - body that is not JSON                      → 400 INVALID_BODY
//   - a NUL character in a key or a value of the body → 400 VALIDATION (lib/api/no-nul.ts), before the schema. (withAuth checks the query string, and the body of a route that
//     does not use validate(), before the handler runs.)
//   - body bigger than MAX_BODY_BYTES (declared or actual) → 413 PAYLOAD_TOO_LARGE; a body with no declared length is read
//     no further than the cap (lib/api/read-body.ts), so the answer does not wait for the end of it
//   - a schema failure                           → 400 VALIDATION, with `details` naming each field (max 20)
//   - keys the schema does not name              → STRIPPED, never passed on (no mass assignment)
// The same schema objects are what the generated API docs (zod-openapi) will describe, so validation and
// documentation cannot drift apart.

export const MAX_BODY_BYTES = 1024 * 1024; // 1 MiB — nothing in this app takes a bigger JSON body
const MAX_DETAILS = 20;

/// The JSON body of a request, for a route that reads its own instead of declaring a schema (sign-in, passwords, two-step verification, invitations, setup, profile, and the
/// routes that look for a `branchId` first): read no further than `cap`, parsed, and refused the way validate() refuses - 413 PAYLOAD_TOO_LARGE, 400 INVALID_BODY (empty or not
/// JSON), 400 VALIDATION for a NUL character in a key or a value. The route then checks the shape itself. This is the ONE place a body is read and parsed: parseRequest()
/// below calls it too, and `tests/unit/route-body-guard.spec.ts` fails on a route that reads its request body any other way.
export async function readJsonBody(
  req: Request,
  cap: number = MAX_BODY_BYTES,
): Promise<{ ok: true; json: unknown } | { ok: false; response: NextResponse }> {
  const text = await readBoundedText(req, cap);
  if (text === null) return { ok: false, response: fail("That request is too large.", 413, "PAYLOAD_TOO_LARGE") };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, response: fail("Invalid JSON body", 400, "INVALID_BODY") };
  }
  if (holdsNul(json)) {
    return {
      ok: false,
      response: fail("Some of the fields are not valid.", 400, "VALIDATION", [{ path: "body", message: NUL_MESSAGE }]),
    };
  }
  return { ok: true, json };
}

/// readJsonBody() for a route whose body is a JSON object: an array, a string, a number or `null` is refused as 400 INVALID_BODY, so the route can read its fields (a `branchId`)
/// without a null check. The fields are `unknown` until the route has checked them.
export async function readJsonObject(
  req: Request,
  cap: number = MAX_BODY_BYTES,
): Promise<{ ok: true; json: Record<string, unknown> } | { ok: false; response: NextResponse }> {
  const read = await readJsonBody(req, cap);
  if (!read.ok) return read;
  if (typeof read.json !== "object" || read.json === null || Array.isArray(read.json)) {
    return { ok: false, response: fail("The body must be a JSON object.", 400, "INVALID_BODY") };
  }
  return { ok: true, json: read.json as Record<string, unknown> };
}

export type Schemas<B, Q> = { body?: ZodType<B>; query?: ZodType<Q> };
export type Parsed<B, Q> = { body: B; query: Q };

function issuesOf(error: z.ZodError, prefix: string): ErrorDetail[] {
  return error.issues.slice(0, MAX_DETAILS).map((issue) => ({
    path: [prefix, ...issue.path.map(String)].filter(Boolean).join("."),
    message: issue.message,
  }));
}

/// Parses the request per `schemas`; returns the parsed input or a ready-made refusal Response.
export async function parseRequest<B = undefined, Q = undefined>(
  req: NextRequest,
  schemas: Schemas<B, Q>,
): Promise<{ ok: true; input: Parsed<B, Q> } | { ok: false; response: Response }> {
  let query = undefined as Q;
  if (schemas.query) {
    const params = req.nextUrl.searchParams;
    const raw: Record<string, string | string[]> = {};
    for (const key of new Set(params.keys())) {
      const values = params.getAll(key);
      raw[key] = values.length === 1 ? values[0] : values;
    }
    const result = schemas.query.safeParse(raw);
    if (!result.success)
      return {
        ok: false,
        response: fail("Some of the query parameters are not valid.", 400, "VALIDATION", issuesOf(result.error, "query")),
      };
    query = result.data;
  }

  let body = undefined as B;
  if (schemas.body) {
    const read = await readJsonBody(req);
    if (!read.ok) return read;
    const result = schemas.body.safeParse(read.json);
    if (!result.success)
      return { ok: false, response: fail("Some of the fields are not valid.", 400, "VALIDATION", issuesOf(result.error, "body")) };
    body = result.data;
  }
  return { ok: true, input: { body, query } };
}

/// Wraps a handler so it only runs on valid input, receiving the parsed `{ body, query }` as its fourth argument.
/// Compose INSIDE `withAuth` (authentication and authorization first, then validation):
///   withAuth(validate({ body: schema }, async (req, auth, ctx, { body }) => …), { tenant: true, roles: [...] })
export function validate<B = undefined, Q = undefined, A = unknown, C = unknown>(
  schemas: Schemas<B, Q>,
  handler: (req: NextRequest, auth: A, routeContext: C, input: Parsed<B, Q>) => Promise<Response> | Response,
) {
  // Object schemas strip unknown keys by default in zod; `.strict()` schemas refuse them instead — both are fine,
  // what is never done is passing the raw body through.
  return async (req: NextRequest, auth: A, routeContext: C): Promise<Response> => {
    const parsed = await parseRequest(req, schemas);
    if (!parsed.ok) return parsed.response;
    return handler(req, auth, routeContext, parsed.input);
  };
}
