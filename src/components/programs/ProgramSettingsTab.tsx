"use client";

import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { TextField } from "@/components/ui/TextField";
import { sendJson } from "@/components/auth/postJson";
import type { RunChange } from "@/components/programs/ProgramPage";
import type { ProgramDetail } from "@/components/programs/model";
import { offText } from "@/components/programs/attendance-model";

// The program's own settings (task 0043, slice P3): its attendance switch - the third level under the school's and the branch's - and the percentage under which a person is flagged.
// Presentation only: a super admin or a program admin may save; the API checks again.

export function ProgramSettingsTab({ program, run }: { program: ProgramDetail; run: RunChange }) {
  const attendance = program.attendance;
  const [enabled, setEnabled] = useState(attendance.enabled);
  const [percent, setPercent] = useState(String(attendance.lowPercent));
  const [saving, setSaving] = useState(false);
  const number = Number(percent);
  const valid = Number.isInteger(number) && number >= 1 && number <= 100;
  const unchanged = enabled === attendance.enabled && number === attendance.lowPercent;
  const may = program.can.settings;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || unchanged) return;
    setSaving(true);
    await run(
      () =>
        sendJson(`/api/v1/programs/${encodeURIComponent(program.id)}/settings`, "PATCH", {
          ...(enabled !== attendance.enabled ? { attendanceEnabled: enabled } : {}),
          ...(number !== attendance.lowPercent ? { lowAttendancePercent: number } : {}),
        }),
      "The settings were saved.",
      "That didn't save.",
    );
    setSaving(false);
  }

  return (
    <section aria-labelledby="program-settings" className="space-y-4 rounded-2xl border border-line bg-surface p-4">
      <h2 id="program-settings" className="text-lg font-semibold text-fg">
        Attendance settings
      </h2>
      <p className="text-sm text-fg-muted">
        Attendance is on for this program only when the school, the branch and the program all have it on. The school&apos;s and each
        branch&apos;s switch are on the Settings page; this is the program&apos;s own. Turning it off hides the Attendance tab and stops new
        marks; what was recorded stays.
      </p>
      <Alert variant={attendance.on ? "success" : "warning"}>
        <span data-testid="attendance-state">{offText(attendance)}</span>
      </Alert>
      <form onSubmit={submit} className="space-y-4" noValidate>
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
        {may ? (
          <div className="flex justify-end">
            <Button type="submit" loading={saving} disabled={!valid || unchanged}>
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
