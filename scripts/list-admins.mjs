#!/usr/bin/env node
// Read-only list for the maintainer (ADR 0014): every person who holds an ACTIVE `ADMIN` membership, with the branches they administer, whether they
// are already a superadmin, and whether two-step verification is on.
//
//   pnpm admins:list
//
// Why: the branch-admins migration (`20261011120000_super_admin_flag`) makes EVERY person with an active ADMIN membership a superadmin, so that nothing
// changes for the live school on the day it is deployed. Read this list first, decide who should stay a superadmin (school-wide: other branches,
// settings, other administrators) and who should be only the administrator of their own branch, deploy, and then remove the flag from the others on the
// Users page ("Remove superadmin", by a superadmin who re-types their password). Run it against the live database BEFORE the deploy and again
// after the migration. It changes nothing.
//
// Self-contained (plain Node + Prisma, no app imports): it must keep working when the app can't build.
import { PrismaClient } from "@prisma/client";

try {
  process.loadEnvFile(".env");
} catch {
  // no .env - DATABASE_URL may come from the environment
}

if (process.argv.slice(2).filter((arg) => arg !== "--").length > 0) {
  console.error("Usage: pnpm admins:list   (no arguments; it only reads)");
  process.exit(2);
}

const prisma = new PrismaClient();
try {
  const admins = await prisma.user.findMany({
    where: { memberships: { some: { role: "ADMIN", deactivatedAt: null } } },
    select: {
      email: true,
      name: true,
      isSuperAdmin: true,
      mfaCredential: { select: { confirmedAt: true } },
      memberships: { where: { role: "ADMIN", deactivatedAt: null }, select: { branch: { select: { name: true } } } },
    },
    orderBy: { email: "asc" },
  });
  if (admins.length === 0) {
    console.log("There are no active administrators.");
  } else {
    for (const a of admins) {
      const branches = a.memberships.map((m) => m.branch.name).sort();
      console.log(
        `${a.email ?? "(no email)"} | ${a.name ?? "(no name)"} | superadmin: ${a.isSuperAdmin ? "yes" : "no"} | two-step: ${a.mfaCredential?.confirmedAt ? "on" : "off"} | administers: ${branches.join(", ")}`,
      );
    }
    const already = admins.filter((a) => a.isSuperAdmin).length;
    console.log(
      `\n${admins.length} active administrators (${already} already superadmin). The branch-admins migration makes all of them superadmins; ` +
        "decide who should be only a branch administrator and remove the flag from them on the Users page after the deploy.",
    );
  }
} finally {
  await prisma.$disconnect();
}
