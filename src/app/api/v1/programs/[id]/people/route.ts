import { withAuth } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { ok } from "@/lib/api/envelope";
import { PROGRAM_ROUTE_ROLES, respond } from "@/lib/programs/http";
import { addPerson, listPeople } from "@/lib/programs/people-service";
import { addPersonSchema, listPeopleQuery } from "@/lib/programs/people-validation";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/programs/[id]/people?q=&groupId=&branchId=&kind=&state=&page=
 * The people of a program the caller may see: everyone for a super admin and a program admin, and for a branch administrator only the people through their own branch. A program the
 * caller has no place in answers 404. 50 to a page, newest joiners first; `state` is read from the school's own records.
 */
export const GET = withAuth(
  validate({ query: listPeopleQuery }, async (_req, auth, { params }: Ctx, { query }) => {
    const result = await listPeople(auth.userId, (await params).id, query);
    return result.ok
      ? ok(
          { people: result.data.people },
          { page: result.data.page, limit: result.data.pageSize, total: result.data.total, hasNext: result.data.hasNext },
        )
      : respond(result);
  }),
  { roles: PROGRAM_ROUTE_ROLES },
);

/**
 * POST /api/v1/programs/[id]/people
 * Adds one person: { kind: "STUDENT", studentId, groupId } or { kind: "STAFF", staffRecordId, groupId } (the school's record is linked), or a person typed in
 * { kind: "GUARDIAN" | "ADULT" | "CHILD", firstName, lastName, branchId, groupId, ... } (a child needs a birth date and a guardian's name and phone). A super admin or program admin: anyone;
 * a branch administrator: people through their own branch. 409 POSSIBLE_DUPLICATE for a namesake unless `confirmNamesake` is true.
 */
export const POST = withAuth(
  validate({ body: addPersonSchema }, async (_req, auth, { params }: Ctx, { body }) =>
    respond(await addPerson(auth.userId, (await params).id, body), 201),
  ),
  { roles: PROGRAM_ROUTE_ROLES },
);
