"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { getJson, sendJson } from "@/components/auth/postJson";
import { say, type BranchChoice, type Notice } from "@/components/academics/common";

// Assessment schemes and grade scales (Slice P1d, over the P1b API). A scheme says how a mark is built (continuous-assessment parts + exam = 100); a grade
// scale says how a score becomes a letter. Both are edited in place until a result uses them ("Locked"); after that a change is a NEW VERSION. Presentation only.

type Component = { id?: string; name: string; maxScore: number };
type Scheme = {
  id: string;
  classGroupId: string | null;
  classGroupName: string | null;
  name: string;
  totalMax: number;
  examMax: number;
  version: number;
  locked: boolean;
  components: Component[];
};
type Band = { min: number; max: number; letter: string; remark: string };
type Scale = { id: string; name: string; isDefault: boolean; version: number; locked: boolean; bands: Band[] };
type ClassOption = { id: string; name: string };
type Editing = { kind: "scheme"; item: Scheme | null } | { kind: "scale"; item: Scale | null } | null;

const SCHEMES = "/api/v1/academics/assessment-schemes";
const SCALES = "/api/v1/academics/grade-scales";
const fmt = (n: number) => String(Math.round(n * 100) / 100);

export function GradingPanel({ branches }: { branches: BranchChoice[] }) {
  const [branchId, setBranchId] = useState(branches[0].id);
  const branch = branches.find((b) => b.id === branchId) ?? branches[0];
  const [schemes, setSchemes] = useState<Scheme[] | null>(null);
  const [scales, setScales] = useState<Scale[] | null>(null);
  const [template, setTemplate] = useState<Band[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [editing, setEditing] = useState<Editing>(null);

  const load = useCallback(async () => {
    const q = `?branchId=${encodeURIComponent(branchId)}`;
    const [a, b, c] = await Promise.all([getJson(SCHEMES + q), getJson(SCALES + q), getJson(`/api/v1/academics/class-groups${q}`)]);
    const bad = [a, b, c].find((r) => !r.ok);
    if (bad) return setError(say(bad, "Couldn't load this branch."));
    setError(null);
    setSchemes(a.data!.schemes as Scheme[]);
    setScales(b.data!.scales as Scale[]);
    setTemplate(b.data!.template as Band[]);
    setClasses((c.data!.classGroups as ClassOption[]).map((g) => ({ id: g.id, name: g.name })));
  }, [branchId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading data on a branch change is exactly what this effect is for
    setSchemes(null);
    setScales(null);
    void load();
  }, [load]);

  const done = async (text: string) => {
    setEditing(null);
    setNotice({ variant: "success", text });
    await load();
  };
  async function act(path: string, text: string) {
    const reply = await sendJson(path, "POST");
    setNotice(reply.ok ? { variant: "success", text } : { variant: "error", text: say(reply, "That didn't work.") });
    await load();
  }

  return (
    <div className="space-y-8">
      {branches.length > 1 && (
        <SelectField
          label="Branch"
          value={branchId}
          onChange={(e) => {
            setNotice(null);
            setBranchId(e.target.value);
          }}
          options={branches.map((b) => ({ value: b.id, label: b.name }))}
        />
      )}
      <div aria-live="polite" className="empty:hidden">
        {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}
      </div>

      <section aria-labelledby="schemes-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="schemes-heading" className="text-lg font-semibold tracking-tight text-fg">
            Assessment schemes
          </h2>
          {branch.canEdit && <Button onClick={() => setEditing({ kind: "scheme", item: null })}>New scheme</Button>}
        </div>
        <p className="mt-1 text-sm text-fg-muted">
          How a mark is built: continuous-assessment parts plus the exam. A scheme for one class wins over the branch default.
        </p>
        {schemes === null ? (
          <p className="mt-3 text-sm text-fg-muted" aria-busy="true">
            Loading…
          </p>
        ) : schemes.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-line-strong p-6 text-center text-sm text-fg-muted">
            No assessment schemes yet.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {schemes.map((s) => (
              <li key={s.id} className="rounded-2xl border border-line bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-semibold text-fg">
                    {s.name} <span className="text-sm font-normal text-fg-muted">· version {s.version}</span>
                    {s.locked && <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-fg-2">Locked</span>}
                  </p>
                  {branch.canEdit && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => setEditing({ kind: "scheme", item: s })}
                        aria-label={`${s.locked ? "New version of" : "Edit"} ${s.name}`}
                      >
                        {s.locked ? "New version" : "Edit"}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => act(`${SCHEMES}/${s.id}/archive`, `${s.name} archived.`)}
                        aria-label={`Archive ${s.name}`}
                      >
                        Archive
                      </Button>
                    </div>
                  )}
                </div>
                <p className="mt-1 text-sm text-fg-muted">
                  {s.classGroupName ? `For ${s.classGroupName}` : "Branch default"} · out of {fmt(s.totalMax)}
                </p>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {s.components.map((c) => (
                    <li key={c.id ?? c.name} className="rounded-full bg-surface-2 px-3 py-1 text-sm text-fg-2">
                      {c.name} · {fmt(c.maxScore)}
                    </li>
                  ))}
                  <li className="rounded-full bg-surface-2 px-3 py-1 text-sm font-semibold text-fg-2">Exam · {fmt(s.examMax)}</li>
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="scales-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="scales-heading" className="text-lg font-semibold tracking-tight text-fg">
            Grade scales
          </h2>
          {branch.canEdit && <Button onClick={() => setEditing({ kind: "scale", item: null })}>New grade scale</Button>}
        </div>
        <p className="mt-1 text-sm text-fg-muted">How a score becomes a letter. The branch uses its default scale.</p>
        {scales === null ? (
          <p className="mt-3 text-sm text-fg-muted" aria-busy="true">
            Loading…
          </p>
        ) : scales.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-line-strong p-6 text-center text-sm text-fg-muted">
            No grade scales yet.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {scales.map((s) => (
              <li key={s.id} className="rounded-2xl border border-line bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-semibold text-fg">
                    {s.name} <span className="text-sm font-normal text-fg-muted">· version {s.version}</span>
                    {s.isDefault && (
                      <span className="ml-2 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand-fg">Default</span>
                    )}
                    {s.locked && <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-fg-2">Locked</span>}
                  </p>
                  {branch.canEdit && (
                    <div className="flex flex-wrap gap-2">
                      {!s.isDefault && (
                        <Button
                          variant="secondary"
                          onClick={() => act(`${SCALES}/${s.id}/default`, `${s.name} is now the default.`)}
                          aria-label={`Make ${s.name} the default`}
                        >
                          Make default
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        onClick={() => setEditing({ kind: "scale", item: s })}
                        aria-label={`${s.locked ? "New version of" : "Edit"} ${s.name}`}
                      >
                        {s.locked ? "New version" : "Edit"}
                      </Button>
                      {!s.isDefault && (
                        <Button
                          variant="ghost"
                          onClick={() => act(`${SCALES}/${s.id}/archive`, `${s.name} archived.`)}
                          aria-label={`Archive ${s.name}`}
                        >
                          Archive
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                <div
                  role="region"
                  aria-label={`Bands of ${s.name}`}
                  tabIndex={0}
                  className="mt-3 overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <table className="w-full min-w-[22rem] text-left text-sm">
                    <caption className="sr-only">Bands of {s.name}</caption>
                    <thead>
                      <tr className="text-xs tracking-wide text-fg-2 uppercase">
                        <th scope="col" className="py-1 pr-4 font-semibold">
                          From
                        </th>
                        <th scope="col" className="py-1 pr-4 font-semibold">
                          To (below)
                        </th>
                        <th scope="col" className="py-1 pr-4 font-semibold">
                          Grade
                        </th>
                        <th scope="col" className="py-1 font-semibold">
                          Remark
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.bands.map((b) => (
                        <tr key={`${b.min}-${b.letter}`} className="border-t border-line text-fg">
                          <td className="py-1 pr-4">{fmt(b.min)}</td>
                          <td className="py-1 pr-4">{fmt(b.max)}</td>
                          <td className="py-1 pr-4 font-semibold">{b.letter}</td>
                          <td className="py-1">{b.remark}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <SchemeDialog
        key={editing?.kind === "scheme" ? (editing.item?.id ?? "new") : "none"}
        item={editing?.kind === "scheme" ? editing.item : null}
        open={editing?.kind === "scheme"}
        branchId={branchId}
        classes={classes}
        onClose={() => setEditing(null)}
        onDone={done}
      />
      <ScaleDialog
        key={editing?.kind === "scale" ? (editing.item?.id ?? "new") : "none-scale"}
        item={editing?.kind === "scale" ? editing.item : null}
        open={editing?.kind === "scale"}
        branchId={branchId}
        template={template}
        onClose={() => setEditing(null)}
        onDone={done}
      />
    </div>
  );
}

function FormButtons({ onClose, pending, label }: { onClose: () => void; pending: boolean; label: string }) {
  return (
    <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
      <Button variant="ghost" onClick={onClose} disabled={pending}>
        Cancel
      </Button>
      <Button type="submit" loading={pending}>
        {pending ? "Working…" : label}
      </Button>
    </div>
  );
}

const num = (s: string) => (s.trim() === "" ? NaN : Number(s));

function SchemeDialog({
  item,
  open,
  branchId,
  classes,
  onClose,
  onDone,
}: {
  item: Scheme | null;
  open: boolean;
  branchId: string;
  classes: ClassOption[];
  onClose: () => void;
  onDone: (text: string) => Promise<void>;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [classGroupId, setClassGroupId] = useState(item?.classGroupId ?? "");
  const [exam, setExam] = useState(item ? fmt(item.examMax) : "");
  const [rows, setRows] = useState(item ? item.components.map((c) => ({ name: c.name, max: fmt(c.maxScore) })) : [{ name: "", max: "" }]);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const total = 100;
  const sum = rows.reduce((t, r) => t + (Number.isFinite(num(r.max)) ? num(r.max) : 0), 0) + (Number.isFinite(num(exam)) ? num(exam) : 0);
  const locked = item?.locked ?? false;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const components = rows.map((r) => ({ name: r.name, maxScore: num(r.max) }));
    if (!name.trim()) return setProblem("Give a name.");
    if (components.some((c) => !Number.isFinite(c.maxScore)) || !Number.isFinite(num(exam))) return setProblem("Give every part a mark.");
    setProblem(null);
    setPending(true);
    const fields = { name, examMax: num(exam), components };
    const reply = !item
      ? await sendJson(SCHEMES, "POST", { branchId, classGroupId: classGroupId || null, ...fields })
      : locked
        ? await sendJson(`${SCHEMES}/${item.id}/versions`, "POST", fields)
        : await sendJson(`${SCHEMES}/${item.id}`, "PATCH", fields);
    setPending(false);
    if (reply.ok) await onDone(`${name} ${!item ? "created" : locked ? "saved as a new version" : "saved"}.`);
    else setProblem(say(reply, "That didn't work."));
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      title={!item ? "New assessment scheme" : locked ? `New version of ${item.name}` : `Edit ${item.name}`}
      description={
        locked
          ? "Results already use this scheme, so it can't change. Saving makes a new version; the old one stays for the results that used it."
          : undefined
      }
    >
      {open && (
        <form onSubmit={submit} noValidate className="space-y-4">
          <TextField
            label="Scheme name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            autoComplete="off"
            disabled={pending}
          />
          {!item && (
            <SelectField
              label="Applies to"
              value={classGroupId}
              onChange={(e) => setClassGroupId(e.target.value)}
              options={[{ value: "", label: "Branch default (every class)" }, ...classes.map((c) => ({ value: c.id, label: c.name }))]}
              disabled={pending}
            />
          )}
          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold tracking-wide text-fg-2 uppercase">Continuous assessment parts</legend>
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-[1fr_6rem_auto] items-end gap-2">
                <TextField
                  label={`Part ${i + 1} name`}
                  value={r.name}
                  onChange={(e) => setRows((all) => all.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                  maxLength={40}
                  autoComplete="off"
                  disabled={pending}
                />
                <TextField
                  label={`Part ${i + 1} marks`}
                  inputMode="decimal"
                  value={r.max}
                  onChange={(e) => setRows((all) => all.map((x, j) => (j === i ? { ...x, max: e.target.value } : x)))}
                  autoComplete="off"
                  disabled={pending}
                />
                <Button
                  variant="ghost"
                  onClick={() => setRows((all) => all.filter((_, j) => j !== i))}
                  disabled={pending || rows.length === 1}
                  aria-label={`Remove part ${i + 1}`}
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button
              variant="secondary"
              onClick={() => setRows((all) => [...all, { name: "", max: "" }])}
              disabled={pending || rows.length >= 10}
            >
              Add a part
            </Button>
          </fieldset>
          <TextField
            label="Exam marks"
            inputMode="decimal"
            value={exam}
            onChange={(e) => setExam(e.target.value)}
            autoComplete="off"
            disabled={pending}
          />
          <p role="status" className={`text-sm ${Math.abs(sum - total) < 0.005 ? "text-fg-muted" : "font-semibold text-danger-fg"}`}>
            Adds up to {fmt(sum)} of {total}.
          </p>
          {problem && <Alert variant="error">{problem}</Alert>}
          <FormButtons onClose={onClose} pending={pending} label={!item ? "Create scheme" : locked ? "Save new version" : "Save"} />
        </form>
      )}
    </Dialog>
  );
}

function ScaleDialog({
  item,
  open,
  branchId,
  template,
  onClose,
  onDone,
}: {
  item: Scale | null;
  open: boolean;
  branchId: string;
  template: Band[];
  onClose: () => void;
  onDone: (text: string) => Promise<void>;
}) {
  const asRows = (bands: Band[]) => bands.map((b) => ({ min: fmt(b.min), max: fmt(b.max), letter: b.letter, remark: b.remark }));
  const [name, setName] = useState(item?.name ?? "");
  const [rows, setRows] = useState(item ? asRows(item.bands) : [{ min: "0", max: "100", letter: "", remark: "" }]);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const locked = item?.locked ?? false;
  const set = (i: number, key: "min" | "max" | "letter" | "remark", value: string) =>
    setRows((all) => all.map((x, j) => (j === i ? { ...x, [key]: value } : x)));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!name.trim()) return setProblem("Give a name.");
    const bands = rows.map((r) => ({ min: num(r.min), max: num(r.max), letter: r.letter, remark: r.remark }));
    if (bands.some((b) => !Number.isFinite(b.min) || !Number.isFinite(b.max))) return setProblem("Give every band a from and a to score.");
    setProblem(null);
    setPending(true);
    const reply = !item
      ? await sendJson(SCALES, "POST", { branchId, name, bands })
      : locked
        ? await sendJson(`${SCALES}/${item.id}/versions`, "POST", { name, bands })
        : await sendJson(`${SCALES}/${item.id}`, "PATCH", { name, bands });
    setPending(false);
    if (reply.ok) await onDone(`${name} ${!item ? "created" : locked ? "saved as a new version" : "saved"}.`);
    else setProblem(say(reply, "That didn't work."));
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      title={!item ? "New grade scale" : locked ? `New version of ${item.name}` : `Edit ${item.name}`}
      description={
        locked
          ? "Results already use this scale, so it can't change. Saving makes a new version."
          : "Each band runs from its lower score up to, but not including, its upper score. Bands must cover 0 to 100 with no gaps."
      }
    >
      {open && (
        <form onSubmit={submit} noValidate className="space-y-4">
          <TextField
            label="Scale name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            autoComplete="off"
            disabled={pending}
          />
          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold tracking-wide text-fg-2 uppercase">Bands</legend>
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[5rem_5rem_5rem_1fr_auto]">
                <TextField
                  label={`Band ${i + 1} from`}
                  inputMode="decimal"
                  value={r.min}
                  onChange={(e) => set(i, "min", e.target.value)}
                  autoComplete="off"
                  disabled={pending}
                />
                <TextField
                  label={`Band ${i + 1} to`}
                  inputMode="decimal"
                  value={r.max}
                  onChange={(e) => set(i, "max", e.target.value)}
                  autoComplete="off"
                  disabled={pending}
                />
                <TextField
                  label={`Band ${i + 1} grade`}
                  value={r.letter}
                  onChange={(e) => set(i, "letter", e.target.value)}
                  maxLength={4}
                  autoComplete="off"
                  disabled={pending}
                />
                <TextField
                  label={`Band ${i + 1} remark`}
                  value={r.remark}
                  onChange={(e) => set(i, "remark", e.target.value)}
                  maxLength={40}
                  autoComplete="off"
                  disabled={pending}
                />
                <Button
                  variant="ghost"
                  onClick={() => setRows((all) => all.filter((_, j) => j !== i))}
                  disabled={pending || rows.length === 1}
                  aria-label={`Remove band ${i + 1}`}
                >
                  Remove
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => setRows((all) => [...all, { min: "", max: "", letter: "", remark: "" }])}
                disabled={pending || rows.length >= 12}
              >
                Add a band
              </Button>
              {template.length > 0 && (
                <Button variant="secondary" onClick={() => setRows(asRows(template))} disabled={pending}>
                  Use the WAEC-style template
                </Button>
              )}
            </div>
          </fieldset>
          {problem && <Alert variant="error">{problem}</Alert>}
          <FormButtons onClose={onClose} pending={pending} label={!item ? "Create scale" : locked ? "Save new version" : "Save"} />
        </form>
      )}
    </Dialog>
  );
}
