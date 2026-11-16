// Which connection string the RUNNING app uses (task 0077). Two variables, both optional to set but only one required:
//   DATABASE_URL         the direct address. Prisma's command line (migrate, studio) and the operator scripts use it, and so does the app when the next variable is not set.
//   DATABASE_URL_POOLED  the pooler's address (on Neon, the `-pooler` host, with `pgbouncer=true`). When set, the running app uses it, so serverless instances share the database's connections.
// A pooler in transaction mode cannot hold the session lock `migrate` takes, which is why migrations never see the pooled address: only src/lib/db.ts reads this module.
//
// It fails closed on a mistake. Messages name variables and never repeat a value (an address holds a password).

type Env = Record<string, string | undefined>;

function databaseOf(address: string): string | null {
  try {
    return decodeURIComponent(new URL(address).pathname.replace(/^\//, ""));
  } catch {
    return null;
  }
}

/// The address the app should connect to, or `undefined` to let Prisma read DATABASE_URL (the schema's own setting). A blank value means "not set".
export function runtimeDatabaseUrl(env: Env = process.env): string | undefined {
  const pooled = env.DATABASE_URL_POOLED?.trim();
  if (!pooled) return undefined;
  if (!/^postgres(ql)?:\/\//i.test(pooled) || databaseOf(pooled) === null) {
    throw new Error("DATABASE_URL_POOLED must be a postgresql:// address.");
  }
  const direct = env.DATABASE_URL?.trim();
  // A pooled address left over from another environment would send the app to a different database from the one that was migrated, and show only as strange data.
  if (direct && databaseOf(direct) !== null && databaseOf(direct) !== databaseOf(pooled)) {
    throw new Error("DATABASE_URL_POOLED and DATABASE_URL must name the same database.");
  }
  return pooled;
}
