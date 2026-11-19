"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { TextField } from "@/components/ui/TextField";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { TONE } from "@/components/ui/tone";
import { GENERIC_ERROR, getJson, problemFor, sendJson } from "@/components/auth/postJson";

// Finance > Scholarships (task 0113 S1; the maintainer: "scholarship can be of different types"). The kinds of scholarship a branch gives: a name and a default share of the fees, 1 to 100 (100 is a
// full scholarship). A pupil is given one from Students > the pupil's Actions > Scholarships. A type's share is the default for new scholarships: those already granted keep theirs; an archived
// type is not offered again and the pupils who hold it keep it. The API decides who may do what; this only draws it.

type TypeRow = { id: string; name: string; percent: number; description: string | null; archived: boolean; holders: number };

export function ScholarshipsPanel({ branchId }: { branchId: string }) {
  const [types, setTypes] = useState<TypeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ type: TypeRow | null; key: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const reply = await getJson(`/api/v1/finance/scholarship-types?branchId=${encodeURIComponent(branchId)}`);
    if (reply.ok) {
      setTypes(reply.data!.types as TypeRow[]);
      setError(null);
    } else setError(reply.message ?? GENERIC_ERROR);
  }, [branchId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading the branch's types on arrival and on a branch change is what this effect is for
    void load();
  }, [load]);

  async function archive(type: TypeRow, archived: boolean) {
    setBusy(type.id);
    const reply = await sendJson(`/api/v1/finance/scholarship-types/${type.id}`, "PATCH", { archived });
    setBusy(null);
    if (!reply.ok) return setError(reply.message ?? GENERIC_ERROR);
    setNotice(archived ? `${type.name} is archived. Pupils who hold it keep it.` : `${type.name} is back.`);
    await load();
  }

  const live = (types ?? []).filter((t) => !t.archived);
  const archived = (types ?? []).filter((t) => t.archived);

  return (
    <section aria-labelledby="scholarships-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="scholarships-heading" className="text-lg font-semibold tracking-tight text-fg">
            Scholarships
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-fg-muted">
            The kinds of scholarship this branch gives. A type&apos;s share is the share a new scholarship starts with; each pupil&apos;s
            own can differ. A new invoice takes a live scholarship&apos;s share off; invoices already issued are not changed unless you
            choose Apply to open invoices on the pupil. Scholarships are never counted as money collected.
          </p>
        </div>
        <Button onClick={() => setEditing({ type: null, key: Date.now() })}>New scholarship type</Button>
      </div>
      <div role="status" aria-live="polite" className="empty:hidden">
        {notice && (
          <Alert variant="success" announce={false}>
            {notice}
          </Alert>
        )}
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      {types === null ? (
        !error && <p className="text-sm text-fg-muted">Loading…</p>
      ) : live.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-6 text-center text-sm text-fg-muted">
          No scholarship types yet. Add one (for example Academic merit, 50%, or Hafiz award, 100%), then give it to a pupil.
        </p>
      ) : (
        <ul aria-label="Scholarship types" className="divide-y divide-line rounded-2xl border border-line bg-surface shadow-card">
          {live.map((t) => (
            <TypeItem
              key={t.id}
              type={t}
              busy={busy === t.id}
              onEdit={() => setEditing({ type: t, key: Date.now() })}
              onArchive={() => void archive(t, true)}
            />
          ))}
        </ul>
      )}
      {archived.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-fg">Archived</h3>
          <ul aria-label="Archived scholarship types" className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {archived.map((t) => (
              <TypeItem key={t.id} type={t} busy={busy === t.id} onRestore={() => void archive(t, false)} />
            ))}
          </ul>
        </div>
      )}
      {editing && (
        <TypeDialog
          key={editing.key}
          branchId={branchId}
          type={editing.type}
          onClose={() => setEditing(null)}
          onSaved={async (text) => {
            setEditing(null);
            setNotice(text);
            await load();
          }}
        />
      )}
    </section>
  );
}

function TypeItem({
  type,
  busy,
  onEdit,
  onArchive,
  onRestore,
}: {
  type: TypeRow;
  busy: boolean;
  onEdit?: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="font-semibold wrap-break-word text-fg">{type.name}</p>
        {type.description && <p className="text-sm text-fg-muted">{type.description}</p>}
        <div className="mt-1 flex flex-wrap gap-1.5">
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TONE.brand.chip}`}>
            {type.percent >= 100 ? "Full (100%)" : `${type.percent}% of the fees`}
          </span>
          {!type.archived && (
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TONE.neutral.chip}`}>
              {type.holders} {type.holders === 1 ? "pupil holds it" : "pupils hold it"}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {onEdit && (
          <Button variant="secondary" disabled={busy} onClick={onEdit} aria-label={`Edit ${type.name}`}>
            Edit
          </Button>
        )}
        {onArchive && (
          <Button variant="ghost" loading={busy} onClick={onArchive} aria-label={`Archive ${type.name}`}>
            Archive
          </Button>
        )}
        {onRestore && (
          <Button variant="secondary" loading={busy} onClick={onRestore} aria-label={`Restore ${type.name}`}>
            Restore
          </Button>
        )}
      </div>
    </li>
  );
}

function TypeDialog({
  branchId,
  type,
  onClose,
  onSaved,
}: {
  branchId: string;
  type: TypeRow | null;
  onClose: () => void;
  onSaved: (text: string) => Promise<void>;
}) {
  const [f, setF] = useState({ name: type?.name ?? "", percent: String(type?.percent ?? 100), description: type?.description ?? "" });
  const [problems, setProblems] = useState<Record<string, string | undefined>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setProblems({});
    setProblem(null);
    const share = Number(f.percent);
    const payload = {
      name: f.name.trim(),
      percent: Number.isInteger(share) ? share : f.percent,
      description: f.description.trim() || null,
    };
    const reply = type
      ? await sendJson(`/api/v1/finance/scholarship-types/${type.id}`, "PATCH", payload)
      : await sendJson("/api/v1/finance/scholarship-types", "POST", { branchId, ...payload });
    setPending(false);
    if (reply.ok) return void (await onSaved(`${f.name.trim()} ${type ? "saved" : "added"}.`));
    setProblems({ name: problemFor(reply, "name"), percent: problemFor(reply, "percent"), description: problemFor(reply, "description") });
    setProblem(reply.message ?? GENERIC_ERROR);
  }

  return (
    <Dialog open onClose={onClose} title={type ? `Edit ${type.name}` : "New scholarship type"}>
      <form onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
        <TextField
          label="Name"
          value={f.name}
          onChange={(e) => setF({ ...f, name: e.target.value })}
          error={problems.name}
          maxLength={80}
          autoComplete="off"
          disabled={pending}
        />
        <TextField
          label="Share of the fees (%)"
          type="number"
          inputMode="numeric"
          min={1}
          max={100}
          value={f.percent}
          onChange={(e) => setF({ ...f, percent: e.target.value })}
          error={problems.percent}
          hint="1 to 100. 100 is a full scholarship: the pupil's invoices are settled by it."
          disabled={pending}
        />
        <TextAreaField
          label="Description (optional)"
          value={f.description}
          onChange={(e) => setF({ ...f, description: e.target.value })}
          error={problems.description}
          maxLength={300}
          rows={2}
          disabled={pending}
        />
        {type && (
          <p className="text-xs text-fg-muted">
            A new share applies to scholarships granted from now on; the ones already granted keep theirs.
          </p>
        )}
        {problem && Object.values(problems).every((p) => !p) && <Alert variant="error">{problem}</Alert>}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" loading={pending}>
            {type ? "Save" : "Add type"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
