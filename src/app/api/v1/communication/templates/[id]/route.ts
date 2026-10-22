import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { withAuthGated } from "@/lib/auth/branch-gate";
import { ok, fail } from "@/lib/api/envelope";
import { UpdateTemplateSchema } from "@/lib/communication/validation";
import { getTemplate, updateTemplate, deleteTemplate } from "@/lib/communication/service";
import { readJsonObject } from "@/lib/api/validate";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/v1/communication/templates/[id]?branchId=...
 */
export const GET = withAuthGated(
  "staff-read",
  async (req: NextRequest, _auth, { params }: RouteParams) => {
    try {
      const { id } = await params;
      const { searchParams } = new URL(req.url);
      const branchId = searchParams.get("branchId");

      if (!branchId) {
        return fail("branchId query parameter is required", 400, "VALIDATION");
      }

      const template = await getTemplate(branchId, id);
      if (!template) {
        return fail("Template not found", 404, "NOT_FOUND");
      }

      return ok(template);
    } catch (error) {
      console.error("[COMMUNICATION_TEMPLATE_GET_ERROR]", error);
      return fail("Unable to retrieve notification template", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN, Role.TEACHING_STAFF] },
);

/**
 * PATCH /api/v1/communication/templates/[id]
 */
export const PATCH = withAuthGated(
  "administer",
  async (req: NextRequest, _auth, { params }: RouteParams) => {
    try {
      const { id } = await params;
      const read = await readJsonObject(req);
      if (!read.ok) return read.response;
      const body = read.json as { branchId?: string } & Record<string, unknown>;
      const branchId = body?.branchId;

      if (!branchId) {
        return fail("branchId is required", 400, "VALIDATION");
      }

      const parsed = UpdateTemplateSchema.safeParse(body);
      if (!parsed.success) {
        return fail(parsed.error.issues[0]?.message ?? "Invalid update payload", 400, "VALIDATION");
      }

      const updated = await updateTemplate(branchId, id, parsed.data);
      return ok(updated);
    } catch (error) {
      console.error("[COMMUNICATION_TEMPLATE_UPDATE_ERROR]", error);
      return fail("Unable to update notification template", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN] },
);

/**
 * DELETE /api/v1/communication/templates/[id]?branchId=...
 */
export const DELETE = withAuthGated(
  "administer",
  async (req: NextRequest, _auth, { params }: RouteParams) => {
    try {
      const { id } = await params;
      const { searchParams } = new URL(req.url);
      const branchId = searchParams.get("branchId");

      if (!branchId) {
        return fail("branchId query parameter is required", 400, "VALIDATION");
      }

      const success = await deleteTemplate(branchId, id);
      if (!success) {
        return fail("Template not found", 404, "NOT_FOUND");
      }

      return ok({ success: true, message: "Template deleted" });
    } catch (error) {
      console.error("[COMMUNICATION_TEMPLATE_DELETE_ERROR]", error);
      return fail("Unable to delete notification template", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN] },
);
