import { STATUS_TEXT, type ProgramStatusKey } from "@/components/programs/model";

const STYLE: Record<ProgramStatusKey, string> = {
  DRAFT: "border-line-strong text-fg-2",
  ACTIVE: "border-ok-line bg-ok-bg text-ok-fg",
  COMPLETED: "border-info-line bg-info-bg text-info-fg",
  ARCHIVED: "border-line-strong bg-surface-2 text-fg-muted",
};

/// The state of a program as a pill: the list and the program's own page say it the same way.
export function ProgramBadge({ status }: { status: ProgramStatusKey }) {
  return <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${STYLE[status]}`}>{STATUS_TEXT[status]}</span>;
}
