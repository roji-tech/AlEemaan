#!/usr/bin/env node

/**
 * Continuous Walkthrough Suite Runner (AlEemaan)
 *
 * Automates:
 * 1. Dedicated walkthrough database reset and migration (wip_aleemaan_walkthrough).
 * 2. Dedicated web server startup with in-app dev tools / mail inbox enabled.
 * 3. Execution of the unbroken Playwright walkthrough recording (1366x768).
 * 4. Invocation of report.mjs to generate video, VTT, chapters, and captioned PDF.
 */

import { spawn } from "child_process";
import http from "http";
import path from "path";
import fs from "fs";
import {
  assertCurrentDatabase,
  assertLocalDatabaseHost,
  assertNoOtherConnections,
  assertWalkthroughDbName,
  generateSetupToken,
} from "./safety.mjs";
import { outputRoot } from "./paths.mjs";

try {
  process.loadEnvFile(".env");
} catch {
  // no .env - fine
}

const PORT = process.env.WALKTHROUGH_PORT || "3320";
const DEFAULT_DB_NAME = process.env.WALKTHROUGH_DB_NAME || "wip_aleemaan_walkthrough";

function resolveWalkthroughDbUrl() {
  if (process.env.WALKTHROUGH_DATABASE_URL) {
    return process.env.WALKTHROUGH_DATABASE_URL;
  }
  const base = process.env.DATABASE_URL || "postgresql://aleemaan:aleemaan@localhost:5434/aleemaan";
  const url = new URL(base);
  url.pathname = `/${DEFAULT_DB_NAME}`;
  return url.toString();
}

const DATABASE_URL = resolveWalkthroughDbUrl();
const parsedUrl = new URL(DATABASE_URL);
// The database that is dropped is the one the server and the migrations will use: its name comes from the URL, never from a second setting that could disagree with it.
const DB_NAME = decodeURIComponent(parsedUrl.pathname.slice(1));
const DB_HOST = parsedUrl.hostname;
const DB_PORT = parsedUrl.port || "5434";
const DB_USER = parsedUrl.username || "aleemaan";

// The client tools (createdb, dropdb, psql) take the password from PGPASSWORD, not from a URL.
const PG_ENV = { PGPASSWORD: decodeURIComponent(parsedUrl.password) };

/// Runs a command and returns what it printed. For short, read-only answers such as `select current_database()`.
function captureCmd(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { env: { ...process.env, ...PG_ENV }, stdio: ["ignore", "pipe", "inherit"] });
    let out = "";
    proc.stdout.on("data", (d) => (out += d));
    proc.on("close", (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(`${cmd} exited with code ${code}`))));
  });
}

async function runCmd(cmd, args, env = {}) {
  return new Promise((resolve, reject) => {
    console.log(`> ${cmd} ${args.join(" ")}`);
    const proc = spawn(cmd, args, {
      stdio: "inherit",
      env: { ...process.env, ...PG_ENV, ...env },
    });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
  });
}

async function waitForServer(url, timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
          if (res.statusCode && res.statusCode < 500) resolve();
          else reject(new Error(`Status ${res.statusCode}`));
        });
        req.on("error", reject);
        req.setTimeout(2000, () => {
          req.destroy();
          reject(new Error("Timeout"));
        });
      });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 600));
    }
  }
  throw new Error(`Server at ${url} did not become ready within ${timeoutMs}ms.`);
}

async function main() {
  console.log("=== ALEEMAAN: PRODUCT WALKTHROUGH RUNNER ===");
  console.log(`Port: ${PORT}`);
  console.log(`Database: ${DB_NAME} on ${DB_HOST}:${DB_PORT}`);

  // 0. This script drops and recreates a database: be certain which one, before anything is touched.
  assertWalkthroughDbName(DB_NAME);
  assertLocalDatabaseHost(DATABASE_URL);
  const connections = await captureCmd("psql", [
    "-h",
    DB_HOST,
    "-p",
    DB_PORT,
    "-U",
    DB_USER,
    "-d",
    "postgres",
    "-tAc",
    `select count(*) from pg_stat_activity where datname = '${DB_NAME}'`,
  ]); // DB_NAME is safe in a string: assertWalkthroughDbName allows only lower case, digits and underscores
  assertNoOtherConnections(connections, DB_NAME);

  // 1. Prepare Dedicated Walkthrough Database
  console.log("\n[1/4] Preparing dedicated database from scratch...");
  await runCmd("dropdb", ["-h", DB_HOST, "-p", DB_PORT, "-U", DB_USER, "--if-exists", DB_NAME]);
  await runCmd("createdb", ["-h", DB_HOST, "-p", DB_PORT, "-U", DB_USER, DB_NAME]);

  // The first write is the migration: confirm what the connection really points at, with no seed and nothing else in the database.
  assertCurrentDatabase(DB_NAME, await captureCmd("psql", [DATABASE_URL, "-tAc", "select current_database()"]));

  console.log("Deploying migrations to walkthrough database...");
  await runCmd("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    DATABASE_URL,
  });

  // 2. Start Web Server
  console.log(`\n[2/4] Starting server on port ${PORT}...`);
  // The setup wizard asks for a deployment token when the server has one; each run makes its own and keeps it out of the logs.
  const SETUP_TOKEN = generateSetupToken();
  const serverEnv = {
    ...process.env,
    PORT,
    DATABASE_URL,
    SETUP_TOKEN,
    APP_URL: `http://localhost:${PORT}`,
    DEV_TOOLS_ENABLED: "true",
    NODE_ENV: "production",
  };

  const hasBuild = fs.existsSync(path.resolve(process.cwd(), ".next"));
  const serverCmd = hasBuild ? "start" : "dev";
  console.log(`Starting Next.js using 'next ${serverCmd}'...`);

  const serverProc = spawn("pnpm", ["exec", "next", serverCmd, "-p", PORT], {
    env: serverEnv,
    stdio: "pipe",
  });

  serverProc.stdout.on("data", (d) => process.stdout.write(`[server] ${d}`));
  serverProc.stderr.on("data", (d) => process.stderr.write(`[server-err] ${d}`));

  const cleanup = () => {
    try {
      serverProc.kill("SIGTERM");
    } catch {
      // ignore
    }
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(1);
  });

  console.log("Waiting for web server to be ready...");
  await waitForServer(`http://localhost:${PORT}`);
  console.log("Web server is healthy and responding!");

  // 3. Execute Continuous Walkthrough Suite
  console.log("\n[3/4] Launching Playwright Continuous Walkthrough recording...");
  try {
    await runCmd(
      "pnpm",
      [
        "exec",
        "playwright",
        "test",
        "--config=playwright.walkthrough.config.ts",
        `--project=${process.env.WALKTHROUGH_PASS || "desktop-light"}`,
      ],
      {
        WALKTHROUGH_OUTPUT_ROOT: outputRoot(),
        WALKTHROUGH_SETUP_TOKEN: SETUP_TOKEN,
        WALKTHROUGH_PORT: PORT,
        WALKTHROUGH_BASE_URL: `http://localhost:${PORT}`,
      },
    );
  } finally {
    cleanup();
  }

  // 4. Generate Artifacts & Publish to Web
  console.log("\n[4/4] Generating deliverables & publishing to /video-guide...");
  await runCmd("node", ["scripts/walkthrough-run/report.mjs"]);

  console.log("\n=== WALKTHROUGH RUN COMPLETED SUCCESSFULLY ===");
}

main().catch((err) => {
  console.error("Walkthrough execution failed:", err);
  process.exit(1);
});
