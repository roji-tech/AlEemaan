import { PrismaClient } from "@prisma/client";

// Standard Next.js dev-mode singleton — avoids exhausting Postgres
// connections from hot-reload creating a new PrismaClient per reload.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
    // Prisma's 5 s default for an interactive transaction is too short when the database is a network hop away (each query ~200 ms): first-run setup runs
    // about eight queries in one, and failed with P2028 against a hosted database. Generous limits cost nothing when the database is near.
    transactionOptions: { maxWait: 15000, timeout: 60000 },
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
