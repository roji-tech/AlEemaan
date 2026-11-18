import { Button } from "./Button";

/// Previous / "Page 2 of 5" / Next under a list. Shown only when there is more than one page, so a short list has nothing extra on it.
export function Pager({ page, pages, onPage, label }: { page: number; pages: number; onPage: (page: number) => void; label: string }) {
  if (pages <= 1) return null;
  return (
    <nav aria-label={label} className="mt-4 flex items-center justify-between gap-3">
      <Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </Button>
      <p className="text-sm text-fg-muted">
        Page {page} of {pages}
      </p>
      <Button variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next
      </Button>
    </nav>
  );
}

/// The slice of a list that one page shows, with the page kept inside what exists (a filter that leaves fewer rows must not strand the reader on page 4 of 2).
export function paginate<T>(items: readonly T[], page: number, size: number): { rows: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const at = Math.min(Math.max(1, page), pages);
  return { rows: items.slice((at - 1) * size, at * size), page: at, pages };
}
