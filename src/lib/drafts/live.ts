import type { Prisma } from "@prisma/client";

// The ONE definition of "a record that counts" for staff and for pupils (task 0101 D1, batch 3a): not archived and not a draft. Everything that counts people or acts on them (a roll, a
// result sheet, an invoice run, a broadcast, a sign-in, a program place, an invitation) spreads one of these into its `where`, so a draft is left out the same way everywhere and a new
// place cannot forget it by writing its own flag. Lists and exports of the records themselves do NOT use these: a draft is listed, with its badge, so nobody loses one.

export const LIVE_PUPIL = { archivedAt: null, isDraft: false } as const satisfies Prisma.StudentRecordWhereInput;
export const LIVE_STAFF = { archivedAt: null, isDraft: false } as const satisfies Prisma.StaffRecordWhereInput;
/// For places that already decide about archiving themselves and only need to leave drafts out.
export const NOT_DRAFT = { isDraft: false } as const;
