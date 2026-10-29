import type { NextRequest, NextResponse } from "next/server";
import { fail, noStore } from "@/lib/api/envelope";
import { prisma } from "@/lib/db";
import { getPortalSession, type PortalSessionPayload } from "./auth";
import { accessFor, type Access, type Capability } from "./access";
import { getPortalAccessByBranch } from "./access-service";

// The one check every portal student route makes after reading its path (task 0040). It answers, in this order: is there a portal session (401), is this pupil one the sign-in
// reaches (403), may the actor reach a pupil who is not the one they signed in as (the branch's `siblings` setting for that actor, read NOW, not when the cookie was
// signed), and does the branch of the pupil asked about let this actor do this (403, one message for every capability). The settings are read on every request, so turning
// a capability off takes effect at once and does not wait for the cookie to expire.

export const PORTAL_REFUSED = "Your sign-in does not include this.";
const NOT_YOURS = "You are not authorized to view this student";

export type PortalGate =
  | { ok: true; session: PortalSessionPayload; access: Access; branchId: string }
  | { ok: false; response: NextResponse };

const refuse = (response: NextResponse): PortalGate => ({ ok: false, response: noStore(response) });

export async function portalGate(req: NextRequest, studentId: string | undefined, capability: Capability): Promise<PortalGate> {
  const session = getPortalSession(req);
  if (!session) return refuse(fail("Portal session expired or unauthorized", 401));
  if (!studentId) return refuse(fail("Student ID is required", 400));
  if (!session.allowedStudentIds.includes(studentId)) return refuse(fail(NOT_YOURS, 403));

  const students = await prisma.studentRecord.findMany({
    where: { id: { in: [...new Set([studentId, session.primaryStudentId])] } },
    select: { id: true, branchId: true },
  });
  const asked = students.find((student) => student.id === studentId);
  if (!asked) return refuse(fail(NOT_YOURS, 403));
  const primary = students.find((student) => student.id === session.primaryStudentId) ?? asked;

  const byBranch = await getPortalAccessByBranch([asked.branchId, primary.branchId]);
  if (studentId !== session.primaryStudentId && !accessFor(byBranch.get(primary.branchId)!, session.actor).siblings) {
    return refuse(fail(PORTAL_REFUSED, 403, "PORTAL_ACCESS"));
  }
  const access = accessFor(byBranch.get(asked.branchId)!, session.actor);
  if (!access[capability]) return refuse(fail(PORTAL_REFUSED, 403, "PORTAL_ACCESS"));
  return { ok: true, session, access, branchId: asked.branchId };
}
