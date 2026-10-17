"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import { getJson, sendJson } from "@/components/auth/postJson";
import { say, type BranchChoice, type Notice } from "@/components/academics/common";

// Enter marks (Slice P2d, over the P2a/P2b APIs): the grid for one subject in one arm and term. The total and letter beside each row are computed here from the
// scheme and scale FOR DISPLAY while the teacher types; the server recomputes everything on save and is the truth. Rows past DRAFT are read-only with their status.

type Option = {
  periods: { id: string; label: string; session: string; isCurrent: boolean }[];
  pairs: { classArmId: string; armName: string; subjectId: string; subjectName: string }[];
};
type Band = { min: number; max: number; letter: string; remark: string };
type Sheet = {
  period: { id: string; label: string; session: string };
  classArm: { id: string; name: string; classGroupName: string };
  subject: { id: string; name: string };
  scheme: { id: string; name: string; totalMax: number; examMax: number; components: { name: string; max: number }[] };
  scale: { id: string; bands: Band[] };
  students: {
    id: string;
    name: string;
    admissionNo: string;
    result: {
      id: string;
      status: string;
      parts: { name: string; score: number }[];
      exam: number;
      total: number;
      gradeLetter: string;
      gradeRemark: string;
    } | null;
  }[];
};
type Cells = { parts: string[]; exam: string };

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  APPROVED: "Approved",
  PUBLISHED: "Published",
  LOCKED: "Locked",
};
const fmt = (n: number) => String(Math.round(n * 100) / 100);
const parse = (text: string): number | null => (text.trim() === "" || !/^\d+(\.\d{1,2})?$/.test(text.trim()) ? null : Number(text.trim()));

function bandFor(bands: Band[], percent: number): Band | null {
  const top = bands.reduce((m, b) => (b.max > m ? b.max : m), 0);
  return bands.find((b) => (percent >= b.min && percent < b.max) || (percent === top && b.max === top && percent >= b.min)) ?? null;
}

