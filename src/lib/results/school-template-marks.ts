import type { Prisma } from "@prisma/client";

/// Marks the branch's rows that follow a school template as "Customised here" (task 0120): somebody in the branch changed what the row follows (its look, name, marks scheme or grade scale), so a
/// later "Update branches" skips it unless the superadmin chooses to replace the local changes. A row that follows none is untouched. In the caller's transaction.
export async function markCustomised(tx: Prisma.TransactionClient, where: Prisma.ResultTemplateWhereInput) {
  await tx.resultTemplate.updateMany({ where: { ...where, schoolTemplateId: { not: null } }, data: { localEditedAt: new Date() } });
}
