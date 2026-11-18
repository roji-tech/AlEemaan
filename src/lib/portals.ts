// Type only: this module is also read by the proxy, which must not pull the database client in.
import type { Role } from "@prisma/client";

// Sign-in portals on subdomains (task 0086, switch added 2026-11-18). The school's own domain is never written in the code: a portal is a subdomain label (`admin`, `staff`, `student`,
// `parent` by default, each renamed by `ADMIN_SUBDOMAIN` and so on), and the school's domain is whatever is left of the request's host once that label comes off (`staff.example.school`
// is the `staff` portal of `example.school`). The whole feature is one switch, `PORTALS_ENABLED`, ON unless it says false: switched OFF, every host behaves as one school host with the one
// sign-in form (development, tests, a preview URL that has no subdomains). Switched ON, the school's own host serves only the landing pages (and the few open pages in `APEX_OPEN`);
// signing in is on the portals. Pure, so every rule here is tested without a server.

export const PORTALS = ["admin", "staff", "student", "parent"] as const;
export type Portal = (typeof PORTALS)[number];

const ENV: Record<Portal, string> = {
  admin: "ADMIN_SUBDOMAIN",
  staff: "STAFF_SUBDOMAIN",
  student: "STUDENT_SUBDOMAIN",
  parent: "PARENT_SUBDOMAIN",
};
/// The label each portal has when its variable is not set.
export const DEFAULT_LABELS: Record<Portal, string> = { admin: "admin", staff: "staff", student: "student", parent: "parent" };
/// The values of `PORTALS_ENABLED` that switch the portals off. Anything else, or nothing, leaves them on.
const OFF_WORDS = new Set(["false", "0", "off", "no"]);
const ON_WORDS = new Set(["true", "1", "on", "yes"]);
/// One DNS label: letters, digits and inner hyphens, at most 63 characters.
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export type PortalConfig = Partial<Record<Portal, string>>;

/// The portals that are switched on and their subdomain labels, from the environment. `PORTALS_ENABLED` is the switch: ON when it is missing, empty, or true/1/on/yes; OFF when it is
/// false/0/off/no; any other value leaves it ON and is said once in `problems` (a typo must not turn a protection off). Switched on, a portal's label is its variable's value or the
/// default; a value that is not a DNS label, or that another portal already uses, is left out and said once in `problems` (the caller logs it): that portal is then simply not recognised.
export function readPortalConfig(env: Record<string, string | undefined> = process.env): { config: PortalConfig; problems: string[] } {
  const config: PortalConfig = {};
  const problems: string[] = [];
  const word = env.PORTALS_ENABLED?.trim().toLowerCase() ?? "";
  if (OFF_WORDS.has(word)) return { config, problems };
  if (word !== "" && !ON_WORDS.has(word))
    problems.push(`PORTALS_ENABLED is "${word}", which is neither true nor false; the portals stay on.`);
  const used = new Map<string, Portal>();
  for (const portal of PORTALS) {
    const raw = env[ENV[portal]]?.trim().toLowerCase() || DEFAULT_LABELS[portal];
    if (!LABEL.test(raw)) {
      problems.push(`${ENV[portal]} is "${raw}", which is not a single subdomain label (letters, digits and hyphens); that portal is off.`);
      continue;
    }
    const taken = used.get(raw);
    if (taken) {
      problems.push(`${ENV[portal]} and ${ENV[taken]} are both "${raw}"; ${ENV[portal]} is ignored.`);
      continue;
    }
    used.set(raw, portal);
    config[portal] = raw;
  }
  return { config, problems };
}

export const portalsOn = (config: PortalConfig): boolean => Object.keys(config).length > 0;

export type HostInfo =
  /// No portal is configured.
  | { kind: "off" }
  /// The school's public host: the landing pages live here (also `www`, a preview URL, `localhost`).
  | { kind: "apex"; root: string }
  /// A sign-in portal; `root` is the school's domain.
  | { kind: "portal"; portal: Portal; root: string };

/// `Host` header → host name without the port and in lower case ("" for something that is not a host).
function hostName(hostHeader: string): string {
  const host = hostHeader.trim().toLowerCase();
  if (host.startsWith("[")) return host.slice(0, host.indexOf("]") + 1); // an IPv6 literal keeps its brackets
  return host.replace(/:\d+$/, "");
}
const portOf = (hostHeader: string): string => /:(\d+)$/.exec(hostHeader.trim())?.[0] ?? "";

