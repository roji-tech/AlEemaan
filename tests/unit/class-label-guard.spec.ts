import { test, expect } from "@playwright/test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Task 0133: a class and its arm are written by `classLabel` / `armLabel` (lib/academics/class-label.ts) and nowhere else, so the hidden default arm of a class without arms never
// shows ("Beginner", not "Beginner _"). Source-level: no server, no database. A file that joins the two by hand fails here; use the helper instead.

const SRC = join(process.cwd(), "src");
/// The helper itself, and the legacy import, which makes real arms with the old name "Main" and writes them as text on purpose.
const EXEMPT = new Set(["lib/academics/class-label.ts", "lib/migration/legacy-mapper.ts"]);

/// The ways the two were joined by hand in this code base.
const HAND_JOINED: { name: string; pattern: RegExp }[] = [
  {
    name: "template: ${…group…name} ${…arm…}",
    pattern: /\$\{[\w.?]*(?:group|Group|class|Class)[\w.?]*name\} \$\{[\w.?]*(?:arm|Arm)[\w.?]*\}/,
  },
  { name: "template: ${…className}${…arm ? …}", pattern: /\$\{[\w.?]*[cC]lassName\}\$\{[\w.?]*\.arm \?/ },
  { name: "template: ${…className} ${…arm}", pattern: /\$\{[\w.?]*[cC]lassName\} \$\{[\w.?]*\.arm(?:\s*\|\|[^}]*)?\}/ },
  {
    name: "JSX: {…className} {…arm}",
    pattern: /\{[\w.?]*(?:classGroupName|className)(?:\s*\|\|[^}]*)?\} \{[\w.?]*\.?(?:arm|Arm)[\w.?]*(?:\s*\|\|[^}]*)?\}/,
  },
  { name: "JSX: {…classGroup.name} {…arm.name}", pattern: /\{[\w.?]*classGroup\??\.name\} \{[\w.?]*[aA]rm[\w.?]*\.name\}/ },
  {
    name: "array join: [x.className, x.arm].filter(Boolean).join(…)",
    pattern: /\[[\w.?]*[cC]lassName,\s*[\w.?]*\.arm\]\.filter\(Boolean\)\.join/,
  },
];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

test("no file writes a class and its arm by hand", () => {
  const offenders: string[] = [];
  for (const file of sources(SRC)) {
    const rel = relative(SRC, file).split("\\").join("/");
    if (EXEMPT.has(rel)) continue;
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (/^\s*(\/\/|\*)/.test(line)) return;
        for (const rule of HAND_JOINED) if (rule.pattern.test(line)) offenders.push(`src/${rel}:${i + 1}  ${rule.name}`);
      });
  }
  expect(offenders, "Write a class and its arm with classLabel() from @/lib/academics/class-label.").toEqual([]);
});
