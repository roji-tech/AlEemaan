import "../support/env";
import { test, expect } from "@playwright/test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { Role, createUser, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// Every API route with a dynamic segment ([id], [studentId], ...), every method it exports, hostile values in the path, as a superadmin (the caller with the most
// reach, so the request gets past authorization to the code that uses the id). A value from the URL that can only be a mistake or an attack must never be a server
// error: a NUL byte in particular is a Postgres error, which used to end as a 500 on 24 routes (found by the probe of 2026-10-19; fixed once, in `withAuth`).
//
// The routes are found by reading the source tree, like the route-role-guard spec, so a NEW dynamic route is covered the day it is added.

const ROOT = join(process.cwd(), "src", "app", "api");
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

const routeFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? routeFiles(full) : name === "route.ts" ? [full] : [];
  });

// Percent-encoded as they would arrive: NUL, a NUL inside text, other control characters, DEL, a newline, an unpaired surrogate (not valid UTF-8, so it arrives as
// replacement characters or is refused by the server before the route), path tricks, SQL, 300 and 5000 characters.
const HOSTILE = [
  "%00",
  "a%00b",
  "%01",
  "%1f",
  "%7f",
  "a%0Ab",
  "%ED%A0%80",
  "..%2F..%2Fx",
  "'%20OR%201%3D1--",
  "x".repeat(300),
  "x".repeat(5000),
];

test("every dynamic API route answers a hostile path value with a client error, never a server error", async () => {
  test.setTimeout(900_000);
  await resetDatabase();
  await seedInstance();
  const sup = await createUser({ role: Role.ADMIN });
  const login = await loginAs(sup);
  const cookie = cookieHeader(login.token!);

  const routes = routeFiles(ROOT)
    .filter((f) => f.includes("["))
    .map((file) => {
      const rel = relative(ROOT, file).replace(/\/route\.ts$/, "");
      const text = readFileSync(file, "utf8");
      const methods = METHODS.filter((m) => new RegExp(`^export (?:const|async function) ${m}\\b`, "m").test(text));
      return { rel, methods };
    });
  // a guard against this test silently walking nothing (a moved folder, a renamed file)
  expect(routes.length, "dynamic routes found").toBeGreaterThan(40);
  expect(
    routes.reduce((n, r) => n + r.methods.length, 0),
    "exported methods found",
  ).toBeGreaterThan(80);

  const problems: string[] = [];
  let sent = 0;
  for (const { rel, methods } of routes) {
    for (const junk of HOSTILE) {
      const url = "/api/" + rel.replace(/\[[^\]]+\]/g, junk);
      for (const method of methods) {
        const res = await api(url, { method, cookie, ...(method === "GET" ? {} : { body: {} }) });
        sent++;
        if (res.status >= 500) problems.push(`${method} ${rel} [${junk.slice(0, 10)}] -> ${res.status}`);
      }
    }
  }
  expect(sent, "requests sent").toBeGreaterThan(900);
  expect(problems).toEqual([]); // collected, then asserted once: thousands of expect calls make a slow test slower
});
