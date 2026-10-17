"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { SelectField } from "@/components/ui/SelectField";
import { getJson, sendJson } from "@/components/auth/postJson";
import { say, type BranchChoice, type Notice } from "@/components/academics/common";
import { ReportCard, type Card } from "@/components/results/ReportCard";

// Report cards (Slice P2d, over P2c): pick a term, a class arm and a student, read the card, print it. Administrators may preview with unpublished results and write
// the two remarks (frozen by the server once a result is published). Everything outside the card itself is hidden when printing.

type Term = { id: string; label: string; session: string; isCurrent: boolean };
type Group = { id: string; name: string; arms: { id: string; name: string }[] };
type Student = { id: string; name: string; admissionNo: string };

export function CardsPanel({ branches }: { branches: BranchChoice[] }) {
  const [branchId, setBranchId] = useState(branches[0].id);
  const branch = branches.find((b) => b.id === branchId) ?? branches[0];
  const [terms, setTerms] = useState<Term[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [periodId, setPeriodId] = useState("");
  const [armId, setArmId] = useState("");
  const [students, setStudents] = useState<Student[] | null>(null);
  const [studentId, setStudentId] = useState("");
  const [preview, setPreview] = useState(false);
  const [card, setCard] = useState<Card | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading the terms and classes on a branch change is exactly what this effect is for
    setCard(null);
    setStudents(null);
    setArmId("");
    setStudentId("");
    const q = encodeURIComponent(branchId);
    void Promise.all([
      getJson(`/api/v1/academics/result-sheets/options?branchId=${q}`),
      getJson(`/api/v1/academics/class-groups?branchId=${q}`),
    ]).then(([o, g]) => {
      if (!live) return;
      const bad = [o, g].find((r) => !r.ok);
      if (bad)
        return setError(
          bad.status === 403 ? "You don't have access to report cards in this branch." : say(bad, "Couldn't load this branch."),
        );
      setError(null);
      const periods = (o.data as unknown as { periods: Term[] }).periods;
      setTerms(periods);
      setPeriodId((periods.find((p) => p.isCurrent) ?? periods[0])?.id ?? "");
      setGroups((g.data as unknown as { classGroups: Group[] }).classGroups);
    });
    return () => {
      live = false;
    };
  }, [branchId]);

  useEffect(() => {
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading the roster when the class or term changes is exactly what this effect is for
    setCard(null);
    setStudentId("");
    if (!armId || !periodId) return setStudents(null);
    void getJson(`/api/v1/academics/arms/${armId}/roster?periodId=${periodId}`).then((r) => {
      if (!live) return;
      if (!r.ok) return setError(say(r, "Couldn't load the students."));
      setError(null);
      setStudents((r.data as unknown as { students: Student[] }).students);
    });
    return () => {
      live = false;
    };
  }, [armId, periodId]);

  const loadCard = useCallback(async () => {
    if (!studentId || !periodId) return setCard(null);
    const r = await getJson(`/api/v1/students/${studentId}/report-card?periodId=${periodId}${preview ? "&preview=true" : ""}`);
    if (!r.ok) {
      setCard(null);
      return setError(say(r, "Couldn't load this report card."));
    }
    setError(null);
    setCard((r.data as unknown as { card: Card }).card);
  }, [studentId, periodId, preview]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading the card when the choice changes is exactly what this effect is for
    void loadCard();
  }, [loadCard]);

  const armOptions = groups.flatMap((g) => g.arms.map((a) => ({ value: a.id, label: `${g.name} ${a.name}` })));
  const published = card?.subjects.some((s) => s.status === "PUBLISHED" || s.status === "LOCKED") ?? false;

  return (
    <div className="space-y-6">
      <div className="space-y-6 print:hidden">
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
        <div className="grid gap-3 sm:grid-cols-3">
          <SelectField
            label="Term"
            value={periodId}
            onChange={(e) => setPeriodId(e.target.value)}
            options={terms.map((p) => ({ value: p.id, label: `${p.label} · ${p.session}` }))}
          />
          <SelectField
            label="Class"
            value={armId}
            onChange={(e) => setArmId(e.target.value)}
            options={[{ value: "", label: "Choose…" }, ...armOptions]}
          />
          <SelectField
            label="Student"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            disabled={!students}
            options={[
              { value: "", label: students ? (students.length ? "Choose…" : "No students in this class") : "Choose a class first" },
              ...(students ?? []).map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
        </div>
        {branch.canEdit && (
          <CheckboxField
            label="Preview with results that are not published yet"
            checked={preview}
            onChange={(e) => setPreview(e.target.checked)}
          />
        )}
      </div>

      {card && (
        <>
          <div className="flex justify-end print:hidden">
            <Button variant="secondary" onClick={() => window.print()}>
              Print this report card
            </Button>
          </div>
          <ReportCard card={card} origin={typeof window === "undefined" ? "" : window.location.origin} />
          {branch.canEdit && (
            <RemarksForm
              key={`${card.student.id}|${card.period.id}`}
              studentId={card.student.id}
              periodId={card.period.id}
              initial={card.remarks}
              frozen={published}
              onSaved={async (text) => {
                setNotice({ variant: "success", text });
                await loadCard();
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

function RemarksForm({
  studentId,
  periodId,
  initial,
  frozen,
  onSaved,
}: {
  studentId: string;
  periodId: string;
  initial: { teacher: string | null; principal: string | null };
  frozen: boolean;
  onSaved: (text: string) => Promise<void>;
}) {
  const [teacher, setTeacher] = useState(initial.teacher ?? "");
  const [principal, setPrincipal] = useState(initial.principal ?? "");
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || frozen) return;
    setPending(true);
    setProblem(null);
    const reply = await sendJson(`/api/v1/students/${studentId}/report-remarks`, "PUT", {
      periodId,
      teacherRemark: teacher.trim() || null,
      principalRemark: principal.trim() || null,
    });
    setPending(false);
    if (reply.ok) await onSaved("Remarks saved.");
    else setProblem(say(reply, "That didn't work."));
  }
  const area =
    "min-h-24 w-full rounded-xl border border-line bg-field p-3 text-sm text-fg disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none";
  return (
    <form
      onSubmit={submit}
      noValidate
      className="space-y-3 rounded-2xl border border-line bg-surface p-4 print:hidden"
      aria-label="Remarks"
    >
      <h3 className="text-sm font-semibold text-fg">Remarks</h3>
      {frozen && <p className="text-sm text-fg-muted">This student&apos;s results are published, so the remarks can no longer change.</p>}
      <div>
        <label htmlFor="teacher-remark" className="mb-1.5 block text-xs font-semibold tracking-wide text-fg-2 uppercase">
          Teacher&apos;s remark
        </label>
        <textarea
          id="teacher-remark"
          className={area}
          value={teacher}
          maxLength={500}
          disabled={frozen || pending}
          onChange={(e) => setTeacher(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="principal-remark" className="mb-1.5 block text-xs font-semibold tracking-wide text-fg-2 uppercase">
          Principal&apos;s remark
        </label>
        <textarea
          id="principal-remark"
          className={area}
          value={principal}
          maxLength={500}
          disabled={frozen || pending}
          onChange={(e) => setPrincipal(e.target.value)}
        />
      </div>
      {problem && <Alert variant="error">{problem}</Alert>}
      <div className="flex justify-end">
        <Button type="submit" disabled={frozen} loading={pending}>
          Save remarks
        </Button>
      </div>
    </form>
  );
}
