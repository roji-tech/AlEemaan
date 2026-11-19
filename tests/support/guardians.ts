import { db } from "./db";

// Guardians are records of their own since task 0113 (D1): the family sign-in finds a guardian through the pupil's links, never through the pupil's own guardian columns. Most specs seed
// pupils directly with those columns (as the app did before), so this turns every pupil that has guardian columns and no link into links, the way the portal used to group a family:
// pupils with the same phone (the national digits) or the same e-mail share one guardian. Call it after seeding and before signing in; it is idempotent (linked pupils are skipped).

/// The national digits, as `phoneKey` in src/lib/programs/people-rules.ts (copied: importing app modules here would open a second database client on the app's address).
function phoneKey(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 7) return null;
  return digits.startsWith("234") && digits.length >= 12 ? digits.slice(3) : digits.replace(/^0+/, "");
}

export async function linkGuardiansFromColumns(): Promise<number> {
  const pupils = await db.studentRecord.findMany({
    where: {
      guardians: { none: {} },
      OR: [{ guardianName: { not: null } }, { guardianPhone: { not: null } }, { guardianEmail: { not: null } }],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, branchId: true, firstName: true, lastName: true, guardianName: true, guardianPhone: true, guardianEmail: true },
  });
  let linked = 0;
  for (const p of pupils) {
    const phone = p.guardianPhone?.replace(/[\s\-().]/g, "") || null;
    const key = phoneKey(phone);
    const email = p.guardianEmail?.trim().toLowerCase() || null;
    if (!p.guardianName?.trim() && !phone && !email) continue;
    const existing =
      (key ? await db.guardian.findFirst({ where: { phoneKey: key }, orderBy: { createdAt: "asc" }, select: { id: true } }) : null) ??
      (email ? await db.guardian.findFirst({ where: { email }, orderBy: { createdAt: "asc" }, select: { id: true } }) : null);
    const guardianId =
      existing?.id ??
      (
        await db.guardian.create({
          data: { name: p.guardianName?.trim() || `Guardian of ${p.firstName} ${p.lastName}`, phone, phoneKey: key, email },
          select: { id: true },
        })
      ).id;
    await db.studentGuardian.create({ data: { studentId: p.id, branchId: p.branchId, guardianId, isMain: true } });
    linked++;
  }
  return linked;
}
