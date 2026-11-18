"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getJson } from "@/components/auth/postJson";

/// The paging facts every paged list answers with (`meta`, see `lib/api/paged.ts`).
export type PagedMeta = { page: number; limit: number; total: number; pages: number; hasNext: boolean };

/// A list that comes from the server a page at a time. Give it the endpoint, the key its rows sit under and the filters as plain values; it asks for the page, ignores an answer that is
/// no longer wanted (a quicker click, a changed filter), goes back to page 1 when a filter changes, and offers `reload` for after a change. Pair it with `<Pager>`.
///
///   const list = usePagedList<Member>({ endpoint: "/api/v1/members", key: "members", filters: { q, role }, limit: 20 });
///   list.items === null  -> still loading the first page      list.error  -> a sentence to show
///   <Pager page={list.page} pages={list.meta?.pages ?? 1} onPage={list.setPage} label="Pages of people" />
export function usePagedList<T>({
  endpoint,
  key,
  filters = {},
  limit = 20,
  enabled = true,
}: {
  endpoint: string;
  key: string;
  filters?: Record<string, string | number | boolean | null | undefined>;
  limit?: number;
  enabled?: boolean;
}) {
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<T[] | null>(null);
  const [meta, setMeta] = useState<PagedMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState(0);

  // The filters as one string: a new object with the same values must not start a new request.
  const filterKey = JSON.stringify(Object.entries(filters).filter(([, v]) => v !== "" && v !== null && v !== undefined));
  const last = useRef(filterKey);
  const wanted = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    // A changed filter starts again from the first page (and does not ask twice).
    if (last.current !== filterKey) {
      last.current = filterKey;
      if (page !== 1) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- going back to page 1 when a filter changes is what this effect is for
        setPage(1);
        return;
      }
    }
    const controller = new AbortController();
    const ticket = ++wanted.current;
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    for (const [name, value] of JSON.parse(filterKey) as [string, string | number | boolean][]) params.set(name, String(value));
    setLoading(true);
    void getJson(`${endpoint}?${params}`, controller.signal).then((reply) => {
      if (controller.signal.aborted || ticket !== wanted.current) return;
      setLoading(false);
      if (!reply.ok) return setError(reply.message ?? "The list could not be loaded.");
      setError(null);
      const next = reply.meta as PagedMeta;
      // The last row of the last page was removed (decided, deleted): the page no longer exists, so show the one that does.
      if ((reply.data![key] as T[]).length === 0 && page > 1 && next.pages < page) return setPage(next.pages);
      setItems(reply.data![key] as T[]);
      setMeta(next);
    });
    return () => controller.abort();
  }, [endpoint, key, filterKey, limit, page, version, enabled]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { items, meta, page, setPage, error, loading, reload };
}
