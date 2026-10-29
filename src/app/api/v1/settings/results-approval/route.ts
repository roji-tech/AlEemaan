import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth } from "@/lib/auth/with-auth";
import { notFound, structureCall } from "@/lib/academics/structure-http";
import { listApprovers, listSections } from "@/lib/academics/approver-settings";
import { branchQuery, proofRefusal, settingsWriteLimited, unsectionedBody } from "@/lib/academics/approver-settings-http";
import { UNSECTIONED_KEY, getUnsectionedClassApproval, setUnsectionedClassApproval } from "@/lib/academics/unsectioned-approval";

// Where results are approved (task 0039, slice 2b). Superadmin only: it decides who may approve a branch's results, so a branch administrator does not set it (decision 2 of
// the task). Every change asks for a fresh proof (`stepUp`) and is audited in the same transaction.

type GetQuery = Parsed<undefined, z.infer<typeof branchQuery>>;
type PutBody = Parsed<z.infer<typeof unsectionedBody>, undefined>;

// GET /api/v1/settings/results-approval?branchId=   The branch's sections (with their class groups), the classes in none, the approvers with their scopes, and the
// setting for classes in no section.
export const GET = withAuth(
  validate({ query: branchQuery }, async (_req, _admin, _ctx, { query }: GetQuery) =>
    structureCall("SETTINGS_RESULTS_APPROVAL_GET", async () => {
      if (!(await prisma.branch.findUnique({ where: { id: query.branchId }, select: { id: true } }))) return notFound("Branch");
      const [sections, approvers, unsectionedClassApproval] = await Promise.all([
        listSections(query.branchId),
        listApprovers(query.branchId),
        getUnsectionedClassApproval(query.branchId),
      ]);
      return ok({ branchId: query.branchId, ...sections, ...approvers, unsectionedClassApproval, settingKey: UNSECTIONED_KEY });
    }),
  ),
  { superAdmin: true },
);

// PUT /api/v1/settings/results-approval   { branchId, value: "GENERAL_OR_CLASS_ONLY" | "ANY_SECTION_APPROVER", stepUp }   Whether a Section approver also approves the classes in
// no section. Turning on the wider value is audited as CHANGED_WIDENING.
export const PUT = withAuth(
  validate({ body: unsectionedBody }, async (_req, admin: { userId: string }, _ctx, { body }: PutBody) =>
    structureCall("SETTINGS_RESULTS_APPROVAL_PUT", async () => {
      const limited = await settingsWriteLimited(admin.userId);
      if (limited) return limited;
      if (!(await prisma.branch.findUnique({ where: { id: body.branchId }, select: { id: true } }))) return notFound("Branch");
      const refused = await proofRefusal(admin.userId, body.stepUp);
      if (refused) return refused;
      const change = await setUnsectionedClassApproval(body.branchId, body.value, admin.userId);
      return ok({ branchId: body.branchId, unsectionedClassApproval: change.after, changed: change.changed, widening: change.widening });
    }),
  ),
  { superAdmin: true },
);
