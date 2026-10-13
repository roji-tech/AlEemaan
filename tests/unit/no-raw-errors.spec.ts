import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// ISS-0006: a route must never hand an exception's own text to the caller (a database or library message can name tables, columns and values).
// Source-level, no server: it finds the pattern `error instanceof Error ? error.message : "…"` feeding a response in any API route.

function routes(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? routes(full) : entry.name === "route.ts" ? [full] : [];
  });
}

test("no API route returns the text of a caught exception to the caller (logging it is fine)", () => {
  const pattern = /(error|err|e) instanceof Error \? (error|err|e)\.message/;
  const offenders = routes("src/app/api").filter((file) =>
    fs
      .readFileSync(file, "utf8")
      .split("\n")
      .some((line) => pattern.test(line) && !line.includes("console.")),
  );
  expect(offenders, "return a fixed message (or a DomainError's) and console.error the exception instead").toEqual([]);
});
