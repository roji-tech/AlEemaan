"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useBranchSelection } from "@/components/ui/useBranchSelection";
import { useNotice } from "@/components/ui/Toaster";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { SwitchField } from "@/components/ui/SwitchField";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { Dialog } from "@/components/ui/Dialog";
import { InfoTip } from "@/components/ui/InfoTip";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { getJson, sendJson } from "@/components/auth/postJson";
import { say, type BranchChoice } from "@/components/academics/common";
import { UNCONFIRMED_NOTICE } from "@/lib/results/scale-confirmation";

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
  /// Made for a result template or the school-wide scheme, not a branch or class scheme (task 0128).
  hosted?: boolean;
  archived?: boolean;
  supersedesId?: string | null;
  components: Component[];
};
export type Band = { min: number; max: number; letter: string; remark: string };
export type Scale = {
  id: string;
  name: string;
  isDefault: boolean;
  version: number;
  locked: boolean;
  unconfirmed?: boolean;
  archived?: boolean;
  supersedesId?: string | null;
  bands: Band[];
};
type ClassOption = { id: string; name: string };
type Editing = { kind: "scheme"; item: Scheme | null } | { kind: "scale"; item: Scale | null } | null;

const SCHEMES = "/api/v1/academics/assessment-schemes";
const SCALES = "/api/v1/academics/grade-scales";
const fmt = (n: number) => String(Math.round(n * 100) / 100);

