"use client";

import Link from "next/link";
import { createContext, useContext, type ReactNode } from "react";
import { ActionsMenu, type MenuAction } from "./ActionsMenu";
import { Button } from "./Button";
import type { ViewMode } from "./collection-model";

// One way to show a list of records, as rows or as cards (task 0089). A page describes each record with <Item> and puts the items in a <Collection>; the collection says whether they are
// laid out as a list or a grid, so the two can never get out of step. The width a collection has decides its shape (container queries), not the width of the screen: a grid has as many
// columns as fit, a list row is one line when it has room and stacked when it has not. Classes only (the CSP refuses inline styles).

const LayoutContext = createContext<ViewMode>("list");

export type CollectionState = "loading" | "empty" | "nomatch" | "ready";

/// The frame of a list: draws the loading, empty and "nothing matches" states the same way everywhere, and otherwise the `ul` of items.
///   state: "loading" while the first answer is awaited; "empty" when there is nothing at all; "nomatch" when a search or filter leaves nothing (with a Clear filters button); else "ready".
export function Collection({
  label,
  view,
  state,
  emptyText = "Nothing here yet.",
  noMatchText = "Nothing matches.",
  loadingText = "Loading…",
  onClear,
  children,
}: {
  /// The accessible name of the list ("Classes").
  label: string;
  view: ViewMode;
  state: CollectionState;
  emptyText?: ReactNode;
  noMatchText?: ReactNode;
  loadingText?: string;
  onClear?: () => void;
  children?: ReactNode;
}) {
  if (state === "loading")
    return (
      <p className="text-sm text-fg-muted" aria-busy="true">
        {loadingText}
      </p>
    );
  if (state === "empty")
    return <p className="rounded-2xl border border-dashed border-line-strong p-6 text-center text-sm text-fg-muted">{emptyText}</p>;
  if (state === "nomatch")
    return (
      <div className="rounded-2xl border border-dashed border-line-strong p-6 text-center text-sm text-fg-muted">
        <p>{noMatchText}</p>
        {onClear && (
          <Button variant="secondary" className="mt-3" onClick={onClear}>
            Clear filters
          </Button>
        )}
      </div>
    );
  return (
    <LayoutContext.Provider value={view}>
      <div className="@container">
        <ul
          aria-label={label}
          className={
            view === "grid"
              ? "grid grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-3 @3xl:gap-4"
              : "divide-y divide-line rounded-2xl border border-line bg-surface shadow-card"
          }
        >
          {children}
        </ul>
      </div>
    </LayoutContext.Provider>
  );
}

export type ItemFact = { label: string; value: ReactNode };
export type ItemAction = {
  id: string;
  label: ReactNode;
  /// The full name for a screen reader ("Rename Primary 1"), when the label alone does not say which item it belongs to.
  ariaLabel?: string;
  onClick: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  loading?: boolean;
};

/// The round or square picture at the head of an item: an icon in a tinted tile.
export function ItemTile({ children }: { children: ReactNode }) {
  const view = useContext(LayoutContext);
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand-fg ${view === "grid" ? "h-11 w-11" : "h-10 w-10"}`}
    >
      {children}
    </span>
  );
}

/// A person's initials in a tinted circle.
export function ItemInitials({ text }: { text: string }) {
  const view = useContext(LayoutContext);
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-brand-tint text-xs font-bold text-brand-fg ${view === "grid" ? "h-11 w-11" : "h-10 w-10"}`}
    >
      {text}
    </span>
  );
}

