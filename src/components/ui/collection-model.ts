// The pure rules of the list/grid kit (task 0089): which views and page sizes exist, how the remembered choice is read, which page numbers to draw, and which page a person is on after
// they change the view or the size. No React and no browser here, so every rule is tested without either (tests/unit/collection-model.spec.ts).

export type ViewMode = "list" | "grid";
export const VIEWS: readonly ViewMode[] = ["list", "grid"];

/// The page sizes offered in each view. 12 divides into 1, 2, 3, 4 and 6 columns, so the last row of a grid is rarely ragged. The server's cap on one page is 50 (lib/api/paged.ts).
export const SIZES: Record<ViewMode, readonly number[]> = { list: [10, 25, 50], grid: [12, 24, 48] };

/// What a list is shown as, and how many to a page, when the person has not chosen: the first size of the view, unless the list says otherwise (and the size is one that exists).
export function defaultSize(view: ViewMode, preferred?: number): number {
  return preferred !== undefined && SIZES[view].includes(preferred) ? preferred : SIZES[view][0];
}

export type ViewChoice = { view: ViewMode; size: number };

/// The remembered choice from its stored text. Anything that is not exactly what was written (a hand-edited value, an old format, a size that no longer exists) is the default, field by
/// field, so one bad field does not throw away the other.
export function parseChoice(raw: string | null, fallback: ViewMode, preferredSize?: number): ViewChoice {
  let view: ViewMode = fallback;
  let size = defaultSize(fallback, preferredSize);
  if (raw) {
    try {
      const value: unknown = JSON.parse(raw);
      if (value && typeof value === "object") {
        const v = (value as Record<string, unknown>).view;
        const s = (value as Record<string, unknown>).size;
        if (v === "list" || v === "grid") {
          view = v;
          size = defaultSize(view, view === fallback ? preferredSize : undefined);
        }
        if (typeof s === "number" && SIZES[view].includes(s)) size = s;
      }
    } catch {
      // not JSON: the default
    }
  }
  return { view, size };
}

export const storeChoice = (choice: ViewChoice): string => JSON.stringify({ view: choice.view, size: choice.size });

/// The size to use when the view changes: the same place in the other view's list of sizes (the second size of the list is the second size of the grid), so "more per page" stays "more per page".
export function sizeAfterViewChange(from: ViewMode, size: number, to: ViewMode): number {
  const at = SIZES[from].indexOf(size);
  return SIZES[to][at < 0 ? 0 : at];
}

/// The page that still shows the first item the person was looking at, after the page size changes (page 3 of 10 per page starts at item 21: with 12 to a page that is page 2).
export function pageAfterResize(page: number, oldSize: number, newSize: number): number {
  const first = (Math.max(1, page) - 1) * oldSize;
  return Math.floor(first / newSize) + 1;
}

/// "13 to 24 of 57" as numbers, for a page of a list of `total`. `from` is 0 when the list is empty.
export function pageRange(page: number, size: number, total: number): { from: number; to: number } {
  if (total <= 0) return { from: 0, to: 0 };
  const from = (Math.max(1, page) - 1) * size + 1;
  return { from: Math.min(from, total), to: Math.min(page * size, total) };
}

export type PageItem = number | "gap";

/// The page numbers to draw: the first, the last, the current page and one either side, with a gap where pages are left out. Up to seven pages are all shown.
export function pageList(page: number, pages: number): PageItem[] {
  if (pages <= 7) return Array.from({ length: Math.max(0, pages) }, (_, i) => i + 1);
  const keep = new Set([1, pages, page - 1, page, page + 1]);
  // Near an end, show a longer run so the strip keeps about the same width as the person moves.
  if (page <= 3) [2, 3, 4].forEach((n) => keep.add(n));
  if (page >= pages - 2) [pages - 1, pages - 2, pages - 3].forEach((n) => keep.add(n));
  const sorted = [...keep].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out: PageItem[] = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) out.push(n - sorted[i - 1] === 2 ? n - 1 : "gap");
    out.push(n);
  });
  return out;
}

/// One page of a list held in memory, with the page kept inside what exists (a filter that leaves fewer rows must not strand the reader on page 4 of 2).
export function paginate<T>(items: readonly T[], page: number, size: number): { rows: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const at = Math.min(Math.max(1, page), pages);
  return { rows: items.slice((at - 1) * size, at * size), page: at, pages };
}
