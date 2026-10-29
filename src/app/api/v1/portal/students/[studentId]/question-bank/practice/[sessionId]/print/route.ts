import { NextRequest } from "next/server";
import { ok, fail, noStore } from "@/lib/api/envelope";
import { portalGate, PORTAL_REFUSED } from "@/lib/portal/guard";
import {
  printPupilPracticeSession,
  PrintingServiceError,
} from "@/lib/question-bank/printing-service";
import { auditClientInfo } from "@/lib/auth/rate-limit";

/**
 * GET /api/v1/portal/students/[studentId]/question-bank/practice/[sessionId]/print
 * Downloads pupil's completed practice session review with watermark.
 * (Design §7.7: Pupils may print their own finished practice session; never in-progress).
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ studentId: string; sessionId: string }> },
) {
  const { studentId, sessionId } = await context.params;
  const gate = await portalGate(req, studentId, "takeQuizzes");
  if (!gate.ok) return gate.response;

  if (gate.session.actor !== "PUPIL") {
    return noStore(fail(PORTAL_REFUSED, 403, "PORTAL_ACCESS"));
  }

  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") || "pdf";

  try {
    const { ipAddress, userAgent } = auditClientInfo(req);

    const result = await printPupilPracticeSession({
      branchId: gate.branchId,
      studentId,
      sessionId,
      ipAddress,
      userAgent,
    });

    if (format === "json") {
      return noStore(
        ok({
          logId: result.logId,
          watermark: result.watermark,
          pageCount: result.pageCount,
          title: result.title,
          pdfBase64: result.pdfBuffer.toString("base64"),
        }),
      );
    }

    return new Response(new Uint8Array(result.pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(result.title)}.pdf"`,
        "X-Watermark": encodeURIComponent(result.watermark),
        "X-Log-Id": result.logId,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (err) {
    if (err instanceof PrintingServiceError) {
      return noStore(fail(err.message, err.statusCode, err.code));
    }
    console.error("Portal print practice session error:", err);
    return noStore(fail("Failed to print practice session", 500));
  }
}
