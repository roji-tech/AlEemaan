"use client";

import { useEffect, useState } from "react";
import { formatNaira } from "@/lib/finance/format";
import { AGEING, AGEING_WORDS, compactNaira, type AgeingBucket, type MonthRow } from "@/lib/finance/stats";
import type { BranchStats, ClassRow, MethodRow, Overview, OverviewRow } from "@/lib/finance/stats-service";
import type { Totals } from "@/lib/finance/stats";
import { TONE, type Tone } from "@/components/ui/tone";
import { SelectField } from "@/components/ui/SelectField";

// Finance's Overview (task 0106): the money of one branch in depth, and every branch side by side. The server adds everything up (lib/finance/stats-service.ts); this only draws what it is given.
// Bars are SVG shapes with attributes (the page's content policy refuses inline style); every bar has its number as text beside it and the charts are hidden from screen readers, which read the
// figures instead. Colour never carries a number alone: Collected is green and Outstanding amber, and each is also said in words.

const FILL: Record<Tone, string> = {
  ok: "fill-ok-icon",
  info: "fill-info-icon",
  warn: "fill-warn-icon",
  danger: "fill-danger-icon",
  brand: "fill-brand",
  neutral: "fill-line-strong",
};
const naira = (kobo: number) => formatNaira(kobo / 100);

/// One horizontal bar: the track and the part filled, as a share (0 to 100).
function Bar({ share, tone, className = "h-2" }: { share: number; tone: Tone; className?: string }) {
  const width = Math.max(0, Math.min(100, share));
  return (
    <svg aria-hidden="true" focusable="false" className={`block w-full ${className}`}>
      <rect x="0" y="0" width="100%" height="100%" rx="4" className="fill-surface-2" />
      {width > 0 && <rect x="0" y="0" width={`${width}%`} height="100%" rx="4" className={FILL[tone]} />}
    </svg>
  );
}

function Card({ title, tone, children, hint }: { title: string; tone: Tone; children: React.ReactNode; hint?: string }) {
  return (
    <div className={`rounded-2xl border p-4 ${TONE[tone].chip}`}>
      <p className="text-xs font-semibold tracking-wide uppercase opacity-90">{title}</p>
      <p className="mt-1 text-xl font-bold text-fg">{children}</p>
      {hint && <p className="mt-0.5 text-xs opacity-90">{hint}</p>}
    </div>
  );
}

function Kpis({ totals }: { totals: Totals }) {
  const extras = [
    totals.discountsKobo > 0 ? `${naira(totals.discountsKobo)} in discounts` : null,
    totals.waived > 0 ? `${totals.waived} waived` : null,
    totals.cancelled > 0 ? `${totals.cancelled} cancelled` : null,
  ].filter(Boolean);
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card title="Invoiced" tone="info" hint={`${totals.invoices} ${totals.invoices === 1 ? "invoice" : "invoices"}`}>
          {naira(totals.invoicedKobo)}
        </Card>
        <Card title="Collected" tone="ok" hint={`${totals.ratePercent}% of what was invoiced`}>
          {naira(totals.collectedKobo)}
        </Card>
        <Card title="Outstanding" tone="warn" hint="Still to be paid">
          {naira(totals.outstandingKobo)}
        </Card>
        <Card title="Overdue" tone={totals.overdueKobo > 0 ? "danger" : "neutral"} hint="Past its due date">
          {naira(totals.overdueKobo)}
        </Card>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <Bar share={totals.ratePercent} tone="ok" className="h-2.5" />
        </div>
        <p className="shrink-0 text-sm font-semibold text-fg">{totals.ratePercent}% collected</p>
      </div>
      {extras.length > 0 && <p className="mt-1 text-xs text-fg-muted">{extras.join(" · ")}</p>}
    </div>
  );
}

const MONTH = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });
const monthName = (key: string) => MONTH.format(new Date(`${key}-01T00:00:00Z`));