export function EntryPanel({ branches }: { branches: BranchChoice[] }) {
  const [branchId, setBranchId] = useState(branches[0].id);
  const [options, setOptions] = useState<Option | null>(null);
  const [periodId, setPeriodId] = useState("");
  const [pair, setPair] = useState("");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [cells, setCells] = useState<Record<string, Cells>>({});
  const [initial, setInitial] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading the options on a branch change is exactly what this effect is for
    setOptions(null);
    setSheet(null);
    setPair("");
    void getJson(`/api/v1/academics/result-sheets/options?branchId=${encodeURIComponent(branchId)}`).then((r) => {
      if (!live) return;
      if (!r.ok) return setError(r.status === 403 ? "You don't enter marks in this branch." : say(r, "Couldn't load your classes."));
      setError(null);
      const o = r.data as unknown as Option;
      setOptions(o);
      setPeriodId((o.periods.find((p) => p.isCurrent) ?? o.periods[0])?.id ?? "");
    });
    return () => {
      live = false;
    };
  }, [branchId]);

  const [armId, subjectId] = pair.split("|");
  const load = useCallback(async () => {
    if (!periodId || !armId || !subjectId) return setSheet(null);
    const r = await getJson(`/api/v1/academics/result-sheets?periodId=${periodId}&classArmId=${armId}&subjectId=${subjectId}`);
    if (!r.ok) {
      setSheet(null);
      return setError(say(r, "Couldn't load this sheet."));
    }
    setError(null);
    const s = (r.data as unknown as { sheet: Sheet }).sheet;
    setSheet(s);
    const next: Record<string, Cells> = {};
    for (const st of s.students) {
      next[st.id] = {
        parts: s.scheme.components.map((c) => {
          const found = st.result?.parts.find((p) => p.name === c.name);
          return found ? fmt(found.score) : "";
        }),
        exam: st.result ? fmt(st.result.exam) : "",
      };
    }
    setCells(next);
    setInitial(JSON.stringify(next));
  }, [periodId, armId, subjectId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading the sheet when the choice changes is exactly what this effect is for
    void load();
  }, [load]);

  const dirty = JSON.stringify(cells) !== initial;
  const editable = (st: Sheet["students"][number]) => !st.result || st.result.status === "DRAFT";

  const rows = useMemo(() => {
    if (!sheet) return [];
    return sheet.students.map((st) => {
      const c = cells[st.id] ?? { parts: [], exam: "" };
      const partNums = c.parts.map(parse);
      const examNum = parse(c.exam);
      const filled = c.parts.filter((p) => p.trim() !== "").length + (c.exam.trim() !== "" ? 1 : 0);
      const invalid = [
        ...c.parts.map((p, i) => p.trim() !== "" && (partNums[i] === null || partNums[i]! > sheet.scheme.components[i].max)),
        c.exam.trim() !== "" && (examNum === null || examNum > sheet.scheme.examMax),
      ];
      const complete = filled === c.parts.length + 1 && !invalid.some(Boolean);
      let total: number | null = null;
      let band: Band | null = null;
      if (complete) {
        total = Math.round((partNums.reduce<number>((t, n) => t + (n ?? 0), 0) + (examNum ?? 0)) * 100) / 100;
        band = bandFor(sheet.scale.bands, Math.round((total / sheet.scheme.totalMax) * 10000) / 100);
      }
      return { st, c, invalid, filled, complete, total, band, blank: filled === 0, partial: filled > 0 && !complete };
    });
  }, [sheet, cells]);

  const problems = rows.filter((r) => editable(r.st) && (r.partial || r.invalid.some(Boolean)));

  async function save() {
    if (!sheet || pending || problems.length > 0) return;
    setPending(true);
    setNotice(null);
    const entries = rows
      .filter((r) => editable(r.st) && r.complete)
      .map((r) => ({
        studentId: r.st.id,
        parts: Object.fromEntries(sheet.scheme.components.map((c, i) => [c.name, Number(r.c.parts[i])])),
        exam: Number(r.c.exam),
      }));
    const removeStudentIds = rows.filter((r) => editable(r.st) && r.blank && r.st.result).map((r) => r.st.id);
    const reply = await sendJson("/api/v1/academics/result-sheets", "PUT", {
      periodId,
      classArmId: armId,
      subjectId,
      entries,
      removeStudentIds,
    });
    setPending(false);
    if (!reply.ok) return setNotice({ variant: "error", text: say(reply, "That didn't work.") });
    const d = reply.data as { created: number; updated: number; removed: number };
    setNotice({ variant: "success", text: `Saved: ${d.created} added, ${d.updated} changed, ${d.removed} removed.` });
    await load();
  }

  async function submit() {
    if (!sheet || pending || dirty) return;
    const ids = sheet.students.flatMap((s) => (s.result?.status === "DRAFT" ? [s.result.id] : []));
    if (ids.length === 0) return;
    setPending(true);
    setNotice(null);
    const reply = await sendJson("/api/v1/academics/results/transition", "POST", { action: "submit", resultIds: ids });
    setPending(false);
    setNotice(
      reply.ok
        ? { variant: "success", text: `${ids.length} ${ids.length === 1 ? "result" : "results"} submitted for review.` }
        : { variant: "error", text: say(reply, "That didn't work.") },
    );
    await load();
  }

  const draftCount = sheet?.students.filter((s) => s.result?.status === "DRAFT").length ?? 0;
  const setCell = (id: string, patch: (c: Cells) => Cells) => setCells((all) => ({ ...all, [id]: patch(all[id]) }));

  return (
    <div className="space-y-6">
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

      {options && options.pairs.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
          You are not assigned to any subject in this branch yet. Ask an administrator to assign you on the Academics page.
        </p>
      ) : options && options.periods.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
          There is no active session with terms yet, so no marks can be entered.
        </p>
      ) : options ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            label="Term"
            value={periodId}
            onChange={(e) => setPeriodId(e.target.value)}
            options={options.periods.map((p) => ({ value: p.id, label: `${p.label} · ${p.session}` }))}
          />
          <SelectField
            label="Class and subject"
            value={pair}
            onChange={(e) => {
              setNotice(null);
              setPair(e.target.value);
            }}
            options={[
              { value: "", label: "Choose…" },
              ...options.pairs.map((p) => ({ value: `${p.classArmId}|${p.subjectId}`, label: `${p.armName} · ${p.subjectName}` })),
            ]}
          />
        </div>
      ) : null}

      {sheet && (
        <section aria-labelledby="grid-heading">
          <h2 id="grid-heading" className="text-lg font-semibold tracking-tight text-fg">
            {sheet.classArm.classGroupName} {sheet.classArm.name} · {sheet.subject.name}
          </h2>
          <p className="mt-1 text-sm text-fg-muted">
            {sheet.scheme.name}: {sheet.scheme.components.map((c) => `${c.name} ${fmt(c.max)}`).join(", ")}, exam{" "}
            {fmt(sheet.scheme.examMax)} — out of {fmt(sheet.scheme.totalMax)}. The total and grade shown are a preview; the school&apos;s
            record is made when you save.
          </p>
          {sheet.students.length === 0 ? (
            <p className="mt-3 rounded-2xl border border-dashed border-line-strong p-6 text-center text-sm text-fg-muted">
              No students are enrolled in this class for this term.
            </p>
          ) : (
            <div
              role="region"
              aria-label="Marks entry"
              tabIndex={0}
              className="mt-3 overflow-x-auto rounded-2xl border border-line bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <table className="w-full min-w-[40rem] text-left text-sm">
                <caption className="sr-only">Marks for {sheet.subject.name}</caption>
                <thead>
                  <tr className="text-xs tracking-wide text-fg-2 uppercase">
                    <th scope="col" className="p-3 font-semibold">
                      Student
                    </th>
                    {sheet.scheme.components.map((c) => (
                      <th key={c.name} scope="col" className="p-3 font-semibold">
                        {c.name} <span className="font-normal normal-case">/{fmt(c.max)}</span>
                      </th>
                    ))}
                    <th scope="col" className="p-3 font-semibold">
                      Exam <span className="font-normal normal-case">/{fmt(sheet.scheme.examMax)}</span>
                    </th>
                    <th scope="col" className="p-3 font-semibold">
                      Total
                    </th>
                    <th scope="col" className="p-3 font-semibold">
                      Grade
                    </th>
                    <th scope="col" className="p-3 font-semibold">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const canEdit = editable(r.st);
                    const locked = r.st.result && !canEdit;
                    return (
                      <tr key={r.st.id} className="border-t border-line align-top text-fg">
                        <th scope="row" className="p-3 text-left font-medium">
                          {r.st.name}
                        </th>
                        {sheet.scheme.components.map((c, i) => (
                          <td key={c.name} className="p-2">
                            <input
                              aria-label={`${r.st.name} ${c.name}`}
                              inputMode="decimal"
                              value={r.c.parts[i] ?? ""}
                              readOnly={!canEdit}
                              aria-invalid={r.invalid[i] || undefined}
                              onChange={(e) =>
                                setCell(r.st.id, (x) => ({ ...x, parts: x.parts.map((p, j) => (j === i ? e.target.value : p)) }))
                              }
                              className={`min-h-11 w-20 rounded-lg border bg-field px-2 text-sm text-fg read-only:bg-surface-2 ${r.invalid[i] ? "border-danger-icon" : "border-line"}`}
                            />
                          </td>
                        ))}
                        <td className="p-2">
                          <input
                            aria-label={`${r.st.name} Exam`}
                            inputMode="decimal"
                            value={r.c.exam}
                            readOnly={!canEdit}
                            aria-invalid={r.invalid[sheet.scheme.components.length] || undefined}
                            onChange={(e) => setCell(r.st.id, (x) => ({ ...x, exam: e.target.value }))}
                            className={`min-h-11 w-20 rounded-lg border bg-field px-2 text-sm text-fg read-only:bg-surface-2 ${r.invalid[sheet.scheme.components.length] ? "border-danger-icon" : "border-line"}`}
                          />
                        </td>
                        <td className="p-3 tabular-nums">{r.total !== null ? fmt(r.total) : locked ? fmt(r.st.result!.total) : "—"}</td>
                        <td className="p-3 font-semibold">{r.band?.letter ?? (locked ? r.st.result!.gradeLetter : "—")}</td>
                        <td className="p-3 text-xs text-fg-muted">
                          {r.st.result
                            ? STATUS_LABEL[r.st.result.status]
                            : r.partial || r.invalid.some(Boolean)
                              ? "Needs attention"
                              : "Not entered"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {problems.length > 0 && (
            <p role="status" className="mt-3 text-sm font-semibold text-danger-fg">
              {problems.length} {problems.length === 1 ? "student has" : "students have"} missing or out-of-range marks:{" "}
              {problems
                .slice(0, 3)
                .map((p) => p.st.name)
                .join(", ")}
              {problems.length > 3 ? "…" : ""}. Fill every part and the exam, or clear the row.
            </p>
          )}
          {sheet.students.length > 0 && (
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={save} disabled={!dirty || problems.length > 0} loading={pending}>
                Save drafts
              </Button>
              <Button onClick={submit} disabled={dirty || draftCount === 0 || pending}>
                Submit {draftCount > 0 ? draftCount : ""} for review
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
