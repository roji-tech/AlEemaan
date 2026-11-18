"use client";

import { ActionsMenu, type MenuAction } from "@/components/ui/ActionsMenu";
import { ClockIcon } from "@/components/ui/icons";
import { TONE, type Tone } from "@/components/ui/tone";
import type { BreakRow } from "@/components/academics/BreakDialogs";
import { kindNoun } from "@/lib/academics/session-schedule";
import { lengthDays, lengthText, termState, todayNumber, type TermState } from "@/lib/academics/session-progress";

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

/// What each state is called and coloured (task 0105): the word is always there, the colour only helps.
const STATE: Record<TermState, { word: string; tone: Tone }> = {
  current: { word: "Current", tone: "ok" },
  upcoming: { word: "Upcoming", tone: "info" },
  ended: { word: "Ended", tone: "neutral" },
};

/// The terms (or semesters) of one session, each as its own card, in a grid that takes as many columns as the width allows (tasks 0100 and 0105). A card has a coloured rail and a state chip
/// (Current green, Upcoming blue, Ended grey), its dates and how long it is, its breaks as amber blocks, and one three-dots button for what can be done to it (make it the current term,
/// add a break); each break has its own (change, remove). Nothing here decides who may do what: the caller passes `canEdit`, and the server checks every change again.
export function SessionTerms<P extends TermView>({
  sessionLabel,
  sessionStatus,
  periods,
  canEdit,
  settingTerm,
  now,
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
  /// The moment the cards are drawn for (decides Upcoming and Ended).
  now: Date;
  onMakeCurrent: (period: P) => void;
  onAddBreak: (period: P) => void;
  onChangeBreak: (period: P, brk: BreakRow) => void;
  onRemoveBreak: (period: P, brk: BreakRow) => void;
}) {
  if (periods.length === 0) return null;
  const noun = kindNoun(periods[0]!.kind);
  const today = todayNumber(now);
  return (
    <ul
      aria-label={`${noun === "semester" ? "Semesters" : "Terms"} of ${sessionLabel}`}
      className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,16rem),1fr))] gap-3"
    >
      {periods.map((p) => {
        const state = sessionStatus === "CLOSED" ? "ended" : termState(p, today);
        const look = STATE[state];
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
            className={`relative min-w-0 overflow-hidden rounded-xl border py-3 pr-3 pl-5 ${
              state === "current" ? "border-ok-line bg-ok-bg" : "border-line bg-surface-2"
            }`}
          >
            <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1.5 ${TONE[look.tone].rail}`} />
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold wrap-break-word text-fg">
                  {p.label}
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${TONE[look.tone].chip}`}>{look.word}</span>
                </p>
                <p className="mt-1 text-xs text-fg-2">
                  {day(p.startDate)} to {day(p.endDate)}
                  <span className="text-fg-muted"> · {lengthText(lengthDays(p))}</span>
                </p>
              </div>
              {actions.length > 0 && (
                <div className="-mt-1.5 -mr-1.5 shrink-0">
                  <ActionsMenu name={`the ${p.label} of ${sessionLabel}`} actions={actions} />
                </div>
              )}
            </div>
            {p.breaks.length > 0 && (
              <ul aria-label={`Breaks in the ${p.label} of ${sessionLabel}`} className="mt-3 space-y-2">
                {p.breaks.map((b) => (
                  <li
                    key={b.id}
                    className={`flex items-start justify-between gap-2 rounded-lg border py-2 pr-1 pl-3 text-xs ${TONE.warn.chip}`}
                  >
                    <div className="flex min-w-0 items-start gap-2">
                      <ClockIcon aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 ${TONE.warn.icon}`} />
                      <div className="min-w-0">
                        <p className="font-semibold wrap-break-word">{b.label}</p>
                        <p>{b.startDate === b.endDate ? day(b.startDate) : `${day(b.startDate)} to ${day(b.endDate)}`}</p>
                      </div>
                    </div>
                    {canEdit && sessionStatus !== "CLOSED" && (
                      <div className="-my-1 shrink-0">
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
