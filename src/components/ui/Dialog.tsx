"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { splitTitle } from "./dialog-title";
import { XIcon } from "./icons";

/// The title's words: an action and the name it acts on ("Edit Aluko Fuad") are told apart by colour and weight; anything else is plain text. Same text either way (`dialog-title.ts`).
function TitleText({ text }: { text: string }) {
  const parts = splitTitle(text);
  if (!parts) return <>{text}</>;
  return (
    <>
      <span className="font-medium text-fg-muted">{parts.action}</span> <span className="font-bold text-brand-fg">{parts.name}</span>
      {parts.tail}
    </>
  );
}

/// A modal dialog on the native <dialog>: the platform supplies the focus trap, Escape, the inert page behind it, and — on close — focus
/// back on the control that opened it (initial focus: see the effect below). `open` is the one source of truth; Escape is reported through `onClose` so the owner's state follows.
/// A click outside closes it ONLY when it holds nothing to type into (a details view, a history, a confirmation: no input, select or text area; task 0117, the maintainer, 2026-11-20,
/// "add a useoutsideclick or similar to most popups"); a dialog with a form does not, so a stray tap never throws away what someone typed. Both the press and the release must be on the
/// backdrop, so selecting text and letting go outside does not close it.
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  wide = false,
  extraWide = false,
  confirmClose = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /// A roomier panel for a form with a table of rows in it (assessment components, grade bands).
  wide?: boolean;
  /// The roomiest panel, for a table of many columns (the bulk review): 64 rem, still never wider than the screen less a margin.
  extraWide?: boolean;
  /// For a dialog that may hold work not yet saved: Escape does NOT close the platform dialog by itself; it is reported through `onClose` and the owner decides (ask first, or set `open` to false).
  confirmClose?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const pressedOnBackdrop = useRef(false);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // `autoFocus` does not fire in a dialog that opens after it mounted, and the platform's default is the first focusable thing — the
      // Close button. Focus the control the content marked (`data-initial-focus`, e.g. Cancel on a destructive confirmation) or else its
      // first form field, so a keyboard or screen-reader user lands where they will type.
      const target =
        dialog.querySelector<HTMLElement>("[data-initial-focus]") ??
        dialog.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea");
      target?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      // React passes a nested dialog's `close` up to this one, so a dialog opened inside another would close its parent too: only this dialog's own close counts.
      onCancel={
        confirmClose
          ? (event) => {
              // Only this dialog's own cancel (Escape). A file input inside it fires a bubbling `cancel` of its own when the person closes the file picker without choosing, which used to
              // reach here and close the dialog (and the work in it).
              if (event.target !== event.currentTarget) return;
              event.preventDefault();
              onClose();
            }
          : undefined
      }
      onClose={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onPointerDown={(event) => {
        pressedOnBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        const pressed = pressedOnBackdrop.current;
        pressedOnBackdrop.current = false;
        if (confirmClose || !pressed || event.target !== event.currentTarget) return;
        if (event.currentTarget.querySelector("input:not([type=hidden]):not([type=button]):not([type=submit]), select, textarea")) return;
        onClose();
      }}
      className={`fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] ${extraWide ? "max-w-5xl" : wide ? "max-w-3xl" : "max-w-lg"} overflow-y-auto rounded-2xl border border-line bg-surface p-0 text-fg shadow-menu backdrop:bg-black/60`}
    >
      {open && (
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 id={titleId} className="text-lg font-semibold tracking-tight text-fg">
                <TitleText text={title} />
              </h2>
              {description && (
                <p id={descriptionId} className="mt-1 text-sm leading-relaxed text-fg-muted">
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="-mt-1 -mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <XIcon className="h-5 w-5" />
              <span className="sr-only">Close</span>
            </button>
          </div>
          <div className="mt-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}