export function classifyHost(hostHeader: string, config: PortalConfig): HostInfo {
  if (!portalsOn(config)) return { kind: "off" };
  const host = hostName(hostHeader);
  const dot = host.indexOf(".");
  if (dot > 0) {
    const label = host.slice(0, dot);
    const portal = PORTALS.find((p) => config[p] === label);
    if (portal) return { kind: "portal", portal, root: host.slice(dot + 1) };
  }
  return { kind: "apex", root: host.startsWith("www.") ? host.slice(4) : host };
}

/// Where the landing pages are: the school's domain itself, on the same scheme and port as the request.
export function apexOrigin(info: Exclude<HostInfo, { kind: "off" }>, hostHeader: string, protocol: string): string {
  return `${protocol}//${info.root}${portOf(hostHeader)}`;
}

/// Where a portal's sign-in is, from any host of the school (null when that portal is off or the host is not recognised).
export function portalOrigin(portal: Portal, info: HostInfo, config: PortalConfig, hostHeader: string, protocol: string): string | null {
  const label = config[portal];
  if (!label || info.kind === "off") return null;
  return `${protocol}//${label}.${info.root}${portOf(hostHeader)}`;
}

/// A portal's address from the environment's own address (`APP_URL`, the school's host): the same scheme and port, the portal's label in front of the domain (a leading `www.` is dropped).
/// Null when that portal is off or the address is not one. For links in e-mail, which are built where no request is at hand.
export function portalBaseFromAppUrl(portal: Portal, appUrl: string, config: PortalConfig): string | null {
  const label = config[portal];
  if (!label) return null;
  try {
    const url = new URL(appUrl);
    return `${url.protocol}//${label}.${url.hostname.replace(/^www\./, "")}${url.port ? `:${url.port}` : ""}`;
  } catch {
    return null;
  }
}

/// The pages of the school's public website: served on the apex only; a portal sends the visitor to the same path there.
const LANDING = new Set([
  "/",
  "/ar",
  "/about",
  "/admissions",
  "/anthem",
  "/contact",
  "/oldstudents",
  "/our-academics",
  "/subjects",
  "/vacancy",
  "/product",
  "/select-role", // where the website sends someone who wants to sign in: a button for each portal
]);
export const isLandingPath = (pathname: string): boolean => LANDING.has(pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname);

/// Pages that are not the website's landing pages but stay open on the school's own host while the portals are on: the result portal and the codes it hands out (`/q`, `/verify`), the
/// links that arrive by e-mail or print (a person who was invited before the portals were switched on has an address on this host), first-run setup and the install files.
const APEX_OPEN = [
  "/portal",
  "/verify",
  "/q",
  "/offline",
  "/icon",
  "/apple-icon",
  "/pwa-icons", // the two app icons the manifest names (task 0104)
  "/setup",
  "/forgot-password",
  "/reset-password",
  "/accept-invite",
  "/confirm-email",
];
/// With the portals on, may the school's own host serve this path? The landing pages, the open pages above and any file (`robots.txt`, an image, the manifest). Everything else, the
/// sign-in form (`/login`) and the whole application, is for the portals: the proxy sends the visitor to `/select-role`.
export function apexServes(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (isLandingPath(path)) return true;
  if (APEX_OPEN.some((open) => path === open || path.startsWith(`${open}/`))) return true;
  return /\.[A-Za-z0-9]+$/.test(path.slice(path.lastIndexOf("/") + 1));
}

/// Who a portal admits. A person who holds several roles may use every portal that fits one of them. The portal only decides where someone may SIGN IN; what they see after that is
/// still decided by their roles, as before.
const ROLES: Record<Exclude<Portal, "admin">, readonly Role[]> = {
  staff: ["TEACHING_STAFF", "NON_TEACHING_STAFF"],
  student: ["STUDENT"],
  parent: ["PARENT"],
};
export function portalAdmits(portal: Portal, person: { isSuperAdmin: boolean; roles: readonly Role[] }): boolean {
  if (portal === "admin") return person.isSuperAdmin || person.roles.includes("ADMIN");
  return person.roles.some((role) => ROLES[portal].includes(role));
}

/// The portal a person is sent to by an e-mailed link: the first that admits them, administrators first.
export function portalFor(person: { isSuperAdmin: boolean; roles: readonly Role[] }): Portal | null {
  return PORTALS.find((portal) => portalAdmits(portal, person)) ?? null;
}

/// What each portal's sign-in page says about itself. Taken from the host, never from the form, so nobody picks a role.
export const PORTAL_COPY: Record<Portal, { title: string; line: string }> = {
  admin: { title: "Administrator sign-in", line: "For the school's administrators." },
  staff: { title: "Staff sign-in", line: "For teachers and the school's other staff." },
  student: { title: "Student sign-in", line: "For students." },
  parent: { title: "Parent sign-in", line: "For parents and guardians." },
};
