"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { getJson, sendJson } from "@/components/auth/postJson";
import { say } from "@/components/academics/common";
import { TRAIT_SCALE, MAX_DAYS } from "@/lib/results/report-traits-rules";
import { classLabel } from "@/lib/academics/class-label";

// Trait ratings and attendance of one pupil for one term (task 0116), entered from the report card screen: each trait of the pupil's template rated 1 to 5, and the term's attendance numbers
// (a blank number means "use the register's"). An administrator or the pupil's class teacher may enter; everyone else reads. Presentation only: the API checks who, the template and the lock.

type Sheet = {
  student: { id: string; name: string };
  period: { id: string; label: string };
  class: { group: string; arm: string } | null;
  template: { id: string; name: string };
  groups: { id: string; title: string; showSign: boolean; traits: { id: string; name: string; rating: number | null }[] }[];
  attendance: { entered: Numbers; register: Numbers };
  dates: { termStarts: string; schoolClosed: string | null; nextTermStarts: string | null };
  locked: boolean;
  canEdit: boolean;
};
type Numbers = { timesOpen: number | null; timesPresent: number | null; timesAbsent: number | null };
const ATT: { key: keyof Numbers; label: string }[] = [
  { key: "timesOpen", label: "Times school opened" },
  { key: "timesPresent", label: "Times present" },
  { key: "timesAbsent", label: "Times absent" },
];
const text = (n: number | null) => (n === null ? "" : String(n));

export function TraitsDialog({
  studentId,
  periodId,
  onClose,
  onSaved,
}: {
  studentId: string;
  periodId: string;
  onClose: () => void;
  onSaved: (text: string) => void | Promise<void>;
}) {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [ratings, setRatings] = useState<Record<string, string>>({});
  const [att, setAtt] = useState<Record<keyof Numbers, string>>({ timesOpen: "", timesPresent: "", timesAbsent: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void getJson(`/api/v1/students/${encodeURIComponent(studentId)}/report-traits?periodId=${encodeURIComponent(periodId)}`).then(
      (reply) => {
        if (!live) return;
        if (!reply.ok) return setError(say(reply, "Couldn't load this pupil's traits."));
        const s = (reply.data as unknown as { sheet: Sheet }).sheet;
        setSheet(s);
        setRatings(Object.fromEntries(s.groups.flatMap((g) => g.traits.map((t) => [t.id, t.rating === null ? "" : String(t.rating)]))));
        setAtt({
          timesOpen: text(s.attendance.entered.timesOpen),
          timesPresent: text(s.attendance.entered.timesPresent),
          timesAbsent: text(s.attendance.entered.timesAbsent),
        });
      },
    );
    return () => {
      live = false;
    };
  }, [studentId, periodId]);

  async function save() {
    if (!sheet || busy) return;
    setBusy(true);
    setError(null);
    const changes = sheet.groups
      .flatMap((g) => g.traits)
      .filter((t) => (ratings[t.id] ?? "") !== (t.rating === null ? "" : String(t.rating)))
      .map((t) => ({ traitId: t.id, rating: ratings[t.id] === "" ? null : Number(ratings[t.id]) }));
    const toNumber = (v: string) => (v.trim() === "" ? null : Number(v));
    const was = sheet.attendance.entered;
    const next: Numbers = {
      timesOpen: toNumber(att.timesOpen),
      timesPresent: toNumber(att.timesPresent),
      timesAbsent: toNumber(att.timesAbsent),
    };
    const attChanged = JSON.stringify(was) !== JSON.stringify(next);
    if (next.timesOpen !== null && Number.isNaN(next.timesOpen)) {
      setBusy(false);
      return setError(`Use whole numbers from 0 to ${MAX_DAYS}.`);
    }
    if (changes.length > 0) {
      const reply = await sendJson(`/api/v1/students/${encodeURIComponent(studentId)}/report-traits`, "PUT", {
        periodId,
        ratings: changes,
      });
      if (!reply.ok) {
        setBusy(false);
        return setError(say(reply, "The ratings could not be saved."));
      }
    }
    if (attChanged) {
      const reply = await sendJson(`/api/v1/students/${encodeURIComponent(studentId)}/report-attendance`, "PUT", { periodId, ...next });
      if (!reply.ok) {
        setBusy(false);
        return setError(say(reply, "The attendance could not be saved."));
      }
    }
    setBusy(false);
    await onSaved(changes.length === 0 && !attChanged ? "Nothing to save." : `Traits and attendance saved for ${sheet.student.name}.`);
  }

  const readOnly = !!sheet && !sheet.canEdit;
  return (
    <Dialog
      open
      onClose={onClose}
      title={sheet ? `Traits and attendance of ${sheet.student.name}` : "Traits and attendance"}
      description={
        sheet
          ? `${sheet.period.label}${sheet.class ? ` · ${classLabel(sheet.class.group, sheet.class.arm)}` : ""} · template ${sheet.template.name}`
          : undefined
      }
      wide
    >
      <div className="mt-4 space-y-4">
        {!sheet && !error && (
          <p className="text-sm text-fg-muted" aria-busy="true">
            Loading…
          </p>
        )}
        {sheet && readOnly && (
          <Alert variant="info">
            {sheet.locked
              ? "This pupil's results for the term are published, so these can't change."
              : "Only an administrator or this pupil's class teacher can enter these. You can read them."}
          </Alert>
        )}
        {sheet && sheet.groups.length === 0 && <p className="text-sm text-fg-muted">This pupil&apos;s template has no traits to rate.</p>}
        {sheet?.groups.map((g) => (
          <fieldset key={g.id} className="rounded-xl border border-line p-3">
            <legend className="px-1 text-sm font-semibold text-fg">{g.title}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {g.traits.map((t) => (
                <SelectField
                  key={t.id}
                  label={t.name}
                  value={ratings[t.id] ?? ""}
                  disabled={readOnly}
                  onChange={(e) => setRatings((all) => ({ ...all, [t.id]: e.target.value }))}
                  options={[
                    { value: "", label: "Not rated" },
                    ...TRAIT_SCALE.map((r) => ({ value: String(r.rating), label: `${r.rating} ${r.label}` })),
                  ]}
                />
              ))}
            </div>
          </fieldset>
        ))}
        {sheet && (
          <fieldset className="rounded-xl border border-line p-3">
            <legend className="px-1 text-sm font-semibold text-fg">Attendance</legend>
            <p className="mb-2 text-xs text-fg-muted">
              Leave a number blank to use the register&apos;s. Nothing is made up: with no number and no register the card shows a dash.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {ATT.map((a) => (
                <TextField
                  key={a.key}
                  label={a.label}
                  inputMode="numeric"
                  value={att[a.key]}
                  disabled={readOnly}
                  onChange={(e) => setAtt((all) => ({ ...all, [a.key]: e.target.value.replace(/[^0-9]/g, "").slice(0, 3) }))}
                  hint={
                    sheet.attendance.register[a.key] === null
                      ? "No register for this term"
                      : `Register: ${sheet.attendance.register[a.key]}`
                  }
                />
              ))}
            </div>
          </fieldset>
        )}
        {error && <Alert variant="error">{error}</Alert>}
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            {readOnly ? "Close" : "Cancel"}
          </Button>
          {sheet && !readOnly && (
            <Button loading={busy} onClick={() => void save()}>
              Save
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
