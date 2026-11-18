"use client";

import { useId } from "react";
import { ChevronDownIcon } from "./icons";

/// Which branch a page is showing, as one slim bar (the maintainer, 2026-11-18: the full-width "Branch" field took too much of the screen, and then asked for exactly this):
///   BRANCH: Primary (English)                                      [ Switch branch v ]
/// The name is bold on the left; the button is at the far end. The button is a real native <select> laid invisibly over a button-looking label, so the keyboard, typeahead and a phone's
/// own picker all work, and a screen reader hears "Switch branch" with the branch it is on. With one branch there is nothing to switch, so the bar is the name alone.
export function BranchPicker({
  branches,
  value,
  onChange,
  className = "",
}: {
  branches: readonly { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  const id = useId();
  const current = branches.find((b) => b.id === value) ?? branches[0];
  if (!current) return null;
  return (
    <div className={`flex min-h-11 items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-1.5 ${className}`}>
      <p className="min-w-0 text-sm">
        <span className="text-xs font-semibold tracking-wide text-fg-2 uppercase">Branch:</span>{" "}
        <strong data-testid="current-branch" className="font-bold wrap-break-word text-fg">
          {current.name}
        </strong>
      </p>
      {branches.length > 1 && (
        <div className="relative shrink-0 rounded-lg border border-line-strong bg-surface-2 transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring hover:border-ring">
          <span aria-hidden="true" className="flex min-h-9 items-center gap-1.5 px-3 text-sm font-semibold text-fg">
            Switch branch
            <ChevronDownIcon className="h-4 w-4 text-fg-muted" />
          </span>
          <select
            id={id}
            aria-label="Switch branch"
            value={current.id}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
