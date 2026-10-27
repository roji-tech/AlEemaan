"use client";

import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { sendJson } from "@/components/auth/postJson";
import { say } from "@/components/academics/common";

// "The same period on several days": one class, subject, teacher, time and room, repeated on the days ticked (Slice UI1, over POST /timetable/batch). All the
// periods are scheduled together or none are: if any one clashes with a period already there, the server refuses the lot and says which.

const DAYS = [
  { n: 1, label: "Monday" },
  { n: 2, label: "Tuesday" },
  { n: 3, label: "Wednesday" },
  { n: 4, label: "Thursday" },
  { n: 5, label: "Friday" },
];

export function BatchSlotsModal({
  open,
  branchId,
  classArms,
  subjects,
  teachers,
  onClose,
  onSaved,
}: {
  open: boolean;
  branchId: string;
  classArms: { id: string; name: string }[];
  subjects: { id: string; name: string }[];
  teachers: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [classArmId, setClassArmId] = useState(classArms[0]?.id ?? "");
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [staffRecordId, setStaffRecordId] = useState(teachers[0]?.id ?? "");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("09:00");
  const [room, setRoom] = useState("");
  const [days, setDays] = useState<number[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setProblem(null);
    setPending(true);
    const r = await sendJson("/api/v1/timetable/batch", "POST", {
      branchId,
      slots: days.map((dayOfWeek) => ({
        branchId,
        classArmId,
        subjectId,
        staffRecordId,
        dayOfWeek,
        startTime,
        endTime,
        room: room.trim() || null,
      })),
    });
    setPending(false);
    if (r.ok) {
      onSaved();
      return onClose();
    }
    setProblem(
      r.code === "SCHEDULE_CLASH"
        ? `${r.message ?? "One of these periods clashes with one already scheduled."} Nothing was scheduled.`
        : say(r, "That didn't work."),
    );
  }
  const missing = classArms.length === 0 || subjects.length === 0 || teachers.length === 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Schedule the same period on several days"
      description="Tick the days. All of them are scheduled together, or none if one clashes."
    >
      {open && (
        <form onSubmit={submit} noValidate className="space-y-4">
          {missing && <Alert variant="error">Add a class arm, a subject and a teaching staff record on the Academics page first.</Alert>}
          <SelectField
            label="Class arm"
            value={classArmId}
            onChange={(e) => setClassArmId(e.target.value)}
            options={classArms.map((a) => ({ value: a.id, label: a.name }))}
            disabled={pending || missing}
          />
          <SelectField
            label="Subject"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            options={subjects.map((s) => ({ value: s.id, label: s.name }))}
            disabled={pending || missing}
          />
          <SelectField
            label="Teacher"
            value={staffRecordId}
            onChange={(e) => setStaffRecordId(e.target.value)}
            options={teachers.map((t) => ({ value: t.id, label: t.name }))}
            disabled={pending || missing}
          />
          <div className="grid grid-cols-2 gap-4">
            <TextField label="Starts" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} disabled={pending} />
            <TextField label="Ends" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} disabled={pending} />
          </div>
          <TextField
            label="Room (optional)"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            maxLength={50}
            autoComplete="off"
            disabled={pending}
          />
          <fieldset>
            <legend className="mb-2 text-xs font-semibold tracking-wide text-fg-2 uppercase">Days</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {DAYS.map((d) => (
                <label key={d.n} className="flex min-h-11 items-center gap-2 text-sm text-fg">
                  <input
                    type="checkbox"
                    checked={days.includes(d.n)}
                    onChange={(e) => setDays((all) => (e.target.checked ? [...all, d.n].sort() : all.filter((x) => x !== d.n)))}
                    disabled={pending}
                  />
                  {d.label}
                </label>
              ))}
            </div>
          </fieldset>
          {problem && <Alert variant="error">{problem}</Alert>}
          <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" loading={pending} disabled={missing || days.length === 0}>
              {pending ? "Scheduling…" : `Schedule ${days.length || ""} ${days.length === 1 ? "period" : "periods"}`.replace("  ", " ")}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
