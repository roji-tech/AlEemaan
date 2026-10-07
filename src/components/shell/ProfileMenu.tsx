"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useSignOut } from "@/components/auth/useSignOut";
import { ChevronDownIcon, LogOutIcon, SlidersIcon, UserIcon } from "@/components/ui/icons";
import { SoonTag } from "./SoonTag";
import { FOCUS_RING, initialsOf } from "./nav";

type ProfileMenuProps = {
  name: string | null;
  email: string | null;
  roleLabel: string;
  /// Administrators see the (not yet built) Settings entry, as the artifact draws it.
  isAdmin: boolean;
};

const ITEM =
  "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg";

/// The top-bar account menu: avatar (+ name from `sm` up) opening Profile, Settings (soon) and
/// Sign out. A disclosure, not an ARIA `menu` — it holds ordinary links and a button in the
/// normal tab order, so it needs no arrow-key roving and makes no promise it doesn't keep.
/// Closes on Escape (focus back on the button), on a click outside, when Tab moves focus out of
/// it, and on navigation.
export function ProfileMenu({ name, email, roleLabel, isAdmin }: ProfileMenuProps) {
  const pathname = usePathname();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { signOut, pending, error } = useSignOut();

  // Navigating anywhere closes it. (Adjusting state during render is React's documented way to
  // reset state when a value changes, without an effect.)
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const displayName = name?.trim() || email || "Account";

  return (
    <div
      ref={rootRef}
      className="relative"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          setOpen(false);
          buttonRef.current?.focus();
        }
      }}
      onBlur={(event) => {
        // Tab carried focus to another control outside the menu. Only when the browser names
        // that control: Safari doesn't focus buttons on click, so a click on an item inside the
        // panel arrives here with no `relatedTarget` and must NOT close it before the click lands.
        const next = event.relatedTarget as Node | null;
        if (open && next && !rootRef.current?.contains(next)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
        className={`flex h-11 items-center gap-2.5 rounded-xl px-1.5 text-left transition-colors hover:bg-surface-2 sm:pr-3 ${FOCUS_RING}`}
      >
        <span className="sr-only">Account menu for {displayName}</span>
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-strong text-xs font-bold text-white"
        >
          {initialsOf(name, email)}
        </span>
        <span aria-hidden="true" className="hidden max-w-40 truncate text-sm font-medium text-fg sm:block">
          {displayName}
        </span>
        <ChevronDownIcon className={`hidden h-4 w-4 text-fg-muted transition-transform sm:block ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div id={panelId} className="absolute top-full right-0 z-30 mt-2 w-72 rounded-2xl border border-line bg-surface p-1.5 shadow-menu">
          <div className="px-3 py-2.5">
            <p className="truncate text-sm font-semibold text-fg">{displayName}</p>
            {name?.trim() && email && <p className="truncate text-xs text-fg-muted">{email}</p>}
            <p className="mt-1 text-xs font-medium text-brand-fg">{roleLabel}</p>
          </div>
          <div className="my-1 h-px bg-line" />

          <Link href="/account" className={`${ITEM} ${FOCUS_RING}`}>
            <UserIcon className="h-4 w-4" />
            Profile
          </Link>
          {isAdmin && (
            <span className={`${ITEM} text-fg-muted hover:bg-transparent hover:text-fg-muted`}>
              <SlidersIcon className="h-4 w-4" />
              Settings
              <SoonTag />
            </span>
          )}

          <div className="my-1 h-px bg-line" />
          <button
            type="button"
            onClick={signOut}
            disabled={pending}
            className={`${ITEM} disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`}
          >
            <LogOutIcon className="h-4 w-4" />
            {pending ? "Signing out…" : "Sign out"}
          </button>
          {error && (
            <p role="alert" className="px-3 pb-2 text-xs font-medium text-danger-text">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
