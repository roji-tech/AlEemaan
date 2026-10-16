"use client";

import { useState } from "react";
import { CopyIcon } from "@/components/ui/icons";

const STORAGE_KEY = "aleemaan_quick_notes";

export function QuickNotesTool() {
  const [notes, setNotes] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try {
      return localStorage.getItem(STORAGE_KEY) || "";
    } catch {
      return "";
    }
  });

  const [copied, setCopied] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    setNotes(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage unavailable
    }
  };

  const handleCopy = async () => {
    if (!notes.trim()) return;
    try {
      await navigator.clipboard.writeText(notes);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard fallback
    }
  };

  const handleClear = () => {
    setNotes("");
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore
    }
  };

  return (
    <div className="flex flex-col space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-fg-muted uppercase tracking-wider">
          Auto-saved Notes
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 rounded-lg bg-surface-2 px-2.5 py-1 text-xs font-semibold text-fg hover:bg-line transition-colors"
          >
            <CopyIcon className="h-3 w-3" />
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="rounded-lg bg-surface-2 px-2.5 py-1 text-xs font-semibold text-fg-muted hover:bg-rose-500/10 hover:text-rose-600 transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      <textarea
        value={notes}
        onChange={handleChange}
        placeholder="Jot down quick parent numbers, student admission IDs, or reminders..."
        className="h-64 w-full resize-none rounded-2xl border border-line bg-surface p-4 text-xs leading-relaxed text-fg placeholder:text-fg-muted focus:border-brand-strong focus:outline-none"
      />

      <div className="flex items-center justify-between text-[11px] text-fg-muted">
        <span>Stored locally on this device</span>
        <span>{notes.length} characters</span>
      </div>
    </div>
  );
}
