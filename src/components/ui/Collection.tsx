"use client";

import Link from "next/link";
import { createContext, useContext, type ReactNode } from "react";
import { ActionsMenu, type MenuAction } from "./ActionsMenu";
import { Button } from "./Button";
import type { ViewMode } from "./collection-model";
import { TONE, type Tone } from "./tone";

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
  className,
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
  className?: string;
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
            className ??
            (view === "grid"
              ? "grid grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-3 @3xl:gap-4"
              : "divide-y divide-line rounded-2xl border border-line bg-surface shadow-card")
          }
        >
          {children}
        </ul>
      </div>
    </LayoutContext.Provider>
  );
}

/// A fact; in the "stats" style it may carry an icon and a tone (task 0105), drawn as a tinted chip so three numbers on a card are told apart at a glance.
export type ItemFact = { label: string; value: ReactNode; icon?: ReactNode; tone?: Tone };
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

/// When a list row can be one line, and how wide its facts are then, depends on how much the row has to carry: a row with one short fact (a pupil's class) is one line from 42 rem of list
/// width, with two facts from 48 rem, with three or more from 56 rem. The name always gets everything the facts and the three dots leave, and below that width the row stacks (name,
/// then facts) instead of squeezing the name into a column of letters (the maintainer, 2026-11-18: "it's shrinking the name even though there are lots of spaces"). The class names are
/// written out in full: Tailwind only builds classes it can read in the source.
const ONE_LINE = {
  "2xl": {
    row: "@2xl:flex-row @2xl:items-center @2xl:gap-5",
    headPad: "pr-11 @2xl:pr-0",
    keep: "@2xl:shrink-0 @2xl:flex-nowrap",
    spread: "@2xl:gap-x-5",
    width: "@2xl:w-44",
    end: "@2xl:shrink-0 @2xl:justify-end",
    dots: "@2xl:static @2xl:shrink-0",
  },
  "3xl": {
    row: "@3xl:flex-row @3xl:items-center @3xl:gap-5",
    headPad: "pr-11 @3xl:pr-0",
    keep: "@3xl:shrink-0 @3xl:flex-nowrap",
    spread: "@3xl:gap-x-5",
    width: "@3xl:w-80",
    end: "@3xl:shrink-0 @3xl:justify-end",
    dots: "@3xl:static @3xl:shrink-0",
  },
  "4xl": {
    row: "@4xl:flex-row @4xl:items-center @4xl:gap-5",
    headPad: "pr-11 @4xl:pr-0",
    keep: "@4xl:shrink-0 @4xl:flex-nowrap",
    spread: "@4xl:gap-x-5",
    width: "@4xl:w-[26rem]",
    end: "@4xl:shrink-0 @4xl:justify-end",
    dots: "@4xl:static @4xl:shrink-0",
  },
} as const;

const oneLineFor = (facts: number, style: "stats" | "details") =>
  ONE_LINE[facts === 0 || style === "stats" || facts === 1 ? "2xl" : facts === 2 ? "3xl" : "4xl"];

