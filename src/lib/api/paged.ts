import type { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api/envelope";
import { offsetMeta, parseOffsetPagination, type OffsetMeta, type OffsetPage } from "@/lib/api/pagination";

// ONE shape for a list that comes back a page at a time, so every screen can page the same way (`components/ui/usePagedList.ts` reads it):
//
//   GET /api/v1/<things>?page=2&limit=20&<filters>
//   200 { "data": { "<things>": [ ... ] },
//         "meta": { "page": 2, "limit": 20, "total": 143, "pages": 8, "hasNext": true },
//         "error": null }
//   400 { "data": null, "error": { "code": "VALIDATION", "details": [ { "path": "query.page", "message": "page must be a whole number." } ] } }
//
// `page` starts at 1, `limit` has a default (25) and a ceiling (100) that a route may narrow; a repeated, empty, signed, decimal or out-of-range value is a 400 naming the field
// (never silently clamped: see `pagination.ts`). The rows sit under a key named for the thing (`members`, `invitations`), the paging facts always under `meta`. Use `readPage` first,
// then count and fetch with the page's `skip` and `take`, then answer with `pagedOk`. A list that is already in memory (filtered by a rule the database cannot express) uses `slicePage`.

type Options = { defaultLimit?: number; maxLimit?: number };

/// The page asked for, or the 400 to return as it is.
export function readPage(req: NextRequest, options: Options = {}): OffsetPage | Response {
  const page = parseOffsetPagination(req.nextUrl.searchParams, options);
  if (page.ok) return page;
  return fail(
    "Some of the query parameters are not valid.",
    400,
    "VALIDATION",
    page.issues.map((i) => ({ ...i, path: `query.${i.path}` })),
  );
}

/// The 200 answer: the rows of this page under `key`, and the paging facts under `meta`.
export function pagedOk<T, K extends string>(key: K, items: readonly T[], page: Pick<OffsetPage, "page" | "limit">, total: number) {
  return ok({ [key]: items } as Record<K, readonly T[]>, offsetMeta({ page: page.page, limit: page.limit, total }));
}

/// The rows of one page of a list that is already in memory, with the total to report.
export function slicePage<T>(all: readonly T[], page: Pick<OffsetPage, "skip" | "take">): { items: T[]; total: number } {
  return { items: all.slice(page.skip, page.skip + page.take), total: all.length };
}

export type { OffsetMeta, OffsetPage };
