// Runs once when the server starts (`next start`, `next dev`). A server that is missing a secret it cannot work safely without REFUSES TO START, with a
// message that names the variable, instead of starting and failing (or worse, working with a guessable value) on the first request that needs it.
//
// Not during `next build`: a build does not need the secret, and CI builds without the environment's secrets. Node only (the edge runtime never signs a
// portal cookie); the check itself lives in its own file so the edge bundle never sees `process.exit`.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { checkRequiredSecrets } = await import("./instrumentation-node");
  checkRequiredSecrets();
}
