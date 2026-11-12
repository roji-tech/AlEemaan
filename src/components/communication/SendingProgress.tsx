"use client";

import type { PumpState } from "./useQueuePump";

// The line above the Communication tabs while messages are being sent in the background (task 0063): how far it got, that the page may be left, and, when it stops, why and what to do.

export function SendingProgress({ state, onRetry, onDismiss }: { state: PumpState; onRetry: () => void; onDismiss: () => void }) {
  if (state.phase === "idle") return null;

  if (state.phase === "sending") {
    return (
      <div role="status" aria-live="polite" className="rounded-xl border border-line bg-surface p-4 text-sm text-fg">
        <p className="font-semibold">
          Sending messages: {state.done} of {state.total}
          {state.failed > 0 ? ` · ${state.failed} failed` : ""}
        </p>
        <progress
          aria-label="Messages sent"
          value={state.done}
          max={Math.max(state.total, 1)}
          className="mt-2 h-2 w-full accent-brand-strong"
        />
        <p className="mt-2 text-xs text-fg-muted">
          You can use the other tabs. Keep this page open until it finishes; if it is closed, sending carries on the next time Communication
          is opened.
        </p>
      </div>
    );
  }

  if (state.phase === "paused") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn-line bg-warn-bg p-4 text-sm text-warn-fg"
      >
        <p>
          {state.reason === "elsewhere"
            ? `Sending is paused at ${state.done} of ${state.total}: another screen is sending the rest. Nothing is lost; choose Try again to check on it.`
            : `Sending is paused at ${state.done} of ${state.total}: the server could not be reached. Nothing is lost; the rest are still waiting.`}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="min-h-11 rounded-lg border border-warn-line px-4 py-2 text-sm font-semibold hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  const bad = state.failed > 0;
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 text-sm ${
        bad ? "border-danger-line bg-danger-bg text-danger-fg" : "border-ok-line bg-ok-bg text-ok-fg"
      }`}
    >
      <p>
        {bad
          ? `All ${state.total} messages were handled: ${state.sent} sent, ${state.failed} failed.${state.firstError ? ` ${state.firstError}` : ""} Details are in Message Logs & Dispatches.`
          : `All ${state.total} messages were sent.`}
      </p>
      <button
        type="button"
        onClick={onDismiss}
        className="min-h-11 rounded-lg border border-current px-4 py-2 text-sm font-semibold hover:underline"
      >
        Dismiss
      </button>
    </div>
  );
}
