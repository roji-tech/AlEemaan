"use client";

import { useId, useState, type ReactNode } from "react";
import { Button } from "./Button";
import { SlidersIcon } from "./icons";
import { TextField } from "./TextField";

/// The toolbar of a list: a search box with a "Filters" button beside it. The button opens a panel of the list's filters and closes it again (the filters stay as they were set: only
/// the panel is hidden), and says how many are set. One toolbar for every list, so a phone shows a search line, not a stack of four selects. Presentation only: the owner holds the
/// values and does the filtering (on the server or in the browser).
export function ListToolbar({
  searchLabel = "Search",
  searchValue,
  onSearch,
  searchPlaceholder,
  searchMaxLength = 64,
  activeCount,
  onClear,
  trailing,
  children,
}: {
  searchLabel?: string;
  searchValue: string;
  onSearch: (value: string) => void;
  searchPlaceholder?: string;
  searchMaxLength?: number;
  /// How many filters differ from their default (the search text is not counted: it is visible).
  activeCount: number;
  /// Puts every filter and the search back to their defaults.
  onClear: () => void;
  /// Sits at the end of the toolbar (the List / Grid toggle, a count, an export); on a phone the search takes the first line and this shares the second with Filters.
  trailing?: ReactNode;
  /// The filter controls (SelectFields).
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
          <TextField
            label={searchLabel}
            hideLabel
            type="search"
            value={searchValue}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={searchPlaceholder ?? searchLabel}
            autoComplete="off"
            maxLength={searchMaxLength}
          />
        </div>
        <Button variant="secondary" aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={() => setOpen((v) => !v)}>
          <SlidersIcon className="h-4 w-4" />
          Filters
          {activeCount > 0 && (
            <span
              className="min-w-5 rounded-full bg-brand-strong px-1.5 text-center text-xs font-semibold text-white"
              aria-label={`${activeCount} set`}
            >
              {activeCount}
            </span>
          )}
        </Button>
        {trailing && <div className="ml-auto flex items-end gap-2">{trailing}</div>}
      </div>
      {open && (
        <div
          id={panelId}
          role="group"
          aria-label="Filters"
          className="animate-[filters-in_160ms_ease-out] space-y-3 rounded-2xl border border-line bg-surface-2/60 p-3 sm:p-4"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
          {(activeCount > 0 || searchValue !== "") && (
            <Button variant="ghost" onClick={onClear}>
              Clear filters
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
