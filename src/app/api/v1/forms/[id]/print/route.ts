import { withAuthGated } from "@/lib/auth/branch-gate";
import { ok, fail } from "@/lib/api/envelope";
import { readJsonBody } from "@/lib/api/validate";
import { FORM_STAFF_ROLES } from "@/lib/question-bank/items-http";
import {
  printTarget,
  PrintingServiceError,
} from "@/lib/question-bank/printing-service";
import { PrintTargetKind } from "@prisma/client";
import { z } from "zod";

const formPrintSchema = z.object({
  branchId: z.string().min(1, "branchId is required"),
  includeAnswerKey: z.boolean().optional(),
  reason: z.string().max(500).optional(),
  recipientStudentId: z.string().optional(),
  format: z.enum(["pdf", "json"]).default("pdf"),
});

/**
 * POST /api/v1/forms/[id]/print
 * Prints a form (practice set, questionnaire, or paper work) with watermark and audit logging.
 */
export const POST = withAuthGated(
  "staff-write",
  async (req, auth, context) => {
    const { id: formId } = await (context as { params: Promise<{ id: string }> }).params;
    const read = await readJsonBody(req);
    if (!read.ok) return read.response;

    const parsed = formPrintSchema.safeParse(read.json);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid form print payload", 400, "VALIDATION");
    }

    try {
      const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || undefined;
      const userAgent = req.headers.get("user-agent") || undefined;

      const result = await printTarget({
        branchId: parsed.data.branchId,
        userId: auth.userId,
        targetKind: PrintTargetKind.FORM,
        targetId: formId,
        includeAnswerKey: parsed.data.includeAnswerKey,
        reason: parsed.data.reason,
        recipientStudentId: parsed.data.recipientStudentId,
        ipAddress,
        userAgent,
      });

      if (parsed.data.format === "json") {
        return ok({
          logId: result.logId,
          watermark: result.watermark,
          pageCount: result.pageCount,
          title: result.title,
          pdfBase64: result.pdfBuffer.toString("base64"),
        });
      }

      return new Response(new Uint8Array(result.pdfBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(result.title)}.pdf"`,
          "X-Watermark": encodeURIComponent(result.watermark),
          "X-Log-Id": result.logId,
        },
      });
    } catch (err) {
      if (err instanceof PrintingServiceError) {
        return fail(err.message, err.statusCode, err.code);
      }
      console.error("Form print error:", err);
      return fail("Failed to print form", 500);
    }
  },
  { roles: FORM_STAFF_ROLES },
);
