import { PrismaClient } from "@prisma/client";
import { runtimeDatabaseUrl } from "@/lib/db-url";

// Standard Next.js dev-mode singleton — avoids exhausting Postgres
// connections from hot-reload creating a new PrismaClient per reload.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// The pooled address when DATABASE_URL_POOLED is set (task 0077), else Prisma reads DATABASE_URL from the schema as before. Migrations and the CLI never come through here.
const pooledUrl = runtimeDatabaseUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(pooledUrl ? { datasourceUrl: pooledUrl } : {}),
    // Prisma's 5 s default for an interactive transaction is too short when the database is a network hop away (each query ~200 ms): first-run setup runs
    // about eight queries in one, and failed with P2028 against a hosted database. Generous limits cost nothing when the database is near.
    transactionOptions: { maxWait: 15000, timeout: 60000 },
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
