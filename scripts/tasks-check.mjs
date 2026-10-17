#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

// This checkout, and its sibling Octalve Edu (override with OCTALVE_EDU_PATH). Run from the repository root: `pnpm tasks:check`.
const ALEEMAAN_PATH = process.cwd();
const OCTALVE_EDU_PATH = process.env.OCTALVE_EDU_PATH ?? path.resolve(ALEEMAAN_PATH, "..", "..", "OCTALVE", "octalve-edu");

function parseTasks(repoPath) {
  const currentTasksFile = path.join(repoPath, "docs", "tasks", "current-tasks.md");
  if (!fs.existsSync(currentTasksFile)) {
    return { found: false, tasks: [] };
  }

  const content = fs.readFileSync(currentTasksFile, "utf8");
  const lines = content.split("\n");
  const tasks = [];

  for (const line of lines) {
    // Match table rows like: | 0001 | ... | ... | Status | ...
    if (line.trim().startsWith("|") && !line.includes("---") && !line.includes("Task File")) {
      const parts = line
        .split("|")
        .map((p) => p.trim())
        .filter(Boolean);
      if (parts.length >= 4) {
        tasks.push({
          id: parts[0],
          file: parts[1].replace(/\[|\]|\(.*?\)/g, ""),
          desc: parts[2],
          status: parts[3],
          dates: parts[4] || "",
        });
      }
    }
  }

  return { found: true, tasks, rawSnippet: lines.slice(0, 30).join("\n") };
}

const octalveData = parseTasks(OCTALVE_EDU_PATH);
const aleemaanData = parseTasks(ALEEMAAN_PATH);

console.log("\n\x1b[1m\x1b[36m========================================================================\x1b[0m");
console.log("             \x1b[1mOCTALVE EDU  <--->  AL-EEMAAN  TASK ALIGNMENT\x1b[0m");
console.log("\x1b[1m\x1b[36m========================================================================\x1b[0m\n");

// Octalve Summary
console.log("\x1b[33m▶ OCTALVE EDU (Canonical Reference Architecture)\x1b[0m");
console.log(`  Path: ${OCTALVE_EDU_PATH}`);
if (octalveData.found && octalveData.tasks.length > 0) {
  for (const t of octalveData.tasks) {
    const icon = t.status.toLowerCase().includes("complete") ? "\x1b[32m✔ [Done]\x1b[0m" : "\x1b[34m⏳ [Active]\x1b[0m";
    console.log(`    ${icon} \x1b[1m${t.id}\x1b[0m: ${t.desc} (${t.status})`);
  }
} else {
  console.log("    _No tasks recorded in docs/tasks/current-tasks.md_");
}

console.log("");

// AlEemaan Summary
console.log("\x1b[35m▶ AL-EEMAAN (Single-School Implementation / Port)\x1b[0m");
console.log(`  Path: ${ALEEMAAN_PATH}`);
if (aleemaanData.found && aleemaanData.tasks.length > 0) {
  for (const t of aleemaanData.tasks) {
    const icon = t.status.toLowerCase().includes("complete") ? "\x1b[32m✔ [Done]\x1b[0m" : "\x1b[34m⏳ [Active]\x1b[0m";
    console.log(`    ${icon} \x1b[1m${t.id}\x1b[0m: ${t.desc} (${t.status})`);
  }
} else {
  console.log("    _No tasks recorded in docs/tasks/current-tasks.md_");
}

console.log("\n\x1b[1m\x1b[36m========================================================================\x1b[0m\n");
