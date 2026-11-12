import { NextRequest } from "next/server";
import { ok, noStore } from "@/lib/api/envelope";
import { portalGate } from "@/lib/portal/guard";
import { familyProgress } from "@/lib/programs/progress-family";

/**
 * GET /api/v1/portal/students/[studentId]/progress
 * What the pupil, or a guardian of the pupil, may see of their progress records (task 0044, slice R3): only the VERIFIED copy of each entry, and for a guardian a summary unless the
 * program allows the full entries. The portal's own gate runs first; then the school's, the branch's and the program's progress switches, read on every request. An empty list when
 * nothing may be shown.
 */
export async function GET(req: NextRequest, context?: { params?: Promise<{ studentId: string }> }) {
  const params = await context?.params;
  const gate = await portalGate(req, params?.studentId, "overview");
  if (!gate.ok) return gate.response;
  return noStore(ok(await familyProgress(params!.studentId, gate.session.actor)));
}