/// One record. The same props are drawn as a card in a grid and as a row in a list.
///   title / subtitle  what it is; the title wraps rather than being cut off
///   leading           an <ItemTile> or <ItemInitials>
///   badges            status badges (a few words each)
///   facts             short label/value pairs; `factsStyle` "stats" draws big numbers ("3 / arms"), "details" (the default) small labels over values
///   children          anything else (chips, a line of text)
///   href              the whole item opens this page (a stretched link on the title; the actions stay clickable above it)
///   actions / menu    buttons that stay buttons with their full accessible names, and one "Actions" disclosure for the rest
export function Item({
  title,
  subtitle,
  leading,
  badges,
  facts,
  factsStyle = "details",
  children,
  href,
  hrefLabel,
  actions,
  menu,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  badges?: ReactNode;
  facts?: readonly ItemFact[];
  factsStyle?: "stats" | "details";
  children?: ReactNode;
  href?: string;
  hrefLabel?: string;
  actions?: readonly ItemAction[];
  menu?: { name: string; actions: readonly MenuAction[] };
}) {
  const grid = useContext(LayoutContext) === "grid";

  const titleBlock = (
    <div className="min-w-0 flex-1">
      <p className="text-base leading-snug font-semibold wrap-break-word text-fg">
        {href ? (
          <Link
            href={href}
            prefetch={false}
            aria-label={hrefLabel}
            className="rounded after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {title}
          </Link>
        ) : (
          title
        )}
      </p>
      {subtitle && <p className="mt-0.5 text-sm wrap-break-word text-fg-muted">{subtitle}</p>}
    </div>
  );

  const factsBlock =
    facts && facts.length > 0 ? (
      factsStyle === "stats" ? (
        <dl
          className={
            grid
              ? "mt-4 grid grid-cols-[repeat(auto-fit,minmax(4.5rem,1fr))] gap-2"
              : "flex flex-wrap gap-x-5 gap-y-1 text-sm @2xl:shrink-0 @2xl:flex-nowrap"
          }
        >
          {facts.map((f) => (
            <div
              key={f.label}
              className={
                grid ? "flex flex-col-reverse rounded-xl bg-surface-2 px-2 py-2 text-center" : "flex flex-row-reverse items-baseline gap-1"
              }
            >
              <dt className={grid ? "mt-1 text-xs text-fg-muted" : "text-fg-muted"}>{f.label}</dt>
              <dd className={grid ? "text-lg leading-none font-semibold text-fg" : "font-semibold text-fg"}>{f.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <dl
          className={
            grid
              ? "mt-3 grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-x-4 gap-y-2 text-sm"
              : "flex flex-wrap gap-x-6 gap-y-2 text-sm @2xl:w-[22rem] @2xl:shrink-0 @2xl:flex-nowrap @2xl:gap-x-5"
          }
        >
          {facts.map((f) => (
            <div key={f.label} className="min-w-0">
              <dt className="text-[11px] font-semibold tracking-wide text-fg-muted uppercase">{f.label}</dt>
              <dd className="break-words text-fg-2">{f.value}</dd>
            </div>
          ))}
        </dl>
      )
    ) : null;

  const hasActions = (actions && actions.length > 0) || (menu && menu.actions.length > 0);
  const actionsBlock = hasActions ? (
    <div
      className={
        grid
          ? "relative z-10 mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3"
          : "relative z-10 flex flex-wrap items-center gap-2 @2xl:shrink-0 @2xl:justify-end"
      }
    >
      {actions?.map((a) => (
        <Button
          key={a.id}
          variant={a.variant ?? "secondary"}
          onClick={a.onClick}
          aria-label={a.ariaLabel}
          disabled={a.disabled}
          loading={a.loading}
        >
          {a.label}
        </Button>
      ))}
      {menu && <ActionsMenu name={menu.name} actions={menu.actions} />}
    </div>
  ) : null;

  if (grid) {
    return (
      <li className="relative flex h-full flex-col rounded-2xl border border-line bg-surface p-4 shadow-card transition-shadow hover:shadow-md focus-within:shadow-md">
        <div className="flex-1">
          <div className="flex items-start gap-3">
            {leading}
            {titleBlock}
            {badges && <div className="flex max-w-[45%] shrink-0 flex-wrap justify-end gap-1">{badges}</div>}
          </div>
          {factsBlock}
          {children && <div className="mt-3 min-w-0 text-sm">{children}</div>}
        </div>
        {actionsBlock}
      </li>
    );
  }
  return (
    <li className="relative flex flex-col gap-3 p-4 @2xl:flex-row @2xl:items-center @2xl:gap-5">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {leading}
        <div className="min-w-0 flex-1">
          {titleBlock}
          {children && <div className="mt-2 min-w-0 text-sm">{children}</div>}
        </div>
      </div>
      {factsBlock}
      {badges && <div className="flex flex-wrap items-center gap-1 @2xl:shrink-0 @2xl:justify-end">{badges}</div>}
      {actionsBlock}
    </li>
  );
}
