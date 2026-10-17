import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { ok, fail } from "@/lib/api/envelope";
import { createMaterialSchema } from "@/lib/lms/validation";
import { listMaterials, createMaterial } from "@/lib/lms/service";

/**
 * GET /api/v1/lms/materials?branchId=...&subjectId=...&classGroupId=...
 */
export const GET = withAuth(
  async (req: NextRequest) => {
    try {
      const { searchParams } = new URL(req.url);
      const branchId = searchParams.get("branchId");

      if (!branchId) {
        return fail("branchId query parameter is required", 400, "VALIDATION");
      }

      const subjectId = searchParams.get("subjectId") ?? undefined;
      const classGroupId = searchParams.get("classGroupId") ?? undefined;

      const materials = await listMaterials(branchId, { subjectId, classGroupId });
      return ok(materials);
    } catch (error) {
      console.error("[LMS_MATERIALS_LIST_ERROR]", error);
      return fail("Unable to retrieve learning materials", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN, Role.TEACHING_STAFF, Role.STUDENT, Role.PARENT] }
);

/**
 * POST /api/v1/lms/materials
 */
export const POST = withAuth(
  async (req: NextRequest, auth: AuthContext) => {
    try {
      const body = await req.json();
      const parsed = createMaterialSchema.safeParse(body);

      if (!parsed.success) {
        return fail(parsed.error.issues[0]?.message ?? "Invalid material payload", 400, "VALIDATION");
      }

      const material = await createMaterial({
        ...parsed.data,
        createdById: auth.userId,
      });

      return ok(material, {}, 201);
    } catch (error) {
      console.error("[LMS_MATERIALS_CREATE_ERROR]", error);
      return fail("Unable to create learning material", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN, Role.TEACHING_STAFF] }
);
