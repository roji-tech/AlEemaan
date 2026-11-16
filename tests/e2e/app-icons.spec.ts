import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { seedInstance } from "../support/db";

// The app's icons (task 0082): the tab icon (`/favicon.ico`), the app icon (`/icon`, 512 px, in the web manifest) and the Apple touch icon (`/apple-icon`, 180 px) show the school's logo (green on white), not the
// white "A" on navy they used to be. Each picture is decoded by the browser and its pixels are counted, so the test sees what a person sees.

test.beforeAll(async () => {
  await seedInstance();
});

type Look = { width: number; height: number; green: number; navy: number; edgeWhite: boolean };

/// Loads `url` as a picture on a page of this site and describes it: its size, the share of green pixels (the logo's colour) and of dark navy pixels (the old icon), and whether the middle of its left edge is opaque white.
async function look(page: Page, url: string): Promise<Look> {
  await page.goto("/login");
  return page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let green = 0;
    let navy = 0;
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
      if (a < 200) continue;
      if (g > r + 25 && g > b + 5) green++;
      if (r < 50 && g < 70 && b < 100) navy++;
    }
    const mid = ctx.getImageData(2, Math.floor(canvas.height / 2), 1, 1).data;
    const total = canvas.width * canvas.height;
    return {
      width: canvas.width,
      height: canvas.height,
      green: green / total,
      navy: navy / total,
      edgeWhite: mid[0] > 245 && mid[1] > 245 && mid[2] > 245 && mid[3] > 245,
    };
  }, url);
}

test("the app icon (/icon) is the school's logo, green on white, 512 px, with no navy left", async ({ page }) => {
  const icon = await look(page, "/icon");
  expect(icon.width).toBe(512);
  expect(icon.height).toBe(512);
  expect(icon.green).toBeGreaterThan(0.03);
  expect(icon.edgeWhite).toBe(true);
});

test("the old navy of the app icon is gone", async ({ page }) => {
  expect((await look(page, "/icon")).navy).toBe(0);
});

test("the Apple touch icon (/apple-icon) is the school's logo, green on a white square, 180 px", async ({ page }) => {
  const icon = await look(page, "/apple-icon");
  expect(icon.width).toBe(180);
  expect(icon.height).toBe(180);
  expect(icon.green).toBeGreaterThan(0.03);
  expect(icon.edgeWhite).toBe(true);
});

test("the old navy of the Apple touch icon is gone", async ({ page }) => {
  expect((await look(page, "/apple-icon")).navy).toBe(0);
});

test("the tab icon (/favicon.ico) is the school's logo, its largest picture 256 px, with no navy", async ({ page }) => {
  const icon = await look(page, "/favicon.ico");
  expect(icon.width).toBe(256);
  expect(icon.green).toBeGreaterThan(0.03);
  expect(icon.navy).toBe(0);
});

test("every icon the page's head names is a picture the server serves (a control: true before and after)", async ({ page }) => {
  await page.goto("/login");
  const hrefs = await page.evaluate(() =>
    [...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')].map((l) => (l as HTMLLinkElement).href),
  );
  expect(hrefs.length).toBeGreaterThanOrEqual(2);
  for (const href of hrefs) {
    const res = await page.request.get(href);
    expect(res.status(), href).toBe(200);
    expect(res.headers()["content-type"], href).toMatch(/^image\//);
  }
  const manifest = await (await page.request.get("/manifest.webmanifest")).json();
  expect(manifest.icons.map((i: { src: string }) => i.src)).toEqual(["/icon", "/apple-icon"]);
});
