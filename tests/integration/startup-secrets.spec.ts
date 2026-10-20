import { TEST_PORTAL_SECRET } from "../support/env";
import { spawn } from "node:child_process";
import { test, expect } from "@playwright/test";

// The real thing: a production `next start` process with no usable portal secret must EXIT (code 1) and say why. Found 2026-10-19: when the startup hook only
// THREW, Next 16 printed "Failed to prepare server" and kept running, answering every request with a 500, so a supervisor never saw a crash. Needs a build
// (the suite always builds first). Port 3205 is this spec's own; the database is never touched (the process dies before it serves a request).

const PORT = 3205;
const BASE = {
  PATH: process.env.PATH ?? "",
  HOME: process.env.HOME ?? "",
  NODE_ENV: "production",
  APP_URL: `http://localhost:${PORT}`,
  DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://unused@127.0.0.1:1/unused",
  MFA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  // `next start` reads the developer's own `.env` from the working directory and a variable that is not already in the process's environment is taken from it: a machine whose
  // `.env` holds a real SESSION_SECRET (every developer's, to run the portal) made these four start normally and fail, while CI, which has no `.env`, passed. A variable that
  // IS in the environment, even empty, is never overwritten by the file, so the two the guard is about are set (to nothing) here, and each case below sets what it needs.
  SESSION_SECRET: "",
  AUTH_SECRET: "",
};

function start(extra: Record<string, string>): Promise<{ code: number | null; output: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    // detached: the server is a grandchild of `pnpm`, so killing `pnpm` alone leaves it running on the port (a failed case once left one behind, and the three cases after it
    // died with EADDRINUSE); the whole process group is killed instead.
    const child = spawn("pnpm", ["exec", "next", "start", "-p", String(PORT)], {
      env: { ...BASE, ...extra } as NodeJS.ProcessEnv,
      stdio: "pipe",
      detached: true,
    });
    const killGroup = () => {
      try {
        process.kill(-child.pid!, "SIGKILL");
      } catch {
        // already gone
      }
    };
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => (output += chunk));
    child.stderr.on("data", (chunk: Buffer) => (output += chunk));
    const timer = setTimeout(() => {
      killGroup();
      resolve({ code: null, output, timedOut: true });
    }, 45_000);
    child.on("exit", (code: number | null) => {
      clearTimeout(timer);
      killGroup(); // the wrapper exiting does not mean its child did
      resolve({ code, output, timedOut: false });
    });
  });
}

test.describe("a server without a usable portal secret refuses to start", () => {
  test.slow();

  for (const [name, env] of [
    ["no SESSION_SECRET at all", {}],
    ["only the retired AUTH_SECRET", { AUTH_SECRET: TEST_PORTAL_SECRET }],
    ["a 27-character secret (the length of the old AUTH_SECRET)", { SESSION_SECRET: "x7Kq-2mLw0pXc9Vt3nBh8Ys2KdJ" }],
    ["the old published default", { SESSION_SECRET: "aleemaan-portal-secure-hmac-secret-salt-2026" }],
  ] as const) {
    test(`${name}: exits with code 1 and names SESSION_SECRET`, async () => {
      const result = await start(env);
      expect(result.timedOut, `the process kept running:\n${result.output}`).toBe(false);
      expect(result.code).toBe(1);
      expect(result.output).toContain("SESSION_SECRET");
      for (const value of Object.values(env)) expect(result.output).not.toContain(value);
    });
  }
});
