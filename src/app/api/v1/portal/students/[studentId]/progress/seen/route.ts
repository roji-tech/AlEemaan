import { NextRequest } from "next/server";
import { ok, fail, noStore } from "@/lib/api/envelope";
import { readJsonObject } from "@/lib/api/validate";
import { portalGate } from "@/lib/portal/guard";
import { markSeen } from "@/lib/programs/progress-family";
import { seenSchema } from "@/lib/programs/progress-validation";

/**
 * POST /api/v1/portal/students/[studentId]/progress/seen { programId, weekStart }
 * The pupil or a guardian marks a week as seen (in place of a signature). A record of that, required for nothing; the same gate and switches as reading.
 */
export async function POST(req: NextRequest, context?: { params?: Promise<{ studentId: string }> }) {
  const params = await context?.params;
  const gate = await portalGate(req, params?.studentId, "overview");
  if (!gate.ok) return gate.response;
  const body = await readJsonObject(req);
  if (!body.ok) return noStore(body.response);
  const parsed = seenSchema.safeParse(body.json);
  if (!parsed.success) return noStore(fail("Some of the fields are not valid.", 400, "VALIDATION"));
  const result = await markSeen(params!.studentId, gate.session.actor, parsed.data);
  return noStore(result.ok ? ok(result.data) : fail(result.message, result.status, result.code));
}
