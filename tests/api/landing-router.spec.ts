import "../support/env";
import { test, expect } from "@playwright/test";
import { HTTP_URL } from "../support/env";
import { Role, createUser, db, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";
import { brand } from "@/lib/brand";

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

  test("the two ways in are real links: /login and the parent and pupil portal, and nothing else leaves the page", async () => {
    const res = await api("/");
    const hrefs = [...res.text.matchAll(/<a\s[^>]*href="([^"]*)"/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThanOrEqual(4);
    expect([...new Set(hrefs)].sort()).toEqual(["/login", "/portal"]);
    for (const path of ["/login", "/portal"]) expect((await api(path)).status).toBe(200);
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
