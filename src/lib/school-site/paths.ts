// The school's own website (task 0080): its pages, written in React under `src/app/(marketing)/(site)`, and the one host it embeds. They run under the application's own page policy; the only addition is the map's frame on `/contact`.

/// The pages of the school website. Used by the tests and the sitemap-like checks.
export const SCHOOL_SITE_PAGES = [
  "/",
  "/about",
  "/our-academics",
  "/admissions",
  "/contact",
  "/anthem",
  "/oldstudents",
  "/subjects",
  "/vacancy",
] as const;

/// The folder of the site's pictures and recordings, served from `public/`.
export const SCHOOL_SITE_ASSET_PREFIX = "/school-site/";

/// The hosts the school website's map frame may load from, on `/contact` only (src/proxy.ts): the embed address, which Google redirects to its main host.
export const SCHOOL_MAP_ORIGINS = ["https://maps.google.com", "https://www.google.com"] as const;

/// The address the map frame starts from.
export const SCHOOL_MAP_ORIGIN = SCHOOL_MAP_ORIGINS[0];
