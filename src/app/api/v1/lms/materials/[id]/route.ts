import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { withAuthGated } from "@/lib/auth/branch-gate";
import { ok, fail } from "@/lib/api/envelope";
import { updateMaterialSchema } from "@/lib/lms/validation";
import { getMaterialById, updateMaterial, archiveMaterial, LmsError } from "@/lib/lms/service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/v1/lms/materials/[id]?branchId=...
 */
export const GET = withAuthGated(
  "read-any",
  async (req: NextRequest, _auth, { params }: RouteParams) => {
    try {
      const { id } = await params;
      const { searchParams } = new URL(req.url);
      const branchId = searchParams.get("branchId");

      if (!branchId) {
        return fail("branchId query parameter is required", 400, "VALIDATION");
      }

      const material = await getMaterialById(branchId, id);
      return ok(material);
    } catch (error) {
      if (error instanceof LmsError) {
        return fail(error.message, error.statusCode);
      }
      return fail("Unable to retrieve learning material", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN, Role.TEACHING_STAFF, Role.STUDENT, Role.PARENT] },
);

/**
 * PATCH /api/v1/lms/materials/[id]
 */
export const PATCH = withAuthGated(
  "staff-write",
  async (req: NextRequest, _auth, { params }: RouteParams) => {
    try {
      const { id } = await params;
      const body = await req.json();
      const branchId = body.branchId;

      if (!branchId) {
        return fail("branchId is required", 400, "VALIDATION");
      }

      const parsed = updateMaterialSchema.safeParse(body);
      if (!parsed.success) {
        return fail(parsed.error.issues[0]?.message ?? "Invalid payload", 400, "VALIDATION");
      }

      const updated = await updateMaterial(branchId, id, parsed.data);
      return ok(updated);
    } catch (error) {
      if (error instanceof LmsError) {
        return fail(error.message, error.statusCode);
      }
      return fail("Unable to update material", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN, Role.TEACHING_STAFF] },
);

/**
 * DELETE /api/v1/lms/materials/[id]?branchId=...
 */
export const DELETE = withAuthGated(
  "staff-write",
  async (req: NextRequest, _auth, { params }: RouteParams) => {
    try {
      const { id } = await params;
      const { searchParams } = new URL(req.url);
      const branchId = searchParams.get("branchId");

      if (!branchId) {
        return fail("branchId is required", 400, "VALIDATION");
      }

      await archiveMaterial(branchId, id);
      return ok({ archived: true });
    } catch (error) {
      if (error instanceof LmsError) {
        return fail(error.message, error.statusCode);
      }
      return fail("Unable to archive material", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN, Role.TEACHING_STAFF] },
);
