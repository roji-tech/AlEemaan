import { test, expect } from "@playwright/test";
import { PORTALS, type HostInfo } from "@/lib/portals";
import { MANIFEST_ICONS, manifestFor } from "@/lib/pwa/manifest";
import { installStateOf, isAppleTouch } from "@/lib/pwa/install";

// Task 0104: what each address's web app manifest says, and the rules of the Install button. Pure, so no server is needed; the real server's answers are in tests/api/pwa-manifest.spec.ts.

const hosts: [string, HostInfo][] = [
  ["parent.", { kind: "portal", portal: "parent", root: "school.test" }],
  ["student.", { kind: "portal", portal: "student", root: "school.test" }],
  ["staff.", { kind: "portal", portal: "staff", root: "school.test" }],
  ["admin.", { kind: "portal", portal: "admin", root: "school.test" }],
  ["the school's own host, portals on", { kind: "apex", root: "school.test" }],
  ["any host, portals off", { kind: "off" }],
];

const sizeOf = (sizes: string | undefined) => Number((sizes ?? "0x0").split("x")[0]);

test.describe("the manifest of every address", () => {
  for (const [label, info] of hosts) {
    test(`${label} is installable by Chrome's rules, stays inside its own origin and never changes its id`, () => {
      const m = manifestFor(info);
      expect(m.display).toBe("standalone");
      expect(m.id).toBe("/");
      expect(m.scope).toBe("/");
      // The start page is inside the scope and is a path of this site, not another address.
      expect(m.start_url).toMatch(/^\/[a-z-]+$/);
      expect(m.start_url!.startsWith(m.scope!)).toBe(true);
      // Chrome offers "Install" only with an icon of at least 192 px and one of at least 512 px; one must be drawn for a launcher's crop ("maskable") and none may be both.
      const icons = m.icons ?? [];
      expect(icons.some((i) => sizeOf(i.sizes) >= 192 && i.purpose !== "maskable")).toBe(true);
      expect(icons.some((i) => sizeOf(i.sizes) >= 512 && i.purpose !== "maskable")).toBe(true);
      expect(icons.filter((i) => i.purpose === "maskable")).toHaveLength(1);
      expect(icons.every((i) => i.type === "image/png")).toBe(true);
      expect(m.name!.length).toBeGreaterThan(m.short_name!.length - 1);
    });
  }

  test("pupils and parents open their workspace, staff and administrators the dashboard, the school's own host the way to sign in", () => {
    const start = (portal: (typeof PORTALS)[number]) => manifestFor({ kind: "portal", portal, root: "school.test" }).start_url;
    expect(start("parent")).toBe("/portal");
    expect(start("student")).toBe("/portal");
    expect(start("staff")).toBe("/dashboard");
    expect(start("admin")).toBe("/dashboard");
    expect(manifestFor({ kind: "apex", root: "school.test" }).start_url).toBe("/select-role");
    expect(manifestFor({ kind: "off" }).start_url).toBe("/dashboard");
  });

  test("every portal is named for its people, so two installed apps on one phone are told apart", () => {
    const names = PORTALS.map((portal) => manifestFor({ kind: "portal", portal, root: "school.test" }).short_name);
    expect(new Set(names).size).toBe(PORTALS.length);
    expect(names).toEqual(["Admin", "Staff", "Students", "Parents"]);
  });

  test("the staff tools are offered from the staff and administrator apps and the single-host school, never to pupils, parents or the website", () => {
    const has = (info: HostInfo) => (manifestFor(info).shortcuts ?? []).length > 0;
    expect(has({ kind: "portal", portal: "staff", root: "school.test" })).toBe(true);
    expect(has({ kind: "portal", portal: "admin", root: "school.test" })).toBe(true);
    expect(has({ kind: "off" })).toBe(true);
    expect(has({ kind: "portal", portal: "parent", root: "school.test" })).toBe(false);
    expect(has({ kind: "portal", portal: "student", root: "school.test" })).toBe(false);
    expect(has({ kind: "apex", root: "school.test" })).toBe(false);
  });

  test("the icon list is the one the pictures are drawn for", () => {
    expect(MANIFEST_ICONS.map((i) => `${i.sizes} ${i.purpose} ${i.src}`)).toEqual([
      "192x192 any /pwa-icons/icon-192.png",
      "512x512 any /icon",
      "512x512 maskable /pwa-icons/icon-512-maskable.png",
    ]);
  });
});

test.describe("the Install button's rules", () => {
  const base = { running: false, installed: false, hasPrompt: false, apple: false };

  test("an app that is installed or running installed is offered nothing", () => {
    expect(installStateOf({ ...base, running: true, hasPrompt: true, apple: true })).toBe("installed");
    expect(installStateOf({ ...base, installed: true, hasPrompt: true })).toBe("installed");
  });

  test("a saved browser prompt makes the button; an Apple device with none is told where Share is; anything else gets nothing", () => {
    expect(installStateOf({ ...base, hasPrompt: true })).toBe("ready");
    expect(installStateOf({ ...base, apple: true })).toBe("apple");
    expect(installStateOf(base)).toBe("none");
  });

  test("an iPhone, an iPod, an iPad and an iPad that says it is a Mac are Apple touch devices; a Mac and an Android phone are not", () => {
    const iphone =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
    const ipadAsMac =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
    const android = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
    expect(isAppleTouch(iphone, "iPhone", 5)).toBe(true);
    expect(isAppleTouch("Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X)", "iPad", 5)).toBe(true);
    expect(isAppleTouch(ipadAsMac, "MacIntel", 5)).toBe(true); // an iPad: a Mac in its user agent, a touch screen in fact
    expect(isAppleTouch(ipadAsMac, "MacIntel", 0)).toBe(false); // a real Mac
    expect(isAppleTouch(android, "Linux armv81", 5)).toBe(false);
  });
});
