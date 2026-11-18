import "../support/env";
import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { FEES } from "@/lib/school-site/fees";
import { SITE_NAV, SITE_SIGN_IN } from "@/lib/school-site/nav";
import { SCHOOL_MAP_ORIGINS, SCHOOL_SITE_PAGES } from "@/lib/school-site/paths";
import { buildCsp } from "@/lib/security/csp";

// The school's own website (task 0080): the old static pages, written in React and Tailwind under `src/app/(marketing)/(site)`. What is pinned here without a server: the pages exist, the application's policy is the
// only policy (the map's frame is the one addition, and only when asked for), no page carries what the old pages needed a loose policy for, and no link goes to a route that is not there.

const ROOT = process.cwd();
const SITE_DIR = path.join(ROOT, "src/app/(marketing)/(site)");
const sources = (): { file: string; text: string }[] => {
  const out: { file: string; text: string }[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(tsx?|ts)$/.test(e.name)) out.push({ file: path.relative(ROOT, full), text: fs.readFileSync(full, "utf8") });
    }
  };
  walk(SITE_DIR);
  walk(path.join(ROOT, "src/components/site"));
  for (const f of ["src/lib/school-site/nav.ts", "src/lib/school-site/fees.ts", "src/lib/school-site/alumni.ts"])
    out.push({ file: f, text: fs.readFileSync(path.join(ROOT, f), "utf8") });
  return out;
};

test("the nine pages each have a page in the (site) group, the application's own /portal and /academics are not shadowed, and the old HTML machinery is gone", () => {
  for (const route of SCHOOL_SITE_PAGES) {
    const file = route === "/" ? path.join(SITE_DIR, "page.tsx") : path.join(SITE_DIR, route.slice(1), "page.tsx");
    expect(fs.existsSync(file), route).toBe(true);
  }
  expect(fs.existsSync(path.join(ROOT, "src/app/page.tsx"))).toBe(false);
  expect(fs.existsSync(path.join(ROOT, "src/app/(marketing)/portal"))).toBe(false);
  expect(fs.existsSync(path.join(SITE_DIR, "academics"))).toBe(false); // the application's Academics page is /academics; the school's is /our-academics
  expect(fs.existsSync(path.join(ROOT, "src/app/(marketing)/_site"))).toBe(false);
  expect(fs.existsSync(path.join(ROOT, "src/lib/school-site/respond.ts"))).toBe(false);
  expect(fs.existsSync(path.join(ROOT, "public/school-site/js"))).toBe(false);
});

test("the policy: the application's own, with the map's frame only when it is asked for", () => {
  const plain = buildCsp({ nonce: "N", https: true });
  expect(plain).not.toContain("frame-src");
  for (const loose of ["unsafe-inline", "gstatic", "google", "cdnjs", "script-src-attr", "style-src-attr"])
    expect(plain, loose).not.toContain(loose);
  const map = buildCsp({ nonce: "N", https: true, frameOrigin: SCHOOL_MAP_ORIGINS });
  expect(map).toContain(`frame-src 'self' ${SCHOOL_MAP_ORIGINS.join(" ")}`);
  expect(map.split("; ").filter((d) => d.startsWith("frame-src"))).toHaveLength(1);
  expect(map).toContain("'strict-dynamic'");
  expect(map).toContain("frame-ancestors 'none'");
});

test("nothing in the site's source needs a loose policy: no raw HTML, no inline script or handler, no style or script element, no host but the few it links to", () => {
  const ALLOWED_HOSTS = new Set(["wa.me", "drive.google.com", "www.google.com", "maps.google.com", "aleemanschool.com"]);
  const problems: string[] = [];
  for (const { file, text } of sources()) {
    for (const [pattern, what] of [
      [/dangerouslySetInnerHTML/, "raw HTML"],
      [/<script[\s>]/, "a script element"],
      [/<style[\s>]/, "a style element"],
      [/\son(click|change|submit|load|error)=["'{]\s*["']/, "an inline handler string"],
      [/javascript:/, "a javascript: link"],
    ] as const)
      if (pattern.test(text)) problems.push(`${file}: ${what}`);
    for (const m of text.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) if (!ALLOWED_HOSTS.has(m[1])) problems.push(`${file}: host ${m[1]}`);
  }
  expect(problems).toEqual([]);
});

test("every link to a page of the site goes somewhere: a page of the site, the sign-in page, or the application's own /portal", () => {
  const known = new Set<string>([...SCHOOL_SITE_PAGES, "/select-role", "/login", "/portal"]);
  const bad: string[] = [];
  for (const { file, text } of sources()) {
    for (const m of text.matchAll(/(?:href(?:=|: )|href=\{)["'`](\/[^"'`#?]*)(?:[#?][^"'`]*)?["'`]/g)) {
      const target = m[1];
      if (target.startsWith("/school-site/")) continue;
      if (!known.has(target)) bad.push(`${file}: ${target}`);
    }
  }
  expect(bad).toEqual([]);
  for (const n of SITE_NAV) expect(known.has(n.href), n.href).toBe(true);
  expect(SITE_SIGN_IN.href).toBe("/select-role");
});

test("every picture and recording the site names is in public/school-site", () => {
  const missing: string[] = [];
  for (const { file, text } of sources())
    for (const m of text.matchAll(/["'`](\/school-site\/[A-Za-z0-9._/-]+)["'`]/g))
      if (!fs.existsSync(path.join(ROOT, "public", m[1]))) missing.push(`${file}: ${m[1]}`);
  expect(missing).toEqual([]);
});

test("the fee schedules are well formed: every row has a value for every column, a total has one per column, and ids are unique", () => {
  const ids = new Set<string>();
  const problems: string[] = [];
  for (const c of FEES.categories)
    for (const b of c.bills) {
      if (ids.has(b.id)) problems.push(`duplicate id ${b.id}`);
      ids.add(b.id);
      for (const r of b.rows)
        if (r.values.length !== b.columns.length)
          problems.push(`${b.id}: ${r.label} has ${r.values.length} values for ${b.columns.length} columns`);
      if (b.showTotal && b.totals?.length !== b.columns.length) problems.push(`${b.id}: totals`);
    }
  expect(problems).toEqual([]);
  expect(ids.size).toBeGreaterThanOrEqual(8);
});
