import { NextRequest } from "next/server";
import { ok, fail, noStore } from "@/lib/api/envelope";
import { portalGate } from "@/lib/portal/guard";
import { getStudentPortalInvoices } from "@/lib/portal/service";

/**
 * GET /api/v1/portal/students/[studentId]/invoices
 * Retrieves student invoices and payment history.
 */
export async function GET(req: NextRequest, context?: { params?: Promise<{ studentId: string }> }) {
  const params = await context?.params;
  const gate = await portalGate(req, params?.studentId, "invoices");
  if (!gate.ok) return gate.response;
  const { session } = gate;
  const studentId = params!.studentId;

  try {
    const invoices = await getStudentPortalInvoices(studentId, session.allowedStudentIds);
    return noStore(ok(invoices));
  } catch (err: unknown) {
    console.error("Portal invoices error:", err);
    return noStore(fail("Failed to load student invoices", 500));
  }
}
