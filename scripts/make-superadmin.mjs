#!/usr/bin/env node
// Operator recovery for school-wide authority (domain-implementation-plan.md, branch administrators and superadmins, S6).
//
//   pnpm superadmin:make -- <email>
//
// Makes the person with this address a SUPERADMIN (`User.isSuperAdmin`): the way to create the first one on an install that has none, and
// the way back if every superadmin is lost. Run it on the server, as the person who administers it, after confirming who is asking — it is
// deliberately NOT reachable over HTTP. Idempotent. The person must have an ACTIVE membership (a superadmin with none cannot sign in, so the
// flag would mean nothing); the script refuses otherwise and changes nothing. Writes an audit row.
//
// Self-contained on purpose (plain Node + Prisma, no app imports): it must keep working when the app can't build.
import { PrismaClient } from "@prisma/client";

try {
  process.loadEnvFile(".env");
} catch {
  // no .env — DATABASE_URL may come from the environment
}

const args = process.argv.slice(2).filter((arg) => arg !== "--");
if (args.length !== 1 || args[0].startsWith("-")) {
  console.error("Usage: pnpm superadmin:make -- <email>");
  process.exit(2);
}
const email = args[0].trim().toLowerCase();

const prisma = new PrismaClient();
try {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, isSuperAdmin: true } });
  if (!user) {
    console.error(`No account with the email ${email}.`);
    process.exitCode = 1;
  } else if ((await prisma.membership.count({ where: { userId: user.id, deactivatedAt: null } })) === 0) {
    console.error(
      `${email} has no active membership in any branch, so they could not sign in. Reactivate or invite them first; nothing was changed.`,
    );
    process.exitCode = 1;
  } else if (user.isSuperAdmin) {
    console.log(`${email} is already a superadmin. Nothing changed.`);
  } else {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { isSuperAdmin: true } });
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          action: "SUPERADMIN_GRANTED",
          targetType: "User",
          targetId: user.id,
          beforeValue: { isSuperAdmin: false },
          afterValue: { isSuperAdmin: true },
          reason: "Operator grant (pnpm superadmin:make)",
        },
      });
    });
    console.log(`${email} is now a superadmin.`);
  }
} finally {
  await prisma.$disconnect();
}
