"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { TONE } from "@/components/ui/tone";
import { GENERIC_ERROR, getJson, problemFor, sendJson } from "@/components/auth/postJson";
import { formatNaira } from "@/lib/finance/format";

// A pupil's scholarships (task 0113 S1), from the pupil's Actions list, for an administrator of the pupil's branch (the API refuses anyone else). The pupil may hold several at once; their live
// shares together may not pass 100%. Granting or raising one offers "Apply to this pupil's open invoices": a new invoice takes a live scholarship off by itself, but invoices already issued are only
// changed when you press it, once per scholarship per invoice. Ending a scholarship never changes invoices already issued.

type Grant = {
  id: string;
  typeId: string;
  typeName: string;
  percent: number;
  startsOn: string | null;
  endsOn: string | null;
  note: string | null;
  endedAt: string | null;
  live: boolean;
  openInvoices: number;
};
type Type = { id: string; name: string; percent: number };

const dayText = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${iso}T00:00:00Z`));
const shareText = (percent: number) => (percent >= 100 ? "Full scholarship" : `${percent}%`);
const when = (g: Grant) =>
  g.endedAt
    ? "Ended"
    : g.startsOn || g.endsOn
      ? `${g.startsOn ? `From ${dayText(g.startsOn)}` : "Until"}${g.endsOn ? ` ${g.startsOn ? "to" : ""} ${dayText(g.endsOn)}` : ""}`.trim()
      : "Until it is ended";

export function PupilScholarshipsDialog({
  pupil,
  onClose,
  onChanged,
}: {
  pupil: { id: string; name: string } | null;
  onClose: () => void;
  onChanged: (text: string) => void;
}) {
  const [grants, setGrants] = useState<Grant[] | null>(null);
  const [types, setTypes] = useState<Type[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ typeId: "", percent: "", startsOn: "", endsOn: "", note: "" });
  const [problems, setProblems] = useState<Record<string, string | undefined>>({});

  const load = useCallback(async (id: string) => {
    const reply = await getJson(`/api/v1/students/${id}/scholarships`);
    if (reply.ok) {
      setGrants(reply.data!.scholarships as Grant[]);
      setTypes(reply.data!.types as Type[]);
      setError(null);
    } else setError(reply.message ?? GENERIC_ERROR);
  }, []);

  useEffect(() => {
    if (!pupil) return;
    /* eslint-disable react-hooks/set-state-in-effect -- a newly opened pupil starts from a clean dialog */
    setGrants(null);
    setEditing(null);
    setError(null);
    setProblems({});
    setForm({ typeId: "", percent: "", startsOn: "", endsOn: "", note: "" });
    /* eslint-enable react-hooks/set-state-in-effect */
    void load(pupil.id);
  }, [pupil, load]);

  if (!pupil)
    return (
      <Dialog open={false} onClose={onClose} title="Scholarships">
        {null}
      </Dialog>
    );
  const base = `/api/v1/students/${pupil.id}/scholarships`;
  const live = (grants ?? []).filter((g) => g.live);
  const before = (grants ?? []).filter((g) => !g.live);
  const total = live.reduce((n, g) => n + g.percent, 0);

  const fail = (reply: { message?: string; details?: { path: string; message: string }[] }) => {
    setProblems({
      typeId: problemFor(reply as never, "typeId"),
      percent: problemFor(reply as never, "percent"),
      startsOn: problemFor(reply as never, "startsOn"),
      endsOn: problemFor(reply as never, "endsOn"),
    });
    setError(reply.message ?? GENERIC_ERROR);
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.typeId) return setProblems({ typeId: "Choose a scholarship type." });
    setBusy("grant");
    setProblems({});
    const reply = await sendJson(base, "POST", {
      typeId: form.typeId,
      ...(form.percent.trim() ? { percent: Number(form.percent) } : {}),
      startsOn: form.startsOn || null,
      endsOn: form.endsOn || null,
      note: form.note.trim() || null,
    });
    setBusy(null);
    if (!reply.ok) return fail(reply);
    setForm({ typeId: "", percent: "", startsOn: "", endsOn: "", note: "" });
    await load(pupil!.id);
    onChanged(`A scholarship was given to ${pupil!.name}.`);
  }

  async function save(g: Grant, event: FormEvent) {
    event.preventDefault();
    setBusy(g.id);
    setProblems({});
    const reply = await sendJson(`${base}/${g.id}`, "PATCH", {
      percent: Number(form.percent),
      startsOn: form.startsOn || null,
      endsOn: form.endsOn || null,
      note: form.note.trim() || null,
    });
    setBusy(null);
    if (!reply.ok) return fail(reply);
    setEditing(null);
    await load(pupil!.id);
    onChanged(`${g.typeName} is saved for ${pupil!.name}. Invoices already issued are not changed.`);
  }

  async function finish(g: Grant) {
    setBusy(g.id);
    const reply = await sendJson(`${base}/${g.id}`, "PATCH", { end: true });
    setBusy(null);
    if (!reply.ok) return setError(reply.message ?? GENERIC_ERROR);
    await load(pupil!.id);
    onChanged(`${g.typeName} has ended for ${pupil!.name}. Invoices already issued keep what it took off.`);
  }

  async function apply(g: Grant) {
    setBusy(`apply-${g.id}`);
    const reply = await sendJson(`${base}/${g.id}/apply`, "POST", {});
    setBusy(null);
    if (!reply.ok) return setError(reply.message ?? GENERIC_ERROR);
    const r = reply.data as { applied: number; settled: number; kobo: number };
    await load(pupil!.id);
    onChanged(
      r.applied === 0
        ? "There was nothing to apply it to."
        : `Applied to ${r.applied} ${r.applied === 1 ? "invoice" : "invoices"} (${formatNaira(r.kobo / 100)} off)${r.settled > 0 ? `; ${r.settled} ${r.settled === 1 ? "is" : "are"} now paid by scholarship` : ""}.`,
    );
  }

  const GrantCard = ({ g }: { g: Grant }) => (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold wrap-break-word text-fg">{g.typeName}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TONE.brand.chip}`}>{shareText(g.percent)}</span>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${g.live ? TONE.ok.chip : TONE.neutral.chip}`}>
              {g.live ? "Live" : g.endedAt ? "Ended" : "Not live today"}
            </span>
          </div>
          <p className="mt-1 text-xs text-fg-muted">{when(g)}</p>
          {g.note && <p className="mt-1 text-sm text-fg-2">{g.note}</p>}
        </div>
        {g.live && (
          <div className="flex flex-wrap gap-2">
            {g.openInvoices > 0 && (
              <Button variant="secondary" loading={busy === `apply-${g.id}`} disabled={busy !== null} onClick={() => void apply(g)}>
                Apply to this pupil&apos;s open invoices ({g.openInvoices})
              </Button>
            )}
            <Button
              variant="secondary"
              disabled={busy !== null}
              onClick={() => {
                setEditing(g.id);
                setProblems({});
                setForm({
                  typeId: g.typeId,
                  percent: String(g.percent),
                  startsOn: g.startsOn ?? "",
                  endsOn: g.endsOn ?? "",
                  note: g.note ?? "",
                });
              }}
              aria-label={`Change ${g.typeName}`}
            >
              Change
            </Button>
            <Button
              variant="danger"
              loading={busy === g.id}
              disabled={busy !== null}
              onClick={() => void finish(g)}
              aria-label={`End ${g.typeName}`}
            >
              End
            </Button>
          </div>
        )}
      </div>
      {editing === g.id && (
        <form
          onSubmit={(e) => void save(g, e)}
          className="space-y-3 rounded-xl border border-line bg-surface-2 p-3"
          aria-label={`Change ${g.typeName}`}
        >
          <Fields form={form} setForm={setForm} problems={problems} disabled={busy !== null} showType={false} types={types} />
          <p className="text-xs text-fg-muted">
            Invoices already issued are not changed. Use Apply to open invoices for ones not yet paid; a scholarship already on an invoice
            is not topped up.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={busy !== null}>
              Cancel
            </Button>
            <Button type="submit" loading={busy === g.id}>
              Save
            </Button>
          </div>
        </form>
      )}
    </li>
  );

  return (
    <Dialog open onClose={onClose} title={`Scholarships of ${pupil.name}`} wide>
      <div className="space-y-6">
        {error && <Alert variant="error">{error}</Alert>}
        <section aria-labelledby="pupil-scholarships" className="space-y-2">
          <h3 id="pupil-scholarships" className="text-sm font-semibold text-fg">
            Scholarships {live.length > 0 ? `(live: ${Math.min(total, 100)}% of the fees)` : ""}
          </h3>
          {grants === null ? (
            <p className="text-sm text-fg-muted">Loading…</p>
          ) : grants.length === 0 ? (
            <p className="text-sm text-fg-muted">No scholarship yet. Give one below.</p>
          ) : (
            <>
              <ul aria-label={`Scholarships of ${pupil.name}`} className="divide-y divide-line">
                {live.map((g) => (
                  <GrantCard key={g.id} g={g} />
                ))}
              </ul>
              {before.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer font-semibold text-fg-2">Ended and past ({before.length})</summary>
                  <ul aria-label="Ended scholarships" className="divide-y divide-line">
                    {before.map((g) => (
                      <GrantCard key={g.id} g={g} />
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </section>
        <section aria-labelledby="give-scholarship" className="space-y-3 rounded-2xl border border-line p-4">
          <h3 id="give-scholarship" className="text-sm font-semibold text-fg">
            Give a scholarship
          </h3>
          {types.length === 0 ? (
            <p className="text-sm text-fg-muted">This branch has no scholarship type yet. Add one under Finance &gt; Scholarships.</p>
          ) : (
            <form onSubmit={(e) => void submit(e)} className="space-y-3" aria-label="Give a scholarship">
              <Fields
                form={form}
                setForm={(next) => {
                  setForm(next);
                }}
                problems={problems}
                disabled={busy !== null}
                showType
                types={types}
              />
              <p className="text-xs text-fg-muted">
                Several scholarships may be held at once, as long as together they do not pass 100%. A new invoice takes a live scholarship
                off by itself; for invoices already issued, press Apply to open invoices afterwards.
              </p>
              <div className="flex justify-end">
                <Button type="submit" loading={busy === "grant"}>
                  Give scholarship
                </Button>
              </div>
            </form>
          )}
        </section>
        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

type FormState = { typeId: string; percent: string; startsOn: string; endsOn: string; note: string };
function Fields({
  form,
  setForm,
  problems,
  disabled,
  showType,
  types,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
  problems: Record<string, string | undefined>;
  disabled: boolean;
  showType: boolean;
  types: Type[];
}) {
  return (
    <>
      {showType && (
        <SelectField
          label="Scholarship type"
          value={form.typeId}
          onChange={(e) => {
            const t = types.find((x) => x.id === e.target.value);
            setForm({ ...form, typeId: e.target.value, percent: t ? String(t.percent) : "" });
          }}
          error={problems.typeId}
          options={[{ value: "", label: "Choose…" }, ...types.map((t) => ({ value: t.id, label: `${t.name} (${t.percent}%)` }))]}
          disabled={disabled}
        />
      )}
      <TextField
        label="Share of the fees (%)"
        type="number"
        inputMode="numeric"
        min={1}
        max={100}
        value={form.percent}
        onChange={(e) => setForm({ ...form, percent: e.target.value })}
        error={problems.percent}
        hint="Starts at the type's share; change it for this pupil if it differs."
        disabled={disabled}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="From (optional)"
          type="date"
          value={form.startsOn}
          onChange={(e) => setForm({ ...form, startsOn: e.target.value })}
          error={problems.startsOn}
          disabled={disabled}
        />
        <TextField
          label="Until (optional)"
          type="date"
          value={form.endsOn}
          onChange={(e) => setForm({ ...form, endsOn: e.target.value })}
          error={problems.endsOn}
          hint="Empty: until it is ended."
          disabled={disabled}
        />
      </div>
      <TextAreaField
        label="Note (optional)"
        value={form.note}
        onChange={(e) => setForm({ ...form, note: e.target.value })}
        maxLength={300}
        rows={2}
        disabled={disabled}
      />
    </>
  );
}
