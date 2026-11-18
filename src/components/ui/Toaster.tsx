"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangleIcon, CheckCircleIcon, InfoIcon, XIcon } from "./icons";
import { addToast, lifetimeMs, roleOf, type Toast, type ToastVariant } from "./toast-model";

// Toasts (task 0096). The maintainer, 2026-11-18: "instead of putting the error and success messages on the top, we use something like Sonner toast". What a person just did, and how it
// went, appears in the corner for a few seconds and goes by itself, instead of a banner that pushes the whole page down and is gone from sight if they have scrolled.
//
// Written here, not taken from a package: the app's content-security policy refuses inline styles and a toast library injects its own style element; this uses classes only, keeps the
// words a screen reader hears under our control, and adds nothing to the bundle. A toast is announced when it appears (`alert` for what went wrong, `status` for what went right), holds
// while the pointer or the keyboard is on it, can always be closed, and its entrance is a short fade that the reduced-motion setting removes.

type Notify = (toast: { variant: ToastVariant; text: string; title?: string }) => void;
const Context = createContext<{ notify: Notify; dismiss: (id: number) => void } | null>(null);

export function useToast(): { notify: Notify; dismiss: (id: number) => void } {
  const api = useContext(Context);
  if (!api) throw new Error("useToast needs a <ToastProvider> around the app");
  return api;
}

/// A drop-in for `const [notice, setNotice] = useState<Notice>(null)` (task 0096): with a toaster mounted, `setNotice({ variant, text })` shows a toast and `notice` stays null, so the
/// banner a screen used to draw from it never appears; with none (a page outside the app), it is the plain state it replaced and the banner shows as before. `setNotice(null)` clears nothing
/// in the toaster: a toast goes by itself.
export type Notice = { variant: "success" | "error"; text: string } | null;
export function useNotice(): [Notice, (notice: Notice) => void] {
  const api = useContext(Context);
  const [local, setLocal] = useState<Notice>(null);
  const notify = api?.notify;
  const show = useCallback(
    (notice: Notice) => {
      if (notice) notify?.({ variant: notice.variant, text: notice.text });
    },
    [notify],
  );
  return notify ? [null, show] : [local, setLocal];
}

const STYLE: Record<ToastVariant, { box: string; icon: string; Icon: typeof InfoIcon }> = {
  success: { box: "border-ok-line", icon: "text-ok-icon", Icon: CheckCircleIcon },
  error: { box: "border-danger-line", icon: "text-danger-icon", Icon: AlertTriangleIcon },
  warning: { box: "border-warn-line", icon: "text-warn-icon", Icon: AlertTriangleIcon },
  info: { box: "border-info-line", icon: "text-info-icon", Icon: InfoIcon },
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const [held, setHeld] = useState(false);
  // The clock runs only while the toast is not held; letting go starts a fresh lifetime.
  useEffect(() => {
    if (held) return;
    const timer = setTimeout(() => onDismiss(toast.id), lifetimeMs(toast.variant));
    return () => clearTimeout(timer);
  }, [held, toast.id, toast.variant, onDismiss]);
  const { box, icon, Icon } = STYLE[toast.variant];
  return (
    <div
      role={roleOf(toast.variant)}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
      className={`pointer-events-auto flex w-full items-start gap-3 rounded-2xl border bg-surface p-4 text-sm text-fg shadow-menu motion-safe:animate-[toast-in_180ms_ease-out] sm:w-96 ${box}`}
    >
      <Icon aria-hidden="true" className={`mt-0.5 h-5 w-5 shrink-0 ${icon}`} />
      <div className="min-w-0 flex-1">
        {toast.title && <p className="font-semibold wrap-break-word">{toast.title}</p>}
        <p className="wrap-break-word">{toast.text}</p>
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss this message"
        className="-mt-2 -mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-fg-2 hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <XIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);
  const notify = useCallback<Notify>((toast) => setToasts((all) => addToast(all, { id: nextId.current++, ...toast })), []);
  const api = useMemo(() => ({ notify, dismiss }), [notify, dismiss]);
  return (
    <Context.Provider value={api}>
      {children}
      {/* Top right, under the header: the background-save panel is bottom right, so the two never cover each other. */}
      <div
        aria-label="Notifications"
        role="region"
        className="pointer-events-none fixed inset-x-4 top-16 z-50 flex flex-col items-end gap-2 sm:inset-x-auto sm:right-4"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </Context.Provider>
  );
}
