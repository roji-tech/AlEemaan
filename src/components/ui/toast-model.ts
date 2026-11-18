// The pure rules of the toaster (task 0096): how long a toast stays, how many are shown, and what happens to a repeat. No React and no browser, so they are tested without either.

export type ToastVariant = "success" | "error" | "warning" | "info";
export type Toast = { id: number; variant: ToastVariant; text: string; title?: string };

/// At most this many toasts are on screen; a fifth pushes the oldest out.
export const MAX_TOASTS = 4;

/// How long a toast stays before it goes by itself (milliseconds). Longer for what a person must act on or may need to read twice: an error stays longest. Hovering or focusing a toast
/// holds it, and a toast can always be closed.
export const lifetimeMs = (variant: ToastVariant): number => ({ success: 5_000, info: 6_000, warning: 9_000, error: 12_000 })[variant];

/// Adds a toast. The same message (variant and text) already showing is not stacked a second time: the old one goes and the new one takes its place, so it is on screen for a fresh
/// lifetime and a screen reader hears it again. More than `max` and the oldest go.
export function addToast(list: readonly Toast[], next: Toast, max: number = MAX_TOASTS): Toast[] {
  const kept = list.filter((t) => !(t.variant === next.variant && t.text === next.text && t.title === next.title));
  const all = [...kept, next];
  return all.length > max ? all.slice(all.length - max) : all;
}

/// A toast's role for assistive technology: what went wrong interrupts (`alert`), what went right waits its turn (`status`).
export const roleOf = (variant: ToastVariant): "alert" | "status" => (variant === "error" || variant === "warning" ? "alert" : "status");
