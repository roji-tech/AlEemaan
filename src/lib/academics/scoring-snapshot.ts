import crypto from "node:crypto";
import { fixed, toHundredths } from "@/lib/academics/scoring";

// Server only: the stored form of a scheme and its hash. It lives apart from scoring.ts because that file is also loaded by the browser (the school-wide template rules check a scheme and its bands there), and `node:crypto` must never reach a browser bundle - it drags in a Buffer polyfill whose feature probe the page's Content-Security-Policy reports.

export type SchemeSnapshot = { json: string; sha256: string };

/// The canonical, order-independent form of a scheme that a result will store (plan decision 14): totals and maximums as fixed two-decimal strings,
/// components in their `sortOrder` (then name), the keys in a fixed order — so the same scheme always gives the same bytes and the same hash, and a
/// later reader can prove a stored snapshot still matches. (The database row's ids and timestamps are NOT part of it.)
export function snapshotScheme(scheme: {
  totalMax: number;
  examMax: number;
  components: readonly { name: string; maxScore: number; sortOrder: number }[];
}): SchemeSnapshot {
  const components = [...scheme.components]
    .sort((x, y) => x.sortOrder - y.sortOrder || x.name.localeCompare(y.name))
    .map((component) => ({ name: component.name, maxScore: fixed(toHundredths(component.maxScore) ?? NaN) }));
  const json = JSON.stringify({
    totalMax: fixed(toHundredths(scheme.totalMax) ?? NaN),
    examMax: fixed(toHundredths(scheme.examMax) ?? NaN),
    components,
  });
  return { json, sha256: crypto.createHash("sha256").update(json).digest("hex") };
}
