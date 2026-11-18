import type { MetadataRoute } from "next";
import { brand } from "@/lib/brand";
import type { HostInfo, Portal } from "@/lib/portals";

// The web app manifest each address earns (task 0104). One file for the whole school was wrong for the portals: an app installed from `parent.` opened a staff page. The manifest is now chosen
// by the host the request came for (`HostInfo`, the proxy's own classification), and is a pure function of it, so every address's answer is tested without a server.

export type AppManifest = MetadataRoute.Manifest;

/// The icons Chrome asks for before it offers to install: one of at least 192 px and one of at least 512 px, and a "maskable" picture drawn for the launcher's own crop. `/icon` is the 512 px
/// rounded square of the app (src/app/icon.tsx); the other two are drawn by src/app/pwa-icons/[file]/route.tsx. Every size here is the picture's real size (a test decodes each one).
export const MANIFEST_ICONS: NonNullable<AppManifest["icons"]> = [
  { src: "/pwa-icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
  { src: "/pwa-icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
];

/// What is offered from the installed app's icon (long-press on Android). They are the staff tools, so only the staff addresses carry them.
const STAFF_SHORTCUTS: NonNullable<AppManifest["shortcuts"]> = [
  {
    name: "School Calculator",
    short_name: "Calculator",
    description: "Fee discount and grade calculations",
    url: "/students?tool=calculator",
  },
  {
    name: "Student Lookup",
    short_name: "Lookup",
    description: "Quick student profile and attendance lookup",
    url: "/students?tool=lookup",
  },
  {
    name: "Take Attendance",
    short_name: "Attendance",
    description: "Mark class roll-call attendance",
    url: "/attendance",
  },
  {
    name: "Quick Notes",
    short_name: "Notes",
    description: "Temporary memos and scratchpad",
    url: "/students?tool=scratchpad",
  },
];

type Who = { name: string; short: string; start: string; shortcuts: boolean };

/// Who each portal is for, and where its installed app opens. Pupils and parents open `/portal` (their workspace; it asks a signed-out visitor to sign in).
const PORTAL: Record<Portal, Who> = {
  parent: { name: `${brand.name} Parents`, short: "Parents", start: "/portal", shortcuts: false },
  student: { name: `${brand.name} Students`, short: "Students", start: "/portal", shortcuts: false },
  staff: { name: `${brand.name} Staff`, short: "Staff", start: "/dashboard", shortcuts: true },
  admin: { name: `${brand.name} Admin`, short: "Admin", start: "/dashboard", shortcuts: true },
};

const SCHOOL: Who = { name: `${brand.name} School Management`, short: brand.name, start: "/dashboard", shortcuts: true };
/// The school's own host while the portals are on: the website lives here and signing in is on the portals, so the installed app opens the page that sends a person to theirs.
const SCHOOL_HOST: Who = { ...SCHOOL, start: "/select-role", shortcuts: false };

export function manifestFor(info: HostInfo): AppManifest {
  const who = info.kind === "portal" ? PORTAL[info.portal] : info.kind === "apex" ? SCHOOL_HOST : SCHOOL;
  return {
    // `id` names the app for the browser; it never changes, so moving the start page later does not make a second app. An address is its own origin, so one value serves all.
    id: "/",
    name: who.name,
    short_name: who.short,
    description: brand.description,
    start_url: who.start,
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0f172a",
    orientation: "any",
    categories: ["education", "productivity"],
    icons: MANIFEST_ICONS,
    ...(who.shortcuts ? { shortcuts: STAFF_SHORTCUTS } : {}),
  };
}