/// `betweenSections` is shown after the Assessment schemes section and before the Grade scales section, so the tab reads: Assessment schemes, Scheme levels, Grade scales (the maintainer, 2026-11-26:
/// "make Grade scales the last"). The scheme-levels panel is its own component with its own state; the page passes it here to sit in that place.
export function GradingPanel({ branches, betweenSections }: { branches: BranchChoice[]; betweenSections?: ReactNode }) {
  const [branchId, setBranchId] = useBranchSelection(branches);
  const branch = branches.find((b) => b.id === branchId) ?? branches[0];
  const [schemes, setSchemes] = useState<Scheme[] | null>(null);
  const [scales, setScales] = useState<Scale[] | null>(null);
  const [template, setTemplate] = useState<Band[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useNotice();
  const [editing, setEditing] = useState<Editing>(null);
  // Archived schemes and scales are listed only when asked (task 0128), each with Restore.
  const [showArchived, setShowArchived] = useState(false);
  // A scheme asked to be deleted for good (task 0128), confirmed in a dialog; the server says why when something holds it.
  const [deleting, setDeleting] = useState<Scheme | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  const load = useCallback(async () => {
    const q = `?branchId=${encodeURIComponent(branchId)}`;
    const withArchived = showArchived ? `${q}&includeArchived=true` : q;
    const [a, b, c] = await Promise.all([
      getJson(SCHEMES + withArchived),
      getJson(SCALES + withArchived),
      getJson(`/api/v1/academics/class-groups${q}`),
    ]);
    const bad = [a, b, c].find((r) => !r.ok);
    if (bad) return setError(say(bad, "Couldn't load this branch."));
    setError(null);
    setSchemes(a.data!.schemes as Scheme[]);
    setScales(b.data!.scales as Scale[]);
    setTemplate(b.data!.template as Band[]);
    setClasses((c.data!.classGroups as ClassOption[]).map((g) => ({ id: g.id, name: g.name })));
  }, [branchId, showArchived]);

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
  async function act(path: string, text: string, body?: unknown) {
    const reply = await sendJson(path, "POST", body);
    setNotice(reply.ok ? { variant: "success", text } : { variant: "error", text: say(reply, "That didn't work.") });
    await load();
  }

  // Offered on a scheme that looks unconnected: not used by marks (locked), not made for a template or the school-wide level, not in a version history. The server decides, and says why when it refuses.
  const canDelete = (x: Scheme) => !x.locked && !x.hosted && !x.supersedesId && !replacedSchemes.has(x.id);
  function askDelete(x: Scheme) {
    setNotice(null);
    setDeleteError(null);
    setDeleting(x);
  }
  async function confirmDelete() {
    if (!deleting) return;
    setDeletePending(true);
    setDeleteError(null);
    const reply = await sendJson(`${SCHEMES}/${deleting.id}`, "DELETE");
    setDeletePending(false);
    if (!reply.ok) return setDeleteError(say(reply, "That didn't work."));
    const gone = deleting.name;
    setDeleting(null);
    setNotice({ variant: "success", text: `${gone} deleted.` });
    await load();
  }

  // A newer version replaced these (so they cannot come back), and whether the branch has a default scheme of its own (task 0128).
  const replacedSchemes = new Set((schemes ?? []).flatMap((x) => (x.supersedesId ? [x.supersedesId] : [])));
  const replacedScales = new Set((scales ?? []).flatMap((x) => (x.supersedesId ? [x.supersedesId] : [])));
  const noBranchDefault = schemes !== null && !schemes.some((x) => !x.archived && !x.hosted && x.classGroupId === null);

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
      <SwitchField
        label="Show archived schemes and grade scales"
        checked={showArchived}
        onChange={(e) => {
          setSchemes(null);
          setScales(null);
          setShowArchived(e.target.checked);
        }}
      />

      <CollapsibleSection
        id="grading-schemes"
        title="Assessment schemes"
        info={<InfoTip tip="academics.schemes" />}
        actions={
          branch.canEdit && (
            <div className="flex flex-wrap gap-2">
              {noBranchDefault && (
                <Button
                  variant="secondary"
                  onClick={() => act(`${SCHEMES}/from-school-wide`, "The school-wide scheme is now this branch's default.", { branchId })}
                >
                  Use the school-wide scheme
                </Button>
              )}
              <Button onClick={() => setEditing({ kind: "scheme", item: null })}>New scheme</Button>
            </div>
          )
        }
      >
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
                    {s.archived && (
                      <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-fg-2">Archived</span>
                    )}
                  </p>
                  {branch.canEdit && s.archived && (
                    <div className="flex flex-wrap items-center gap-2">
                      <RestoreButton
                        name={s.name}
                        replaced={replacedSchemes.has(s.id)}
                        onRestore={() => act(`${SCHEMES}/${s.id}/restore`, `${s.name} restored.`)}
                      />
                      {canDelete(s) && <DeleteButton name={s.name} onDelete={() => askDelete(s)} />}
                    </div>
                  )}
                  {branch.canEdit && !s.archived && (
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
                      {canDelete(s) && <DeleteButton name={s.name} onDelete={() => askDelete(s)} />}
                    </div>
                  )}
                </div>
                <p className="mt-1 text-sm text-fg-muted">
                  {s.classGroupName
                    ? `For ${s.classGroupName}`
                    : s.hosted
                      ? "Made for a template or the school-wide scheme"
                      : "Branch default"}{" "}
                  · out of {fmt(s.totalMax)}
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
      </CollapsibleSection>

      {betweenSections}

      <CollapsibleSection
        id="grading-scales"
        title="Grade scales"
        info={<InfoTip tip="academics.scales" />}
        actions={branch.canEdit && <Button onClick={() => setEditing({ kind: "scale", item: null })}>New grade scale</Button>}
      >
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
                    {s.archived && (
                      <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-fg-2">Archived</span>
                    )}
                    {s.unconfirmed && (
                      <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-fg-2">Unconfirmed</span>
                    )}
                  </p>
                  {branch.canEdit && s.archived && (
                    <RestoreButton
                      name={s.name}
                      replaced={replacedScales.has(s.id)}
                      onRestore={() => act(`${SCALES}/${s.id}/restore`, `${s.name} restored.`)}
                    />
                  )}
                  {branch.canEdit && !s.archived && (
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
                {s.unconfirmed && !s.archived && (
                  <Alert variant="warning">
                    <span className="block">{UNCONFIRMED_NOTICE}.</span>
                    <span className="mt-1 block text-xs">
                      Results graded on it cannot be published until it is confirmed. Check the bands below, edit them if they are wrong,
                      then confirm.
                    </span>
                    {branch.canEdit && (
                      <span className="mt-2 block">
                        <Button
                          variant="secondary"
                          onClick={() => act(`${SCALES}/${s.id}/confirm`, `${s.name} confirmed.`)}
                          aria-label={`Confirm the bands of ${s.name}`}
                        >
                          Confirm these bands
                        </Button>
                      </span>
                    )}
                  </Alert>
                )}
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
      </CollapsibleSection>

      <Dialog
        open={deleting !== null}
        onClose={() => (deletePending ? undefined : setDeleting(null))}
        title={deleting ? `Delete ${deleting.name}?` : "Delete scheme"}
        description="This removes the scheme for good. Nothing uses it, so no marks are affected. To keep it for later, archive it instead."
      >
        {deleteError && <Alert variant="error">{deleteError}</Alert>}
        <div className="flex flex-col-reverse gap-3 pt-3 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => setDeleting(null)} disabled={deletePending}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={confirmDelete}
            loading={deletePending}
            aria-label={deleting ? `Delete ${deleting.name} for good` : "Delete"}
          >
            {deletePending ? "Deleting…" : "Delete for good"}
          </Button>
        </div>
      </Dialog>
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
              info="scheme.applies"
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

/// The grade scale editor (also used by Results > Templates, task 0116). `seed` starts a NEW scale from another's bands (a duplicate); `usedBy` names the classes that grade on the scale being
/// changed, so nobody changes it without seeing who it reaches.
export function ScaleDialog({
  item,
  seed = null,
  usedBy = [],
  open,
  branchId,
  template,
  onClose,
  onDone,
}: {
  item: Scale | null;
  seed?: Scale | null;
  usedBy?: readonly string[];
  open: boolean;
  branchId: string;
  template: Band[];
  onClose: () => void;
  onDone: (text: string) => Promise<void>;
}) {
  const asRows = (bands: Band[]) => bands.map((b) => ({ min: fmt(b.min), max: fmt(b.max), letter: b.letter, remark: b.remark }));
  const start = item ?? seed;
  const [name, setName] = useState(item ? item.name : seed ? `${seed.name} copy`.slice(0, 60) : "");
  const [rows, setRows] = useState(start ? asRows(start.bands) : [{ min: "0", max: "100", letter: "", remark: "" }]);
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
      title={!item ? (seed ? `Duplicate ${seed.name}` : "New grade scale") : locked ? `New version of ${item.name}` : `Edit ${item.name}`}
      description={
        locked
          ? "Results already use this scale, so it can't change. Saving makes a new version."
          : "Each band runs from its lower score up to, but not including, its upper score. Bands must cover 0 to 100 with no gaps."
      }
    >
      {open && (
        <form onSubmit={submit} noValidate className="space-y-4">
          {item && (
            <p className="rounded-xl border border-line bg-surface-2 p-3 text-sm text-fg-2">
              {usedBy.length > 0 ? `Classes grading on this scale: ${usedBy.join(", ")}. ` : "No class grades on this scale by itself. "}
              Marks already entered keep the letters they were given; a change reaches the marks entered after it
              {locked ? ", as a new version" : ""}.
            </p>
          )}
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

/// "Restore" for an archived scheme or grade scale (task 0128). One that a newer version replaced cannot come back: it says so instead (the newer version is the live one).
function DeleteButton({ name, onDelete }: { name: string; onDelete: () => void }) {
  return (
    <Button variant="ghost" onClick={onDelete} aria-label={`Delete ${name}`}>
      Delete
    </Button>
  );
}

function RestoreButton({ name, replaced, onRestore }: { name: string; replaced: boolean; onRestore: () => void }) {
  if (replaced) return <p className="text-sm text-fg-muted">Replaced by a newer version</p>;
  return (
    <Button variant="secondary" onClick={onRestore} aria-label={`Restore ${name}`}>
      Restore
    </Button>
  );
}