/// One record. The same props are drawn as a card in a grid and as a row in a list (task 0089, redesigned in task 0100).
///   title / subtitle  what it is; the title wraps rather than being cut off
///   leading           an <ItemTile> or <ItemInitials>
///   badges            status badges (a few words each); they sit under the title, where a long one ("Suspended until 12 Nov 2026") has the room it needs
///   facts             short label/value pairs; `factsStyle` "stats" draws big numbers ("3 / arms"), "details" (the default) small labels over values
///   children          a line or two under the title (chips, a line of text); narrow by design
///   below             anything that needs the WHOLE width of the item, under everything else: a session's terms, a class's arms. Not squeezed beside the facts and the buttons.
///   href              the whole item opens this page (a stretched link on the title; the actions stay clickable above it)
///   actions / menu    what can be done to the item. Two or more fold into ONE three-dots button (`ActionsMenu`) at the item's top right, so a row is never a wall of buttons and
///                     a phone gets the same tidy card as a desktop. One action alone stays a button. `actionsStyle="buttons"` keeps them all visible: for the one or two decisions
///                     a screen exists for (Approve, Reject). `name` is what the three dots are called ("Actions for <name>"); it defaults to the title when that is plain text.
export function Item({
  title,
  subtitle,
  leading,
  badges,
  facts,
  factsStyle = "details",
  children,
  below,
  href,
  hrefLabel,
  actions,
  menu,
  actionsStyle = "menu",
  name,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  badges?: ReactNode;
  facts?: readonly ItemFact[];
  factsStyle?: "stats" | "details";
  children?: ReactNode;
  below?: ReactNode;
  href?: string;
  hrefLabel?: string;
  actions?: readonly ItemAction[];
  menu?: { name: string; actions: readonly MenuAction[] };
  actionsStyle?: "menu" | "buttons";
  name?: string;
}) {
  const grid = useContext(LayoutContext) === "grid";
  const line = oneLineFor(facts?.length ?? 0, factsStyle);

  // Every action of the item, as menu entries (an action's variant "danger" becomes a danger entry; one that is busy cannot be chosen again).
  const every: MenuAction[] = [
    ...(actions ?? []).map((a) => ({
      id: a.id,
      label: a.label,
      ariaLabel: a.ariaLabel,
      onSelect: a.onClick,
      disabled: a.disabled || a.loading,
      danger: a.variant === "danger",
    })),
    ...(menu?.actions ?? []),
  ];
  const folded = actionsStyle === "menu" && every.length > 1;
  const menuName = name ?? menu?.name ?? (typeof title === "string" ? title : "this item");

  const titleBlock = (
    <>
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
    </>
  );

  const factsBlock =
    facts && facts.length > 0 ? (
      factsStyle === "stats" ? (
        <dl
          className={
            grid ? "mt-4 grid grid-cols-[repeat(auto-fit,minmax(4.5rem,1fr))] gap-2" : `flex flex-wrap gap-x-5 gap-y-1 text-sm ${line.keep}`
          }
        >
          {facts.map((f) => (
            <div
              key={f.label}
              className={
                grid
                  ? `flex flex-col-reverse items-center rounded-xl px-2 py-2 text-center ${f.tone ? `border ${TONE[f.tone].chip}` : "bg-surface-2"}`
                  : "flex flex-row-reverse items-center gap-1"
              }
            >
              <dt className={grid ? `mt-1 text-xs ${f.tone ? "" : "text-fg-muted"}` : "text-fg-muted"}>{f.label}</dt>
              <dd className={grid ? "text-lg leading-none font-semibold text-fg" : "font-semibold text-fg"}>{f.value}</dd>
              {f.icon && (
                <span aria-hidden="true" className={`${grid ? "mb-1" : "mr-0.5"} ${f.tone ? TONE[f.tone].icon : "text-fg-muted"}`}>
                  {f.icon}
                </span>
              )}
            </div>
          ))}
        </dl>
      ) : (
        <dl
          className={
            grid
              ? "mt-3 grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-x-4 gap-y-2 text-sm"
              : `flex flex-wrap gap-x-6 gap-y-2 text-sm ${line.keep} ${line.spread} ${line.width}`
          }
        >
          {facts.map((f) => (
            <div key={f.label} className="min-w-0">
              <dt className="text-[11px] font-semibold tracking-wide text-fg-muted uppercase">{f.label}</dt>
              <dd className="wrap-break-word text-fg-2">{f.value}</dd>
            </div>
          ))}
        </dl>
      )
    ) : null;

  // The head of the item: the picture, the title, its badges and its short lines. It leaves room at the right for the three dots when they sit on top of it.
  const head = (
    <div className={`flex min-w-0 flex-1 items-start gap-3 ${folded ? (grid ? "pr-11" : line.headPad) : ""}`}>
      {leading}
      <div className="min-w-0 flex-1">
        {titleBlock}
        {badges && <div className="mt-1.5 flex flex-wrap items-center gap-1">{badges}</div>}
        {children && <div className="mt-2 min-w-0 text-sm">{children}</div>}
      </div>
    </div>
  );

  // The three dots. In a card, and in a list row too narrow for one line, they sit at the top right corner of the item; in a list row with room for one line they are its last cell.
  // While the menu is open the corner is raised above the corners of the items after it (`z-30`), or their buttons would be drawn over the list.
  const dots = folded ? (
    <div className={`absolute top-2 right-2 z-10 has-aria-expanded:z-30 ${grid ? "" : line.dots}`}>
      <ActionsMenu name={menuName} actions={every} />
    </div>
  ) : null;

  // Not folded: the actions stay visible as buttons (and a `menu`, if there is one, as the three dots after them).
  const hasButtons = !folded && ((actions && actions.length > 0) || (menu && menu.actions.length > 0));
  const buttons = hasButtons ? (
    <div
      className={
        grid
          ? "relative z-10 mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3"
          : `relative z-10 flex flex-wrap items-center gap-2 ${line.end}`
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

  const belowBlock = below ? <div className="mt-3 min-w-0">{below}</div> : null;

  if (grid) {
    return (
      <li className="relative flex h-full flex-col rounded-2xl border border-line bg-surface p-4 shadow-card transition-shadow hover:shadow-md focus-within:shadow-md">
        <div className="flex-1">
          {head}
          {factsBlock}
          {belowBlock}
        </div>
        {buttons}
        {dots}
      </li>
    );
  }
  return (
    <li className="relative p-4">
      <div className={`flex flex-col gap-3 ${line.row}`}>
        {head}
        {factsBlock}
        {buttons}
        {dots}
      </div>
      {belowBlock}
    </li>
  );
}
