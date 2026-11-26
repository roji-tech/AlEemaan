import { z } from "zod";
import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { armBranchId, armPatch, deleteArm, updateArm } from "@/lib/academics/structure";
import { notFound, structureCall } from "@/lib/academics/structure-http";

type Context = { params: Promise<{ id: string }> };

// PATCH /api/v1/academics/arms/[id] { name?, capacity?, archived? }   Administrators of the arm's branch; another branch's arm is the same 404 as an unknown id.
export const PATCH = withAuth<Context>(
  validate(
    { body: armPatch },
    withBranch<Parsed<z.infer<typeof armPatch>, undefined>, AuthContext, Context>(
      { of: async (_input, _req, ctx) => armBranchId((await ctx.params).id), as: "administer", refuse: () => notFound("Arm") },
      async (_req, auth, ctx, { body }) =>
        structureCall("CLASS_ARM_UPDATE", async () => {
          const updated = await updateArm(auth.userId, (await ctx.params).id, body);
          return updated ? ok({ arm: updated }) : notFound("Arm");
        }),
    ),
  ),
  { roles: [Role.ADMIN] },
);

// DELETE /api/v1/academics/arms/[id]   (task 0136) Administrators of the arm's branch; another branch's arm is the same 404 as an unknown id. Deletes an arm nothing is connected to; 409 naming
// what it is connected to (pupils, marks, a register, the timetable ...: archive it instead). Its class teacher goes with it. Audited CLASS_ARM_DELETED.
export const DELETE = withAuth<Context>(
  withBranch<undefined, AuthContext, Context>(
    { of: async (_input, _req, ctx) => armBranchId((await ctx.params).id), as: "administer", refuse: () => notFound("Arm") },
    async (_req, auth, ctx) =>
      structureCall("CLASS_ARM_DELETE", async () => {
        const deleted = await deleteArm(auth.userId, (await ctx.params).id);
        return deleted ? ok({ deleted }) : notFound("Arm");
      }),
  ),
  { roles: [Role.ADMIN] },
);
