import { standingLine, type StandingValue } from "./model";

const STYLE: Record<StandingValue, string> = {
  ACTIVE: "border-ok-line bg-ok-bg text-ok-fg",
  SUSPENDED: "border-warn-line bg-warn-bg text-warn-fg",
  EXPELLED: "border-danger-line bg-danger-bg text-danger-fg",
  TERMINATED: "border-danger-line bg-danger-bg text-danger-fg",
};

/// A person's standing as a pill. A person in good standing shows nothing: the pill is for the exception, so a long list is not a wall of green.
export function StandingBadge({ standing, until }: { standing: StandingValue; until?: string | null }) {
  if (standing === "ACTIVE") return null;
  return (
    <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${STYLE[standing]}`}>
      {standingLine(standing, until ?? null)}
    </span>
  );
}
