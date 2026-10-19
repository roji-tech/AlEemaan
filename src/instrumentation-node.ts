import { portalSecretProblem } from "@/lib/portal/secret";

/// Exits the process (code 1) when a required secret is missing or weak. Why exit and not just throw: when `register()` throws, Next 16 logs
/// "Failed to prepare server" but the process stays up and answers every request with a 500 (verified 2026-10-19), so a supervisor never sees a crash and
/// never restarts or alerts. Exiting is what "refuse to start" means. The message names the variable and never contains the secret.
export function checkRequiredSecrets(
  env: Record<string, string | undefined> = process.env,
  exit: (code: number) => never = process.exit,
): void {
  const problems = [portalSecretProblem(env)].filter((problem): problem is string => problem !== null);
  if (problems.length === 0) return;

  console.error(
    [
      "",
      "The server cannot start: a required secret is missing or too weak.",
      ...problems.map((problem) => `  - ${problem}`),
      "Generate a secret with: openssl rand -base64 48   (see .env.example)",
      "",
    ].join("\n"),
  );
  exit(1);
}
