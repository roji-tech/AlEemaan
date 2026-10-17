import crypto from "node:crypto";
import { NotificationChannel } from "@prisma/client";
import { prisma } from "@/lib/db";

export interface GenerateGuardianLinkParams {
  branchId: string;
  studentId: string;
  action: string;
  channel: NotificationChannel;
  expiresInMinutes?: number; // default 7 days = 10080 mins
}

export interface GeneratedGuardianLink {
  token: string;
  tokenHash: string;
  expiresAt: Date;
  url: string;
}

/**
 * Generates a cryptographically secure, signed magic link token for a guardian.
 * The plaintext token is never stored directly in the database (only its SHA-256 hash).
 */
export async function generateGuardianMagicLink(params: GenerateGuardianLinkParams): Promise<GeneratedGuardianLink> {
  const { branchId, studentId, action, channel, expiresInMinutes = 10080 } = params;

  // 1. Generate 32 bytes cryptographically secure random token (64 hex characters)
  const token = crypto.randomBytes(32).toString("hex");

  // 2. Hash token with SHA-256 for persistent database storage
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

  // 3. Persist hash in database
  await prisma.guardianLinkToken.create({
    data: {
      branchId,
      studentId,
      tokenHash,
      channel,
      action,
      expiresAt,
    },
  });

  const baseUrl = process.env.NEXTAUTH_URL || process.env.BASE_URL || "";
  const url = `${baseUrl}/portal/guardian?token=${token}`;

  return {
    token,
    tokenHash,
    expiresAt,
    url,
  };
}

/**
 * Verifies a guardian magic link token against the stored hash.
 * Ensures the token is valid, not expired, and optionally marks it as used.
 */
export async function verifyGuardianMagicLink(
  token: string,
  options?: { markUsed?: boolean },
) {
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const link = await prisma.guardianLinkToken.findFirst({
    where: {
      tokenHash,
      expiresAt: {
        gt: new Date(),
      },
    },
    include: {
      student: true,
      branch: true,
    },
  });

  if (!link) {
    return null;
  }

  if (options?.markUsed && !link.usedAt) {
    await prisma.guardianLinkToken.update({
      where: { id: link.id },
      data: { usedAt: new Date() },
    });
  }

  return link;
}
