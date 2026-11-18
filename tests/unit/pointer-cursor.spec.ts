import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

// Everything that can be pressed shows the pointer, and a control that cannot be used right now shows "not allowed" (the maintainer: "make these buttons and others similar cursor pointer").
// Tailwind 4's base styles leave a button with the arrow, so the app's own stylesheet has to say it. This reads the rule (the browser spec checks a real button).
const css = fs.readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8");
const block = (needle: string) => {
  const at = css.indexOf(needle);
  expect(at, needle).toBeGreaterThan(-1);
  const open = css.indexOf("{", at);
  return { selectors: css.slice(css.lastIndexOf("}", at) + 1, open), body: css.slice(open + 1, css.indexOf("}", open)) };
};

test("the pointer rule covers buttons, tabs, summaries, selects, file pickers and their 'Choose File' button, and is in the base layer", () => {
  const rule = block("button:not(:disabled),");
  for (const selector of [
    "button:not(:disabled)",
    '[role="tab"]',
    "summary",
    "select:not(:disabled)",
    'input[type="file"]:not(:disabled)',
    'input[type="file"]:not(:disabled)::file-selector-button',
    'input[type="checkbox"]:not(:disabled)',
  ])
    expect(rule.selectors, selector).toContain(selector);
  expect(rule.body).toContain("cursor: pointer");
  expect(css.slice(0, css.indexOf("button:not(:disabled),"))).toMatch(/@layer base\s*\{\s*$/);
});

test("a disabled control shows 'not allowed', and the pointer rule never reaches a disabled one", () => {
  const rule = block("button:disabled,");
  expect(rule.selectors).toContain("button:disabled");
  expect(rule.selectors).toContain('[aria-disabled="true"]');
  expect(rule.body).toContain("cursor: not-allowed");
  const pointer = block("button:not(:disabled),");
  expect(pointer.selectors).not.toMatch(/button:disabled/);
});
