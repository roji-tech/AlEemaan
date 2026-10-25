import { z } from "zod";
import { prisma } from "@/lib/db";
import { fail } from "@/lib/api/envelope";
import { PASSWORD_MAX_LENGTH, verifyPassword } from "@/lib/auth/password";
import { refundAttempt, reserveAttempt } from "@/lib/auth/rate-limit";
import { hasActiveMfa, spendRecoveryCode, verifyTotpForUser } from "@/lib/auth/mfa/service";

// A fresh proof of who is acting, for a change that decides who may do something (task 0039: who approves results). The same rule as Octalve Edu's step-up: a person with
// two-step verification on gives a code from the authenticator (or spends a recovery code); a person without it types their own password. A stolen session alone is
// not enough. The proof is never logged or stored; wrong passwords are limited per account (a correct one is refunded).

export const stepUpProofSchema = z.strictObject({
  type: z.enum(["totp", "recovery", "password"]),
  value: z.string().min(1, "Step-up authentication proof is required").max(Math.max(256, PASSWORD_MAX_LENGTH)),
});
export type StepUpProofInput = z.infer<typeof stepUpProofSchema>;

export type StepUpVerificationResult =
  | { ok: true; verifiedAt: Date }
  | { ok: false; reason: "INVALID_MFA_CODE" | "WRONG_PASSWORD" | "RATE_LIMITED" | "MFA_NOT_ENROLLED"; status: number };

const WRONG_PASSWORDS_PER_WINDOW = 5;

export async function verifyStepUpProof(userId: string, proof: StepUpProofInput): Promise<StepUpVerificationResult> {
  if (await hasActiveMfa(userId)) {
    if (proof.type === "totp") {
      return (await verifyTotpForUser(userId, proof.value))
        ? { ok: true, verifiedAt: new Date() }
        : { ok: false, reason: "INVALID_MFA_CODE", status: 403 };
    }
    if (proof.type === "recovery") {
      return (await spendRecoveryCode(userId, proof.value))
        ? { ok: true, verifiedAt: new Date() }
        : { ok: false, reason: "INVALID_MFA_CODE", status: 403 };
    }
    // A password is not accepted from someone who has two-step verification on.
    return { ok: false, reason: "INVALID_MFA_CODE", status: 403 };
  }

  if (proof.type !== "password") return { ok: false, reason: "MFA_NOT_ENROLLED", status: 400 };
  const key = `stepup:user:${userId}`;
  if (!(await reserveAttempt(key, WRONG_PASSWORDS_PER_WINDOW))) return { ok: false, reason: "RATE_LIMITED", status: 429 };
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  // verifyPassword runs whatever was typed, so the time taken does not say whether there was a hash
  if (!(await verifyPassword(proof.value, user?.passwordHash ?? null))) return { ok: false, reason: "WRONG_PASSWORD", status: 403 };
  await refundAttempt(key); // a correct password is not a guess
  return { ok: true, verifiedAt: new Date() };
}

/// The one answer to a proof that did not pass; a proof that passed has no failure to show.
export function stepUpFailure(result: Extract<StepUpVerificationResult, { ok: false }>): Response {
  if (result.reason === "RATE_LIMITED") return fail("Too many verification attempts. Please wait a few minutes.", 429, "RATE_LIMITED");
  if (result.reason === "MFA_NOT_ENROLLED") {
    return fail("Two-step verification is not on for this account; please confirm with your password.", 400, "MFA_NOT_ENROLLED");
  }
  if (result.reason === "WRONG_PASSWORD") {
    return fail("That password isn't right.", 403, "WRONG_PASSWORD", [
      { path: "body.stepUp.value", message: "That password isn't right." },
    ]);
  }
  return fail("That code isn't right, or it has expired.", 403, "INVALID_MFA_CODE", [
    { path: "body.stepUp.value", message: "Invalid or expired code" },
  ]);
}
