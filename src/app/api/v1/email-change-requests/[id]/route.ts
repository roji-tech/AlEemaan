import { after } from "next/server";
import { Role } from "@prisma/client";
import { z } from "zod";
import { ok, fail } from "@/lib/api/envelope";
import { withAuth } from "@/lib/auth/with-auth";
import { decideRequest } from "@/lib/auth/email-change-approval";
import { auditPersonEvent } from "@/lib/auth/audit";
import { portalForUser } from "@/lib/auth/portal-gate";
import { sendEmailQuietly } from "@/lib/email/transport";
import { emailChangeConfirmEmail, emailChangeDeniedNotice, emailChangeRequestedNotice, emailChangeTakenNotice } from "@/lib/email/messages";
import { readJsonBody } from "@/lib/api/validate";
import { isPlausibleId } from "@/lib/api/ids";

// POST /api/v1/email-change-requests/{id}  { decision: "approve" | "deny", reason? }
// An administrator (for a member of their branch) or a superadmin (for anyone) decides a waiting email-address change. Approving mails the
// link to the NEW address and tells the OLD one; denying tells the OLD one. The answer never says whether the new address already belongs to
// somebody: if it does, the address gets the "taken" notice instead of a link, exactly as on the old, immediate flow. A request that does not
// exist, was already decided, or is not this person's to decide gets the same 404.
const schema = z.object({ decision: z.enum(["approve", "deny"]), reason: z.string().trim().max(500).optional() });
const NOT_FOUND = "That request was not found, or has already been decided.";

export const POST = withAuth<{ params: Promise<{ id: string }> }>(
  async (req, auth, ctx) => {
    const id = (await ctx.params).id;
    if (!isPlausibleId(id)) return fail(NOT_FOUND, 404, "NOT_FOUND");
    const read = await readJsonBody(req);
    if (!read.ok) return read.response;
    const parsed = schema.safeParse(read.json);
    if (!parsed.success) return fail("Choose approve or deny.", 400, "VALIDATION");

    const result = await decideRequest(auth.userId, id, parsed.data.decision === "approve" ? "APPROVE" : "DENY", parsed.data.reason);
    if (result.kind === "GONE") return fail(NOT_FOUND, 404, "NOT_FOUND");

    after(async () => {
      try {
        const portal = await portalForUser(result.userId);
        await auditPersonEvent(result.userId, result.kind === "APPROVED" ? "EMAIL_CHANGE_APPROVED" : "EMAIL_CHANGE_DENIED", {
          after: { newEmail: result.newEmail, decidedBy: auth.userId },
          ...(parsed.data.reason ? { reason: parsed.data.reason } : {}),
        });
        if (result.kind === "DENIED") {
          if (result.oldEmail) await sendEmailQuietly(emailChangeDeniedNotice(result.oldEmail));
          return;
        }
        if (result.oldEmail) await sendEmailQuietly(emailChangeRequestedNotice(result.oldEmail, result.newEmail, portal));
        await sendEmailQuietly(
          result.token ? emailChangeConfirmEmail(result.newEmail, result.token, portal) : emailChangeTakenNotice(result.newEmail, portal),
        );
      } catch (error) {
        console.error("[email-change-requests] follow-up failed:", error instanceof Error ? error.message : error);
      }
    });
    return ok({ decided: parsed.data.decision });
  },
  { roles: [Role.ADMIN] },
);
