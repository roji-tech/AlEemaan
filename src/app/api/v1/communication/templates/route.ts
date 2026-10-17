import { NextRequest } from "next/server";
import { Role, NotificationChannel } from "@prisma/client";
import { withAuth } from "@/lib/auth/with-auth";
import { ok, fail } from "@/lib/api/envelope";
import { CreateTemplateSchema } from "@/lib/communication/validation";
import { listTemplates, createTemplate } from "@/lib/communication/service";

/**
 * GET /api/v1/communication/templates?branchId=...&channel=...&search=...
 */
export const GET = withAuth(
  async (req: NextRequest) => {
    try {
      const { searchParams } = new URL(req.url);
      const branchId = searchParams.get("branchId");

      if (!branchId) {
        return fail("branchId query parameter is required", 400, "VALIDATION");
      }

      const channelParam = searchParams.get("channel");
      const channel = channelParam && Object.values(NotificationChannel).includes(channelParam as NotificationChannel)
        ? (channelParam as NotificationChannel)
        : undefined;
      const search = searchParams.get("search") || undefined;

      const templates = await listTemplates(branchId, { channel, search });
      return ok(templates);
    } catch (error) {
      console.error("[COMMUNICATION_TEMPLATES_LIST_ERROR]", error);
      return fail("Unable to retrieve notification templates", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN, Role.TEACHING_STAFF] }
);

/**
 * POST /api/v1/communication/templates
 */
export const POST = withAuth(
  async (req: NextRequest) => {
    try {
      const body = await req.json();
      const branchId = body?.branchId;

      if (!branchId) {
        return fail("branchId is required", 400, "VALIDATION");
      }

      const parsed = CreateTemplateSchema.safeParse(body);
      if (!parsed.success) {
        return fail(parsed.error.issues[0]?.message ?? "Invalid template payload", 400, "VALIDATION");
      }

      const template = await createTemplate(branchId, parsed.data);
      return ok(template, {}, 201);
    } catch (error) {
      console.error("[COMMUNICATION_TEMPLATE_CREATE_ERROR]", error);
      return fail("Unable to create notification template", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN] }
);
