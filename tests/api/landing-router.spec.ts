import "../support/env";
import { test, expect } from "@playwright/test";
import { HTTP_URL } from "../support/env";
import { Role, createUser, db, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";
import { brand } from "@/lib/brand";
import { landingAr } from "@/lib/landing-ar";

// What `/` answers (task 0048), over real HTTP and without a browser: a signed-out visitor is shown the landing page (a 200, not a redirect, and nothing set); a signed-in person is sent to the
// dashboard; an instance whose first-run setup is not finished is sent to its wizard. The page is a page, not a router: it never answers with a `Location` to a signed-out visitor.
//
// `api()` sends the request exactly as written (no cookie jar, redirects not followed).

test.beforeAll(async () => {
  await seedInstance();
});
test.afterAll(async () => {
  await seedInstance(); // the set-up flag is put back for whatever runs next
});

const h1s = (html: string) => [...html.matchAll(/<h1[\s>][\s\S]*?<\/h1>/g)].map((m) => m[0].replace(/<[^>]+>/g, "").trim());

test.describe("signed out", () => {
  test("the landing page itself (200), with the headline, and not a redirect", async () => {
    const res = await api("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    expect(h1s(res.text)).toEqual([brand.landing.headline]);
    expect(res.text).toContain(brand.landing.coversHeading);
  });

  test("it sets no cookie and writes nothing", async () => {
    const before = await db.session.count();
    const res = await api("/");
    expect(res.setCookies).toEqual([]);
    expect(await db.session.count()).toBe(before);
  });

  test("the ways in are real links: /login and the parent and pupil portal, and the same page in Arabic (task 0050); nothing else leaves the page", async () => {
    const res = await api("/");
    const hrefs = [...res.text.matchAll(/<a\s[^>]*href="([^"]*)"/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThanOrEqual(4);
    expect([...new Set(hrefs)].sort()).toEqual(["/ar", "/login", "/portal"]);
    for (const path of ["/login", "/portal", "/ar"]) expect((await api(path)).status).toBe(200);
  });

  test("the link to the Arabic page says so in Arabic and is marked as Arabic", async () => {
    const res = await api("/");
    const link = /<a\s[^>]*href="\/ar"[^>]*>[^<]*<\/a>/.exec(res.text)?.[0] ?? "";
    expect(link).toContain("العربية");
    expect(link).toContain('lang="ar"');
    expect(link).toContain('hrefLang="ar"');
  });

  test("this product is one school's own: there is no 'how it is run' section", async () => {
    const res = await api("/");
    expect((res.text.match(/<h2[\s>]/g) ?? []).length).toBe(3); // what it covers, the people, the closing band
  });

  test("the tab and the description are the page's own, and it is open to search engines", async () => {
    const res = await api("/");
    const html = res.text.replaceAll("&#x27;", "'"); // the page escapes an apostrophe in an attribute
    expect(html).toContain(`<title>${brand.landing.title}</title>`);
    expect(html).toContain(`name="description" content="${brand.landing.description}"`);
    expect(html).not.toMatch(/name="robots"[^>]*noindex/);
  });

  test("a forged or garbage session cookie is a signed-out visitor: the page, not an error and not a redirect", async () => {
    for (const cookie of [cookieHeader("not-a-real-token"), cookieHeader("zzzz"), cookieHeader("")]) {
      const res = await api("/", { cookie });
      expect(res.status, cookie).toBe(200);
      expect(res.headers.get("location"), cookie).toBeNull();
    }
  });
});

test.describe("signed in", () => {
  test("a person with a session is sent to the dashboard, and sees no landing page", async () => {
    const admin = await createUser({ role: Role.ADMIN, name: "Landing Admin" });
    const login = await loginAs(admin);
    expect(login.token).not.toBeNull();
    const res = await api("/", { cookie: cookieHeader(login.token!) });
    expect([307, 308]).toContain(res.status);
    expect(new URL(res.headers.get("location")!, HTTP_URL).pathname).toBe("/dashboard");
    expect(res.text).not.toContain(brand.landing.coversHeading);
  });
});

test.describe("an instance still being set up", () => {
  test("setup not finished: sent to the wizard, as before; finished: the landing page", async () => {
    await db.systemSettings.update({ where: { id: "global" }, data: { setupComplete: false } });
    try {
      const res = await api("/");
      expect([307, 308]).toContain(res.status);
      expect(new URL(res.headers.get("location")!, HTTP_URL).pathname).toBe("/setup");
    } finally {
      await seedInstance();
    }
    expect((await api("/")).status).toBe(200);
  });
});

// The same page in Arabic, right to left (task 0050): `/ar` decides exactly as `/` does.
test.describe("/ar, the page in Arabic", () => {
  test("signed out: the page itself (200, not a redirect), in Arabic and right to left, with its own title and description", async () => {
    const res = await api("/ar");
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    expect(h1s(res.text)).toEqual([landingAr.headline]);
    expect(res.text).toContain('lang="ar" dir="rtl"');
    expect(res.text).toContain(`<title>${landingAr.title}</title>`);
    expect(res.text).toContain(`name="description" content="${landingAr.description}"`);
    expect(res.text).not.toMatch(/name="robots"[^>]*noindex/);
    expect(res.text).not.toContain(brand.landing.headline);
  });

  test("it sets no cookie and writes nothing, and a forged cookie is a signed-out visitor", async () => {
    const before = await db.session.count();
    const res = await api("/ar");
    expect(res.setCookies).toEqual([]);
    expect(await db.session.count()).toBe(before);
    for (const cookie of [cookieHeader("not-a-real-token"), cookieHeader("")])
      expect((await api("/ar", { cookie })).status, cookie).toBe(200);
  });

  test("its links are /login, the portal and the English page, and the English link says so in English and is marked as English", async () => {
    const res = await api("/ar");
    const hrefs = [...res.text.matchAll(/<a\s[^>]*href="([^"]*)"/g)].map((m) => m[1]);
    expect([...new Set(hrefs)].sort()).toEqual(["/", "/login", "/portal"]);
    const link = /<a\s[^>]*href="\/"[^>]*>[^<]*<\/a>/.exec(res.text)?.[0] ?? "";
    expect(link).toContain(">English<");
    expect(link).toContain('lang="en"');
    expect(link).toContain('hrefLang="en"');
  });

  test("signed in: sent to the dashboard like `/`, and the page is not shown", async () => {
    const admin = await createUser({ role: Role.ADMIN, name: "Arabic Landing Admin" });
    const login = await loginAs(admin);
    const res = await api("/ar", { cookie: cookieHeader(login.token!) });
    expect([307, 308]).toContain(res.status);
    expect(new URL(res.headers.get("location")!, HTTP_URL).pathname).toBe("/dashboard");
    expect(res.text).not.toContain(landingAr.coversHeading);
  });

  test("setup not finished: sent to the wizard like `/`; finished: the page", async () => {
    await db.systemSettings.update({ where: { id: "global" }, data: { setupComplete: false } });
    try {
      const res = await api("/ar");
      expect([307, 308]).toContain(res.status);
      expect(new URL(res.headers.get("location")!, HTTP_URL).pathname).toBe("/setup");
    } finally {
      await seedInstance();
    }
    expect((await api("/ar")).status).toBe(200);
  });
});
