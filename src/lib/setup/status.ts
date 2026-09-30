import { prisma } from "@/lib/db";

/// Whether this instance's first-run setup has been completed.
///
/// Returns `null` (unknown) on a database error instead of throwing, and
/// callers treat unknown as "don't redirect": a transient DB blip must never
/// lock a deployer out of their own bootstrap step (same fail-open call the
/// setup route and page already make).
export async function isSetupComplete(): Promise<boolean | null> {
  try {
    const settings = await prisma.systemSettings.findUnique({ where: { id: "global" } });
    return Boolean(settings?.setupComplete);
  } catch (err) {
    console.error("[SETUP_STATUS_ERROR]", err);
    return null;
  }
}
