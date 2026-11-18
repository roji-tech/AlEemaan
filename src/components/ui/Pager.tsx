"use client";

import { Button } from "./Button";
import { pageList, pageRange } from "./collection-model";

export { paginate } from "./collection-model";

/// The pager under a list (task 0089): "Showing 13 to 24 of 57", Previous / Next, the page numbers from `sm` up (the first, the last, the current page and its neighbours, with gaps),
/// "Page 2 of 5" on a phone, and an optional "Per page" choice. Draws nothing for a list that fits one page, unless a size choice is offered and the list is longer than its smallest size.
///   total + size   give the "Showing ..." line        sizes + onSize   give the "Per page" choice (see `useCollectionView`)
export function Pager({
  page,
  pages,
  onPage,
  label,
  total,
  size,
  sizes,
  onSize,
}: {
  page: number;
  pages: number;
  onPage: (page: number) => void;
  /// The accessible name of the navigation ("Pages of people").
  label: string;
  total?: number;
  size?: number;
  sizes?: readonly number[];
  onSize?: (size: number) => void;
}) {
  const offerSize = !!sizes && !!onSize && size !== undefined && total !== undefined && total > sizes[0];
  if (pages <= 1 && !offerSize) return null;
  const range = total !== undefined && size !== undefined ? pageRange(page, size, total) : null;
  return (
    <nav aria-label={label} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-fg-muted">
        {range && (
          <p aria-live="polite">
            Showing {range.from} to {range.to} of {total}
          </p>
        )}
        {offerSize && (
          <label className="flex items-center gap-2">
            Per page
            <select
              value={size}
              onChange={(e) => onSize?.(Number(e.target.value))}
              className="min-h-11 rounded-xl border border-line-strong bg-surface px-3 text-sm text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {sizes?.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-between gap-2 sm:justify-end">
          <Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            Previous
          </Button>
          <ol className="hidden items-center gap-1 sm:flex">
            {pageList(page, pages).map((item, i) =>
              item === "gap" ? (
                <li key={`gap-${i}`} aria-hidden="true" className="px-1 text-fg-muted">
                  …
                </li>
              ) : (
                <li key={item}>
                  <button
                    type="button"
                    onClick={() => onPage(item)}
                    aria-label={`Go to page ${item}`}
                    aria-current={item === page ? "page" : undefined}
                    className={`min-h-11 min-w-11 rounded-xl px-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                      item === page ? "bg-brand-strong text-white" : "text-fg-2 hover:bg-surface-2"
                    }`}
                  >
                    {item}
                  </button>
                </li>
              ),
            )}
          </ol>
          <span className="text-sm text-fg-muted sm:sr-only">
            Page {page} of {pages}
          </span>
          <Button variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>
            Next
          </Button>
        </div>
      )}
    </nav>
  );
}