function Months({ months }: { months: MonthRow[] }) {
  const top = Math.max(1, ...months.flatMap((m) => [m.invoicedKobo, m.collectedKobo]));
  const empty = months.every((m) => m.invoicedKobo === 0 && m.collectedKobo === 0);
  return (
    <section aria-labelledby="fo-months" className="rounded-2xl border border-line bg-surface p-4">
      <h3 id="fo-months" className="text-sm font-semibold text-fg">
        Month by month
      </h3>
      <p className="mt-0.5 text-xs text-fg-muted">
        <span className="font-semibold text-info-fg">Invoiced</span> against <span className="font-semibold text-ok-fg">collected</span>,
        the last six months.
      </p>
      {empty ? (
        <p className="mt-4 text-sm text-fg-muted">Nothing invoiced or collected in the last six months.</p>
      ) : (
        <ul className="mt-4 grid grid-cols-6 gap-2">
          {months.map((m) => {
            const h = (k: number) => Math.round((k / top) * 100);
            return (
              <li key={m.month} className="min-w-0 text-center">
                <svg aria-hidden="true" focusable="false" viewBox="0 0 40 100" preserveAspectRatio="none" className="h-28 w-full">
                  <rect x="4" y={100 - h(m.invoicedKobo)} width="14" height={h(m.invoicedKobo)} rx="2" className={FILL.info} />
                  <rect x="22" y={100 - h(m.collectedKobo)} width="14" height={h(m.collectedKobo)} rx="2" className={FILL.ok} />
                </svg>
                <p className="mt-1 text-xs font-semibold text-fg">{monthName(m.month)}</p>
                <p className="text-[11px] text-fg-muted">{compactNaira(m.collectedKobo)}</p>
                <p className="sr-only">
                  {monthName(m.month)}: invoiced {naira(m.invoicedKobo)}, collected {naira(m.collectedKobo)}.
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const AGEING_TONE: Record<AgeingBucket, Tone> = { notDue: "info", d1to30: "warn", d31to60: "warn", d61plus: "danger" };

function Ageing({ ageing }: { ageing: Record<AgeingBucket, number> }) {
  const total = AGEING.reduce((n, b) => n + ageing[b], 0);
  return (
    <section aria-labelledby="fo-ageing" className="rounded-2xl border border-line bg-surface p-4">
      <h3 id="fo-ageing" className="text-sm font-semibold text-fg">
        What is owed, and how late
      </h3>
      {total === 0 ? (
        <p className="mt-3 text-sm text-fg-muted">Nothing is owed.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {AGEING.map((b) => (
            <li key={b}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-fg-2">{AGEING_WORDS[b]}</span>
                <span className="font-semibold text-fg">{naira(ageing[b])}</span>
              </div>
              <Bar share={total === 0 ? 0 : (ageing[b] / total) * 100} tone={AGEING_TONE[b]} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Classes({ rows }: { rows: ClassRow[] }) {
  return (
    <section aria-labelledby="fo-classes" className="rounded-2xl border border-line bg-surface p-4">
      <h3 id="fo-classes" className="text-sm font-semibold text-fg">
        By class
      </h3>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-fg-muted">No invoices yet.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {rows.map((c) => (
            <li key={c.name}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 wrap-break-word text-fg-2">
                  {c.name} <span className="text-fg-muted">· {c.invoices}</span>
                </span>
                <span className="shrink-0 font-semibold text-fg">
                  {naira(c.collectedKobo)} <span className="font-normal text-fg-muted">of {compactNaira(c.invoicedKobo)}</span>
                </span>
              </div>
              <Bar share={c.ratePercent} tone="ok" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Methods({ rows }: { rows: MethodRow[] }) {
  const total = rows.reduce((n, r) => n + r.amountKobo, 0);
  return (
    <section aria-labelledby="fo-methods" className="rounded-2xl border border-line bg-surface p-4">
      <h3 id="fo-methods" className="text-sm font-semibold text-fg">
        How it was paid
      </h3>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-fg-muted">No payments yet.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {rows.map((r) => (
            <li key={r.label}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-fg-2">
                  {r.label} <span className="text-fg-muted">· {r.payments}</span>
                </span>
                <span className="font-semibold text-fg">{naira(r.amountKobo)}</span>
              </div>
              <Bar share={total === 0 ? 0 : (r.amountKobo / total) * 100} tone="brand" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Statuses({ stats }: { stats: BranchStats }) {
  const rows = [
    { key: "PAID", word: "Paid", tone: "ok" as const },
    { key: "PARTIALLY_PAID", word: "Partly paid", tone: "warn" as const },
    { key: "UNPAID", word: "Unpaid", tone: "danger" as const },
  ] as const;
  const total = stats.totals.invoices;
  return (
    <section aria-labelledby="fo-status" className="rounded-2xl border border-line bg-surface p-4">
      <h3 id="fo-status" className="text-sm font-semibold text-fg">
        Invoices by status
      </h3>
      <ul className="mt-3 space-y-3">
        {rows.map((r) => {
          const row = stats.byStatus[r.key];
          return (
            <li key={r.key}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-fg-2">
                  {r.word} <span className="text-fg-muted">· {row.count}</span>
                </span>
                <span className="font-semibold text-fg">{naira(row.invoicedKobo)}</span>
              </div>
              <Bar share={total === 0 ? 0 : (row.count / total) * 100} tone={r.tone} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/// Fetches one address and gives back what it answered; `null` while a new address is awaited. The state is keyed by the address, so changing it never shows the old answer under the new choice.
function useAnswer<T>(url: string | null): { data: T | null; error: string | null } {
  const [state, setState] = useState<{ url: string | null; data: T | null; error: string | null }>({ url: null, data: null, error: null });
  useEffect(() => {
    if (!url) return;
    let alive = true;
    fetch(url)
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!alive) return;
        if (!res.ok) setState({ url, data: null, error: json?.error?.message ?? "Unable to load the figures" });
        else setState({ url, data: json.data as T, error: null });
      })
      .catch(() => alive && setState({ url, data: null, error: "Unable to load the figures" }));
    return () => {
      alive = false;
    };
  }, [url]);
  return state.url === url ? { data: state.data, error: state.error } : { data: null, error: null };
}

function Wait({ error, retry }: { error: string | null; retry?: () => void }) {
  return error ? (
    <div role="alert" className="rounded-2xl border border-danger-line bg-danger-bg p-6 text-center text-sm text-danger-fg">
      <p className="font-semibold">{error}</p>
      {retry && (
        <button
          type="button"
          onClick={retry}
          className="mt-3 min-h-11 rounded-xl bg-brand-strong px-4 text-sm font-semibold text-white hover:bg-brand-strong-hover"
        >
          Try again
        </button>
      )}
    </div>
  ) : (
    <div
      role="status"
      className="flex h-48 items-center justify-center rounded-2xl border border-line bg-surface text-sm font-medium text-fg-muted"
    >
      Adding up the figures…
    </div>
  );
}

function OneBranch({ branchId, periods }: { branchId: string; periods: { id: string; label: string; current?: boolean }[] }) {
  const [periodId, setPeriodId] = useState(periods.find((p) => p.current)?.id ?? "");
  const [attempt, setAttempt] = useState(0);
  const url = `/api/v1/finance/stats?branchId=${encodeURIComponent(branchId)}${periodId ? `&periodId=${encodeURIComponent(periodId)}` : ""}&n=${attempt}`;
  const { data, error } = useAnswer<BranchStats>(url);
  return (
    <div className="space-y-4">
      <div className="max-w-xs">
        <SelectField
          label="Term"
          value={periodId}
          onChange={(e) => setPeriodId(e.target.value)}
          options={[
            { value: "", label: "All terms" },
            ...periods.map((p) => ({ value: p.id, label: `${p.label}${p.current ? " (current)" : ""}` })),
          ]}
        />
      </div>
      {!data ? (
        <Wait error={error} retry={() => setAttempt((n) => n + 1)} />
      ) : (
        <div className="space-y-4">
          <Kpis totals={data.totals} />
          <div className="grid gap-4 lg:grid-cols-2">
            <Months months={data.months} />
            <Ageing ageing={data.ageing} />
            <Statuses stats={data} />
            <Methods rows={data.byMethod} />
          </div>
          <Classes rows={data.byClass} />
        </div>
      )}
    </div>
  );
}

function BranchLine({ row }: { row: OverviewRow }) {
  const t = row.totals;
  return (
    <li className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h4 className="text-sm font-semibold wrap-break-word text-fg">{row.name}</h4>
        <p className="text-xs text-fg-muted">{row.periodLabel ?? "No current term"}</p>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-[11px] font-semibold tracking-wide text-fg-muted uppercase">Invoiced</dt>
          <dd className="font-semibold text-fg">{naira(t.invoicedKobo)}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold tracking-wide text-fg-muted uppercase">Collected</dt>
          <dd className="font-semibold text-ok-fg">{naira(t.collectedKobo)}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold tracking-wide text-fg-muted uppercase">Outstanding</dt>
          <dd className="font-semibold text-warn-fg">{naira(t.outstandingKobo)}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold tracking-wide text-fg-muted uppercase">Overdue</dt>
          <dd className={`font-semibold ${t.overdueKobo > 0 ? "text-danger-fg" : "text-fg"}`}>{naira(t.overdueKobo)}</dd>
        </div>
      </dl>
      <div className="mt-3 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <Bar share={t.ratePercent} tone="ok" />
        </div>
        <p className="shrink-0 text-xs font-semibold text-fg">{t.ratePercent}% collected</p>
      </div>
    </li>
  );
}

function AllBranches() {
  const [scope, setScope] = useState<"current" | "all">("current");
  const [attempt, setAttempt] = useState(0);
  const { data, error } = useAnswer<Overview>(`/api/v1/finance/overview?scope=${scope}&n=${attempt}`);
  return (
    <div className="space-y-4">
      <div className="max-w-xs">
        <SelectField
          label="Period"
          value={scope}
          onChange={(e) => setScope(e.target.value as "current" | "all")}
          options={[
            { value: "current", label: "Current term of each branch" },
            { value: "all", label: "All time" },
          ]}
        />
      </div>
      {!data ? (
        <Wait error={error} retry={() => setAttempt((n) => n + 1)} />
      ) : (
        <div className="space-y-4">
          <section aria-labelledby="fo-total">
            <h3 id="fo-total" className="mb-2 text-sm font-semibold text-fg">
              All {data.branches.length} {data.branches.length === 1 ? "branch" : "branches"} together
            </h3>
            <Kpis totals={data.total} />
          </section>
          <section aria-labelledby="fo-by-branch">
            <h3 id="fo-by-branch" className="mb-2 text-sm font-semibold text-fg">
              Branch by branch
            </h3>
            <ul aria-label="Branches" className="grid gap-3 lg:grid-cols-2">
              {data.branches.map((row) => (
                <BranchLine key={row.branchId} row={row} />
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}

/// The Overview tab. With two or more branches to read there is a switch between the branch on screen and all of them side by side.
export function FinanceOverview({
  branchId,
  periods,
  canSeeAll,
}: {
  branchId: string;
  periods: { id: string; label: string; current?: boolean }[];
  canSeeAll: boolean;
}) {
  const [view, setView] = useState<"one" | "all">("one");
  return (
    <div className="space-y-4">
      {canSeeAll && (
        <div role="group" aria-label="What to show" className="inline-flex rounded-xl border border-line bg-surface p-1 text-sm">
          {(
            [
              ["one", "This branch"],
              ["all", "All branches"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={view === id}
              onClick={() => setView(id)}
              className={`min-h-9 rounded-lg px-4 font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                view === id ? "bg-brand-strong text-white" : "text-fg-2 hover:text-fg"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {view === "all" && canSeeAll ? <AllBranches /> : <OneBranch key={branchId} branchId={branchId} periods={periods} />}
    </div>
  );
}
