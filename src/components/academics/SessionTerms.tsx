"use client";

import { ActionsMenu, type MenuAction } from "@/components/ui/ActionsMenu";
import type { BreakRow } from "@/components/academics/BreakDialogs";
import { kindNoun } from "@/lib/academics/session-schedule";

// Dates are calendar days stored at midnight UTC: read them as UTC or a viewer west of Greenwich sees the day before.
const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export const day = (iso: string) => DAY.format(new Date(iso));

type Kind = Parameters<typeof kindNoun>[0];
export type TermView = {
  id: string;
  kind: Kind;
  label: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  breaks: BreakRow[];
};

/// The terms (or semesters) of one session, each as its own card, in a grid that takes as many columns as the width allows (task 0100). They were chips squeezed into the narrow
/// column beside the session's facts and buttons; now they sit under the session, across its whole width. Each term's card carries its dates, a "Current" badge, its breaks, and one
/// three-dots button for what can be done to it (make it the current term, add a break); each break has its own (change, remove). Nothing here decides who may do what: the caller
/// passes `canEdit`, and the server checks every change again.
export function SessionTerms<P extends TermView>({
  sessionLabel,
  sessionStatus,
  periods,
  canEdit,
  settingTerm,
  onMakeCurrent,
  onAddBreak,
  onChangeBreak,
  onRemoveBreak,
}: {
  sessionLabel: string;
  sessionStatus: "PLANNED" | "ACTIVE" | "CLOSED";
  periods: readonly P[];
  canEdit: boolean;
  /// The term being made current right now (its item reads "Setting…"); no second change starts until this one is answered.
  settingTerm: string | null;
  onMakeCurrent: (period: P) => void;
  onAddBreak: (period: P) => void;
  onChangeBreak: (period: P, brk: BreakRow) => void;
  onRemoveBreak: (period: P, brk: BreakRow) => void;
}) {
  if (periods.length === 0) return null;
  const noun = kindNoun(periods[0]!.kind);
  return (
    <ul
      aria-label={`${noun === "semester" ? "Semesters" : "Terms"} of ${sessionLabel}`}
      className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,16rem),1fr))] gap-3"
    >
      {periods.map((p) => {
        const actions: MenuAction[] = [];
        if (canEdit && sessionStatus === "ACTIVE" && !p.isCurrent)
          actions.push({
            id: "current",
            label: settingTerm === p.id ? "Setting…" : "Make current",
            ariaLabel: `Make ${p.label} the current ${kindNoun(p.kind)} of ${sessionLabel}`,
            disabled: settingTerm !== null,
            onSelect: () => onMakeCurrent(p),
          });
        if (canEdit && sessionStatus !== "CLOSED")
          actions.push({
            id: "break",
            label: "Add a break",
            ariaLabel: `Add a break to the ${p.label} of ${sessionLabel}`,
            onSelect: () => onAddBreak(p),
          });
        return (
          <li
            key={p.id}
            className={`min-w-0 rounded-xl border p-3 ${p.isCurrent ? "border-ok-line bg-ok-bg text-ok-fg" : "border-line bg-surface-2 text-fg-2"}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold wrap-break-word">
                  {p.label}
                  {p.isCurrent && <span className="rounded-full border border-ok-line px-2 py-0.5 text-xs font-semibold">Current</span>}
                </p>
                <p className="mt-0.5 text-xs">
                  {day(p.startDate)} to {day(p.endDate)}
                </p>
              </div>
              {actions.length > 0 && (
                <div className="-mt-1.5 -mr-1.5 shrink-0">
                  <ActionsMenu name={`the ${p.label} of ${sessionLabel}`} actions={actions} />
                </div>
              )}
            </div>
            {p.breaks.length > 0 && (
              <ul aria-label={`Breaks in the ${p.label} of ${sessionLabel}`} className="mt-3 divide-y divide-line border-t border-line">
                {p.breaks.map((b) => (
                  <li key={b.id} className="flex items-start justify-between gap-2 py-2 text-xs first:pb-2 last:pb-0">
                    <div className="min-w-0">
                      <p className="font-semibold wrap-break-word">{b.label}</p>
                      <p>{b.startDate === b.endDate ? day(b.startDate) : `${day(b.startDate)} to ${day(b.endDate)}`}</p>
                    </div>
                    {canEdit && sessionStatus !== "CLOSED" && (
                      <div className="-my-2 -mr-1.5 shrink-0">
                        <ActionsMenu
                          name={`${b.label} in the ${p.label} of ${sessionLabel}`}
                          actions={[
                            {
                              id: "change",
                              label: "Change",
                              ariaLabel: `Change ${b.label} in the ${p.label} of ${sessionLabel}`,
                              onSelect: () => onChangeBreak(p, b),
                            },
                            {
                              id: "remove",
                              label: "Remove",
                              ariaLabel: `Remove ${b.label} from the ${p.label} of ${sessionLabel}`,
                              danger: true,
                              onSelect: () => onRemoveBreak(p, b),
                            },
                          ]}
                        />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
