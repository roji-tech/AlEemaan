"use client";

import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { TextField } from "@/components/ui/TextField";
import { sendJson } from "@/components/auth/postJson";
import type { RunChange } from "@/components/programs/ProgramPage";
import type { ProgramDetail } from "@/components/programs/model";
import { offText } from "@/components/programs/attendance-model";
import { bandsProblem } from "@/lib/programs/assessment-rules";
import { wordingProblem } from "@/lib/programs/completion-rules";

// The program's own settings (task 0043): the switches that are the third level under the school's and the branch's (attendance, assessments), the percentage under which a person is
// flagged, and the grade bands. Presentation only: a super admin or a program admin may save; the API checks again.

type BandText = { name: string; from: string };

export function ProgramSettingsTab({ program, run }: { program: ProgramDetail; run: RunChange }) {
  const attendance = program.attendance;
  const assessments = program.assessments;
  const [enabled, setEnabled] = useState(attendance.enabled);
  const [percent, setPercent] = useState(String(attendance.lowPercent));
  const fees = program.fees;
  const [useAssessments, setUseAssessments] = useState(assessments.enabled);
  const [useFees, setUseFees] = useState(fees.enabled);
  const completion = program.completion;
  const [certTitle, setCertTitle] = useState(completion?.certTitle ?? "");
  const [certBody, setCertBody] = useState(completion?.certBody ?? "");
  const [signers, setSigners] = useState<{ name: string; title: string }[]>(completion?.certSignatories ?? []);
  const [minAverage, setMinAverage] = useState(completion?.minAverage != null ? String(completion.minAverage) : "");
  const [requirePassed, setRequirePassed] = useState(completion?.requirePassed ?? false);
  const [noCertOwing, setNoCertOwing] = useState(completion?.noCertWhileOwing ?? false);
  const [bands, setBands] = useState<BandText[]>(assessments.bands.map((b) => ({ name: b.name, from: String(b.from) })));
  const [saving, setSaving] = useState(false);
  const number = Number(percent);
  const valid = Number.isInteger(number) && number >= 1 && number <= 100;
  const parsedBands = bands.map((b) => ({ name: b.name.trim(), from: Number(b.from) }));
  const bandsText = bands.some((b) => b.name.trim() === "" || b.from.trim() === "" || !Number.isFinite(Number(b.from)))
    ? "Give every grade a name and a starting percentage."
    : bandsProblem(parsedBands);
  const sameBands = JSON.stringify(parsedBands) === JSON.stringify(assessments.bands);
  const may = program.can.settings;
  const avg = minAverage.trim() === "" ? null : Number(minAverage.replace(",", "."));
  const avgProblem =
    avg !== null && !(Number.isFinite(avg) && avg >= 0 && avg <= 100) ? "Enter a percentage from 0 to 100, or leave it empty." : null;
  const cleanSigners = signers.map((s) => ({ name: s.name.trim(), title: s.title.trim() })).filter((s) => s.name !== "");
  const wordingText = completion ? wordingProblem({ title: certTitle.trim(), body: certBody.trim(), signatories: cleanSigners }) : null;
  const sameCompletion =
    !completion ||
    (certTitle.trim() === completion.certTitle &&
      certBody.trim() === completion.certBody &&
      JSON.stringify(cleanSigners) === JSON.stringify(completion.certSignatories) &&
      avg === completion.minAverage &&
      requirePassed === completion.requirePassed &&
      noCertOwing === completion.noCertWhileOwing);

  const unchanged =
    enabled === attendance.enabled &&
    number === attendance.lowPercent &&
    useAssessments === assessments.enabled &&
    useFees === fees.enabled &&
    sameBands &&
    sameCompletion;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || bandsText || unchanged || avgProblem || wordingText) return;
    setSaving(true);
    await run(
      () =>
        sendJson(`/api/v1/programs/${encodeURIComponent(program.id)}/settings`, "PATCH", {
          ...(enabled !== attendance.enabled ? { attendanceEnabled: enabled } : {}),
          ...(number !== attendance.lowPercent ? { lowAttendancePercent: number } : {}),
          ...(useAssessments !== assessments.enabled ? { assessmentsEnabled: useAssessments } : {}),
          ...(!sameBands ? { gradeBands: parsedBands } : {}),
          ...(useFees !== fees.enabled ? { feesEnabled: useFees } : {}),
          ...(completion && !sameCompletion
            ? {
                certTitle: certTitle.trim(),
                certBody: certBody.trim(),
                certSignatories: cleanSigners,
                completionMinAverage: avg,
                completionRequirePassed: requirePassed,
                noCertWhileOwing: noCertOwing,
              }
            : {}),
        }),
      "The settings were saved.",
      "That didn't save.",
    );
    setSaving(false);
  }

  return (
    <section aria-labelledby="program-settings" className="space-y-4 rounded-2xl border border-line bg-surface p-4">
      <h2 id="program-settings" className="text-lg font-semibold text-fg">
        Program settings
      </h2>
      <form onSubmit={submit} className="space-y-6" noValidate>
        <fieldset className="space-y-3">
          <legend className="text-base font-semibold text-fg">Attendance</legend>
          <p className="text-sm text-fg-muted">
            Attendance is on for this program only when the school, the branch and the program all have it on. The school&apos;s and each
            branch&apos;s switch are on the Settings page; this is the program&apos;s own. Turning it off hides the Attendance tab and stops
            new marks; what was recorded stays.
          </p>
          <Alert variant={attendance.on ? "success" : "warning"}>
            <span data-testid="attendance-state">{offText(attendance)}</span>
          </Alert>
          <CheckboxField
            label="Take attendance in this program"
            checked={enabled}
            disabled={!may}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <TextField
            label="Flag a person under (%)"
            inputMode="numeric"
            value={percent}
            disabled={!may}
            maxLength={3}
            hint="Present and late over the sessions held. Excused sessions are left out. From 1 to 100."
            error={valid ? null : "Enter a whole number from 1 to 100."}
            onChange={(e) => setPercent(e.target.value.replace(/\D/g, ""))}
          />
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-base font-semibold text-fg">Assessments</legend>
          <p className="text-sm text-fg-muted">
            Assessments start off: a program that does not use them shows no tab. They are on only when the school, the branch and the
            program all have them on.
          </p>
          <Alert variant={assessments.on ? "success" : "info"}>
            <span data-testid="assessments-state">{offText(assessments, "Assessments are")}</span>
          </Alert>
          <CheckboxField
            label="Use assessments in this program"
            checked={useAssessments}
            disabled={!may}
            onChange={(e) => setUseAssessments(e.target.checked)}
          />
          <div className="space-y-2">
            <p className="text-sm font-semibold text-fg">Grades</p>
            <p className="text-xs text-fg-muted">
              Optional. A grade starts at a percentage; one must start at 0. With none, a result is shown as a percentage.
            </p>
            {bands.map((band, index) => (
              <div key={index} className="grid grid-cols-[1fr_6rem_auto] items-end gap-2">
                <TextField
                  label={`Grade ${index + 1} name`}
                  value={band.name}
                  maxLength={30}
                  disabled={!may}
                  onChange={(e) => setBands((c) => c.map((b, i) => (i === index ? { ...b, name: e.target.value } : b)))}
                />
                <TextField
                  label={`Grade ${index + 1} from (%)`}
                  inputMode="decimal"
                  value={band.from}
                  disabled={!may}
                  onChange={(e) => setBands((c) => c.map((b, i) => (i === index ? { ...b, from: e.target.value } : b)))}
                />
                {may && (
                  <Button
                    variant="ghost"
                    aria-label={`Remove grade ${index + 1}`}
                    onClick={() => setBands((c) => c.filter((_, i) => i !== index))}
                  >
                    Remove
                  </Button>
                )}
              </div>
            ))}
            {may && bands.length < 10 && (
              <Button variant="secondary" onClick={() => setBands((c) => [...c, { name: "", from: "" }])}>
                Add a grade
              </Button>
            )}
            {bands.length > 0 && bandsText && <p className="text-sm text-danger-fg">{bandsText}</p>}
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-base font-semibold text-fg">Fees</legend>
          <p className="text-sm text-fg-muted">
            Fees start off: a program with no fees shows no tab. They are on only when the school, the branch and the program all have them
            on. A program&apos;s invoices and receipts are its own; the school&apos;s class fees are not affected.
          </p>
          <Alert variant={fees.on ? "success" : "info"}>
            <span data-testid="fees-state">{offText(fees, "Fees are")}</span>
          </Alert>
          <CheckboxField
            label="Charge fees in this program"
            checked={useFees}
            disabled={!may}
            onChange={(e) => setUseFees(e.target.checked)}
          />
        </fieldset>

        {completion && (
          <fieldset className="space-y-3">
            <legend className="text-base font-semibold text-fg">Completion and certificates</legend>
            <p className="text-sm text-fg-muted">
              The completion rule is optional: with none, anyone taking part can be completed. A person who does not meet it can still be
              completed with an override and a reason, which is kept.
            </p>
            <TextField
              label="Average of at least (%)"
              inputMode="decimal"
              value={minAverage}
              disabled={!may}
              hint="Over the published assessments. Leave empty for no average."
              error={avgProblem}
              onChange={(e) => setMinAverage(e.target.value)}
            />
            <CheckboxField
              label="Every required assessment must be passed"
              checked={requirePassed}
              disabled={!may}
              onChange={(e) => setRequirePassed(e.target.checked)}
            />
            <CheckboxField
              label="Do not issue a certificate while fees are owed"
              checked={noCertOwing}
              disabled={!may}
              onChange={(e) => setNoCertOwing(e.target.checked)}
            />
            <TextField
              label="Certificate title"
              value={certTitle}
              maxLength={80}
              disabled={!may}
              onChange={(e) => setCertTitle(e.target.value)}
            />
            <TextAreaField
              label="Certificate wording"
              value={certBody}
              maxLength={600}
              rows={4}
              disabled={!may}
              hint="Plain text. Use {name}, {program}, {from}, {to} and {school}. A certificate keeps the wording it was issued with."
              error={wordingText}
              onChange={(e) => setCertBody(e.target.value)}
            />
            {signers.map((s, index) => (
              <div key={index} className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <TextField
                  label={`Signatory ${index + 1} name`}
                  value={s.name}
                  maxLength={60}
                  disabled={!may}
                  onChange={(e) => setSigners((c) => c.map((x, i) => (i === index ? { ...x, name: e.target.value } : x)))}
                />
                <TextField
                  label={`Signatory ${index + 1} title`}
                  value={s.title}
                  maxLength={60}
                  disabled={!may}
                  onChange={(e) => setSigners((c) => c.map((x, i) => (i === index ? { ...x, title: e.target.value } : x)))}
                />
                {may && (
                  <Button
                    variant="ghost"
                    aria-label={`Remove signatory ${index + 1}`}
                    onClick={() => setSigners((c) => c.filter((_, i) => i !== index))}
                  >
                    Remove
                  </Button>
                )}
              </div>
            ))}
            {may && signers.length < 2 && (
              <Button variant="secondary" onClick={() => setSigners((c) => [...c, { name: "", title: "" }])}>
                Add a signatory
              </Button>
            )}
          </fieldset>
        )}

        {may ? (
          <div className="flex justify-end">
            <Button
              type="submit"
              loading={saving}
              disabled={!valid || Boolean(bandsText) || unchanged || Boolean(avgProblem) || Boolean(wordingText)}
            >
              Save settings
            </Button>
          </div>
        ) : (
          <p className="text-xs text-fg-muted">
            Only a super admin or a program admin can change these while the program is a draft or active.
          </p>
        )}
      </form>
    </section>
  );
}
