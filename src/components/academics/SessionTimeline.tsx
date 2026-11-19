import { progressOf, segmentsOf, termState, todayNumber, whereWeAre, type TermLike } from "@/lib/academics/session-progress";

/// The year at a glance (task 0105): one bar across the card, a segment for each term as long as the term is, ended terms grey, the current term filled green up to today, the ones to come
/// blue; under it one sentence says where the year stands. The bar is decoration (drawn as SVG shapes, with no inline style, which the page's content policy would refuse); the sentence and the
/// term cards under it carry the same facts in words, so nothing here is told by colour alone.
// Written out in full: Tailwind finds a class by reading the source, so none is built from pieces.
const FILL = { ended: "fill-line-strong", upcoming: "fill-info-icon/35", current: "fill-ok-icon/30", done: "fill-ok-icon" } as const;

export function SessionTimeline({
  status,
  periods,
  startDate,
  endDate,
  now,
}: {
  status: "PLANNED" | "ACTIVE" | "CLOSED";
  periods: readonly TermLike[];
  startDate: string;
  endDate: string;
  now: Date;
}) {
  if (periods.length === 0) return null;
  const today = todayNumber(now);
  const segments = segmentsOf(periods);
  const GAP = 0.6;
  return (
    <div>
      <svg aria-hidden="true" focusable="false" className="block h-2.5 w-full">
        {segments.map(({ period, x, width }) => {
          const state = termState(period, today);
          const w = Math.max(width - GAP, 0.5);
          return (
            <g key={`${period.label}-${period.startDate}`}>
              <rect x={`${x}%`} y="0" width={`${w}%`} height="10" rx="5" className={status === "CLOSED" ? FILL.ended : FILL[state]} />
              {state === "current" && status !== "CLOSED" && (
                <rect x={`${x}%`} y="0" width={`${w * progressOf(period, today).ratio}%`} height="10" rx="5" className={FILL.done} />
              )}
            </g>
          );
        })}
      </svg>
      <p className="mt-2 text-sm text-fg-2">{whereWeAre(status, periods, { startDate, endDate }, today)}</p>
    </div>
  );
}
