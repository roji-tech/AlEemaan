import "../support/env";
import { test, expect } from "@playwright/test";
import { HTTP_URL, PORTALS_PORT, PORTALS_URL } from "../support/env";
import { api } from "../support/http";

// Task 0104, against the real servers: the manifest each address is given, and the pictures it names. A portal is named in a request by X-Forwarded-Host (these servers trust it, as one
// behind a proxy does). PORTALS_URL has the portals on; HTTP_URL is the single-host school.
const host = (portal: string) => (portal === "apex" ? `localhost:${PORTALS_PORT}` : `${portal}.localhost:${PORTALS_PORT}`);
const at = (portal: string) => ({ baseUrl: PORTALS_URL, headers: { "x-forwarded-host": host(portal) } });

type Icon = { src: string; sizes: string; type: string; purpose?: string };
type Manifest = {
  id: string;
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  icons: Icon[];
  shortcuts?: unknown[];
};

/// A PNG's own width and height, read from its header (the signature, then the IHDR chunk), so a picture is measured by what it is and not by what the manifest says it is.
function pngSize(bytes: Buffer): { width: number; height: number } {
  expect(bytes.subarray(0, 8).toString("hex"), "a PNG signature").toBe("89504e470d0a1a0a");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

const EXPECTED = [
  ["apex", "/select-role", "AlEemaan School Management"],
  ["parent", "/portal", "AlEemaan Parents"],
  ["student", "/portal", "AlEemaan Students"],
  ["staff", "/dashboard", "AlEemaan Staff"],
  ["admin", "/dashboard", "AlEemaan Admin"],
] as const;

test.describe("each address is given its own manifest", () => {
  for (const [portal, start, name] of EXPECTED) {
    test(`${portal}: starts at ${start} as "${name}", and every icon it names is a PNG of exactly the size it declares`, async () => {
      const res = await api("/manifest.webmanifest", at(portal));
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toMatch(/manifest\+json|application\/json/);
      const manifest = res.json as Manifest;
      expect(manifest.start_url).toBe(start);
      expect(manifest.name).toBe(name);
      expect(manifest.scope).toBe("/");
      expect(manifest.id).toBe("/");
      expect(manifest.display).toBe("standalone");
      expect(manifest.icons.length).toBeGreaterThanOrEqual(3);
      for (const icon of manifest.icons) {
        const picture = await api(icon.src, at(portal));
        expect(picture.status, `${icon.src} on ${portal}`).toBe(200);
        expect(picture.headers.get("content-type"), icon.src).toBe("image/png");
        const [w, h] = icon.sizes.split("x").map(Number);
        expect(pngSize(picture.bytes), `${icon.src} is the size the manifest says`).toEqual({ width: w, height: h });
      }
    });
  }

  test("the answer follows the host of the request, not the server: the same server gives parent. and staff. different start pages", async () => {
    const [parent, staff] = await Promise.all([api("/manifest.webmanifest", at("parent")), api("/manifest.webmanifest", at("staff"))]);
    expect((parent.json as Manifest).start_url).not.toBe((staff.json as Manifest).start_url);
  });

  test("a school with no portals is one host: the dashboard, the staff shortcuts, the same three icons", async () => {
    const res = await api("/manifest.webmanifest", { baseUrl: HTTP_URL });
    const manifest = res.json as Manifest;
    expect(manifest.start_url).toBe("/dashboard");
    expect(manifest.name).toBe("AlEemaan School Management");
    expect((manifest.shortcuts ?? []).length).toBe(4);
    expect(manifest.icons.map((i) => `${i.sizes} ${i.purpose}`)).toEqual(["192x192 any", "512x512 any", "512x512 maskable"]);
  });

  test("pupils' and parents' apps are offered no staff shortcuts; the staff app is", async () => {
    for (const portal of ["parent", "student"])
      expect(((await api("/manifest.webmanifest", at(portal))).json as Manifest).shortcuts ?? []).toEqual([]);
    expect((((await api("/manifest.webmanifest", at("staff"))).json as Manifest).shortcuts ?? []).length).toBe(4);
  });
});

test.describe("the two icons drawn on request", () => {
  test("a name that is not one of the two is not found, and the answer says so in words", async () => {
    for (const path of [
      "/pwa-icons/other.png",
      "/pwa-icons/icon-512.png",
      "/pwa-icons/constructor",
      "/pwa-icons/__proto__",
      "/pwa-icons/%2e%2e%2fmanifest.webmanifest",
    ]) {
      // On a portal, which serves every path: the school's own host would redirect a name with no file ending before the route is reached (that is the proxy's rule, not this route's).
      const res = await api(path, at("staff"));
      expect([400, 404], path).toContain(res.status);
      expect(res.headers.get("content-type") ?? "", path).not.toMatch(/image/);
    }
  });

  test("they are cached for a day and no longer, not for ever (the logo may change; the address does not)", async () => {
    const res = await api("/pwa-icons/icon-192.png", at("apex"));
    expect(res.headers.get("cache-control")).toMatch(/max-age=86400/);
    expect(res.headers.get("cache-control")).not.toMatch(/immutable/);
  });

  test("the maskable one is white to its very edge and carries the logo inside the middle, so a launcher's crop never cuts it", async ({
    page,
  }) => {
    await page.goto(`${HTTP_URL}/login`);
    const look = await page.evaluate(async () => {
      const img = new Image();
      img.src = "/pwa-icons/icon-512-maskable.png";
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const px = (x: number, y: number) => [...ctx.getImageData(x, y, 1, 1).data];
      // Every pixel outside the central circle of 80 % of the side (what a launcher keeps) must be plain white: none of the logo is out there.
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const radius = canvas.width * 0.4;
      let outsideNotWhite = 0;
      let insideGreen = 0;
      for (let y = 0; y < canvas.height; y++)
        for (let x = 0; x < canvas.width; x++) {
          const i = (y * canvas.width + x) * 4;
          const white = data[i]! > 245 && data[i + 1]! > 245 && data[i + 2]! > 245 && data[i + 3]! > 245;
          const inside = Math.hypot(x - canvas.width / 2, y - canvas.height / 2) <= radius;
          if (!inside && !white) outsideNotWhite++;
          if (inside && data[i + 1]! > data[i]! + 25) insideGreen++;
        }
      return { corner: px(0, 0), edge: px(0, 256), outsideNotWhite, insideGreen };
    });
    expect(look.corner, "a corner is opaque white (no rounding)").toEqual([255, 255, 255, 255]);
    expect(look.edge).toEqual([255, 255, 255, 255]);
    expect(look.outsideNotWhite, "pixels outside the launcher's circle that are not white").toBe(0);
    expect(look.insideGreen, "the logo's green is inside it").toBeGreaterThan(2000);
  });
});
