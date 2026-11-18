import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { FOLDS_WITH_BRANCH, holdingLabel, toHolding } from "@/lib/branches/holdings";

// The rule of deleting a branch, without a database: what counts as set-up (goes with the branch) and what as people or history (stops the deletion).
const ROOT = path.resolve(__dirname, "../..");

test("rows that are people or history block; set-up does not; an empty table says nothing", () => {
  expect(toHolding("StudentRecord", 3)).toEqual({ label: "pupils", count: 3, blocks: true });
  expect(toHolding("Invoice", 1)).toEqual({ label: "invoices", count: 1, blocks: true });
  expect(toHolding("ClassGroup", 2)).toEqual({ label: "classes", count: 2, blocks: false });
  expect(toHolding("Invitation", 5)).toEqual({ label: "invitations", count: 5, blocks: false });
  expect(toHolding("StudentRecord", 0)).toBeNull();
});

test("an active membership blocks, a deactivated one does not", () => {
  expect(toHolding("Membership", 2, false)).toEqual({ label: "active members", count: 2, blocks: true });
  expect(toHolding("Membership", 2, true)).toEqual({ label: "deactivated memberships", count: 2, blocks: false });
});

test("a table nobody has classified blocks, with a readable name", () => {
  expect(toHolding("SomethingNew", 1)).toEqual({ label: "something new records", count: 1, blocks: true });
  expect(holdingLabel("FormTurnInAudit")).toBe("form turn in audit records");
});

test("every table classed as set-up is a real model with a branch relation (a rename in the schema cannot silently turn one into 'unclassified')", () => {
  const schema = fs
    .readdirSync(path.join(ROOT, "prisma/schema"))
    .filter((f) => f.endsWith(".prisma"))
    .map((f) => fs.readFileSync(path.join(ROOT, "prisma/schema", f), "utf8"))
    .join("\n");
  for (const table of FOLDS_WITH_BRANCH) {
    const block = new RegExp(`model ${table} \\{([\\s\\S]*?)\\n\\}`).exec(schema)?.[1];
    expect(block, `model ${table}`).toBeDefined();
    expect(block, `${table} refers to Branch`).toMatch(/\bBranch\b/);
  }
});
