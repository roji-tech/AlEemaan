import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail, noStore } from "@/lib/api/envelope";
import { validateCSRF } from "@/lib/auth/csrf";
import {
  PORTAL_COOKIE_NAME,
  setPortalCookie,
  clearPortalCookie,
} from "@/lib/portal/auth";
import {
  authenticatePortalViaToken,
  authenticatePortalViaAdmission,
  resolvePortalSessionData,
} from "@/lib/portal/service";

const loginSchema = z.union([
  z.object({
    token: z.string().min(1),
  }),
  z.object({
    admissionNo: z.string().min(1),
    secret: z.string().min(1),
  }),
]);

/**
 * POST /api/v1/portal/session
 * Authenticates a guardian/student via magic link token OR admission number + secret.
 */
export async function POST(req: NextRequest) {
  if (!validateCSRF(req)) {
    return noStore(fail("Cross-origin request blocked", 403, "CSRF"));
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return noStore(fail("Invalid JSON body", 400));
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return noStore(fail("Please provide a valid token or admission number with secret", 400));
  }

  let result;
  if ("token" in parsed.data) {
    result = await authenticatePortalViaToken(parsed.data.token);
  } else {
    result = await authenticatePortalViaAdmission(parsed.data.admissionNo, parsed.data.secret);
  }

  if (!result.success || !result.sessionToken) {
    return noStore(fail(result.error || "Authentication failed", 401));
  }

  const response = ok({
    student: result.student,
    siblingStudents: result.siblingStudents,
  });

  return noStore(setPortalCookie(response, result.sessionToken));
}

/**
 * GET /api/v1/portal/session
 * Retrieves current verified portal session and list of authorized students.
 */
export async function GET(req: NextRequest) {
  const token = req.cookies.get(PORTAL_COOKIE_NAME)?.value;
  const data = await resolvePortalSessionData(token);

  if (!data) {
    return noStore(fail("Portal session expired or invalid", 401));
  }

  return noStore(
    ok({
      session: data.session,
      students: data.students,
    })
  );
}

/**
 * DELETE /api/v1/portal/session
 * Signs out of the parent/student portal by clearing the portal session cookie.
 */
export async function DELETE(req: NextRequest) {
  if (!validateCSRF(req)) {
    return noStore(fail("Cross-origin request blocked", 403, "CSRF"));
  }

  return noStore(clearPortalCookie(ok({ loggedOut: true })));
}
