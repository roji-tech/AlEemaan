"use client";

import { useState, useId } from "react";
import { DAYS_OF_WEEK, getDayName, isValidTimeRange, findSlotClashes, type TimetableClash } from "@/lib/timetable/rules";

export interface SlotDto {
  id: string;
  branchId: string;
  classArmId: string;
  subjectId: string;
  staffRecordId: string;
  dayOfWeek: number;
  periodNumber?: number | null;
  startTime: string;
  endTime: string;
  room?: string | null;
  classArm?: { id: string; name: string };
  subject?: { id: string; name: string; code?: string | null };
  staffRecord?: { id: string; firstName: string; lastName: string };
}

export interface SlotEditModalProps {
  branchId: string;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  initialSlot?: SlotDto | null;
  initialDay?: number;
  existingSlots: SlotDto[];
  classArms: { id: string; name: string }[];
  subjects: { id: string; name: string; code?: string | null }[];
  teachers: { id: string; name: string }[];
}

export function SlotEditModal({
  branchId,
  isOpen,
  onClose,
  onSaved,
  initialSlot,
  initialDay,
  existingSlots,
  classArms,
  subjects,
  teachers,
}: SlotEditModalProps) {
  const formId = useId();
  const [dayOfWeek, setDayOfWeek] = useState<number>(initialSlot?.dayOfWeek ?? initialDay ?? 1);
  const [classArmId, setClassArmId] = useState<string>(initialSlot?.classArmId ?? classArms[0]?.id ?? "");
  const [subjectId, setSubjectId] = useState<string>(initialSlot?.subjectId ?? subjects[0]?.id ?? "");
  const [staffRecordId, setStaffRecordId] = useState<string>(initialSlot?.staffRecordId ?? teachers[0]?.id ?? "");
  const [startTime, setStartTime] = useState<string>(initialSlot?.startTime ?? "08:00");
  const [endTime, setEndTime] = useState<string>(initialSlot?.endTime ?? "09:00");
  const [periodNumber, setPeriodNumber] = useState<string>(initialSlot?.periodNumber ? String(initialSlot.periodNumber) : "");
  const [room, setRoom] = useState<string>(initialSlot?.room ?? "");

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Real-time live clash preview
  const candidate = {
    id: initialSlot?.id,
    dayOfWeek,
    classArmId,
    subjectId,
    staffRecordId,
    startTime,
    endTime,
    room: room.trim() || null,
  };

  const isRangeValid = isValidTimeRange(startTime, endTime);
  const liveClashes: TimetableClash[] = isRangeValid ? findSlotClashes(candidate, existingSlots) : [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isRangeValid) {
      setError("Start time must be strictly before end time.");
      return;
    }

    if (liveClashes.length > 0) {
      setError(`Cannot save: ${liveClashes[0].message}`);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = {
        branchId,
        classArmId,
        subjectId,
        staffRecordId,
        dayOfWeek,
        periodNumber: periodNumber ? parseInt(periodNumber, 10) : null,
        startTime,
        endTime,
        room: room.trim() || null,
      };

      const url = initialSlot ? `/api/v1/timetable/${initialSlot.id}` : "/api/v1/timetable";
      const method = initialSlot ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to save timetable slot.");
      }

      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save slot.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!initialSlot) return;
    if (!window.confirm("Are you sure you want to remove this timetable slot?")) return;

    setDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/v1/timetable/${initialSlot.id}?branchId=${branchId}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to delete timetable slot.");
      }

      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete slot.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${formId}-title`}
    >
      <div className="w-full max-w-lg rounded-2xl border border-line bg-surface p-6 shadow-xl space-y-5">
        <div className="flex items-center justify-between border-b border-line pb-4">
          <h2 id={`${formId}-title`} className="text-lg font-semibold text-fg">
            {initialSlot ? "Edit Timetable Slot" : "Schedule New Timetable Slot"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-ring"
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-danger-line bg-danger-bg p-3 text-xs text-danger-text" role="alert">
            {error}
          </div>
        )}

        {liveClashes.length > 0 && (
          <div className="rounded-xl border border-warn-line bg-warn-bg p-3 text-xs text-warn-fg space-y-1">
            <p className="font-semibold text-warn-icon">⚠️ Schedule Conflict Detected</p>
            {liveClashes.map((c, i) => (
              <p key={i}>• {c.message}</p>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${formId}-day`} className="block text-xs font-medium text-fg-muted mb-1">
                Day of Week
              </label>
              <select
                id={`${formId}-day`}
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(parseInt(e.target.value, 10))}
                className="w-full rounded-xl border border-line bg-field px-3 py-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-ring"
              >
                {DAYS_OF_WEEK.map((d) => (
                  <option key={d} value={d}>
                    {getDayName(d)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor={`${formId}-period`} className="block text-xs font-medium text-fg-muted mb-1">
                Period Number (Optional)
              </label>
              <input
                id={`${formId}-period`}
                type="number"
                min="1"
                max="12"
                placeholder="e.g. 1, 2, 3"
                value={periodNumber}
                onChange={(e) => setPeriodNumber(e.target.value)}
                className="w-full rounded-xl border border-line bg-field px-3 py-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-ring"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${formId}-start`} className="block text-xs font-medium text-fg-muted mb-1">
                Start Time (HH:MM)
              </label>
              <input
                id={`${formId}-start`}
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
                className="w-full rounded-xl border border-line bg-field px-3 py-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-ring"
              />
            </div>

            <div>
              <label htmlFor={`${formId}-end`} className="block text-xs font-medium text-fg-muted mb-1">
                End Time (HH:MM)
              </label>
              <input
                id={`${formId}-end`}
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
                className="w-full rounded-xl border border-line bg-field px-3 py-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-ring"
              />
            </div>
          </div>

          <div>
            <label htmlFor={`${formId}-arm`} className="block text-xs font-medium text-fg-muted mb-1">
              Class Arm
            </label>
            <select
              id={`${formId}-arm`}
              value={classArmId}
              onChange={(e) => setClassArmId(e.target.value)}
              required
              className="w-full rounded-xl border border-line bg-field px-3 py-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-ring"
            >
              {classArms.map((arm) => (
                <option key={arm.id} value={arm.id}>
                  {arm.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${formId}-subject`} className="block text-xs font-medium text-fg-muted mb-1">
                Subject
              </label>
              <select
                id={`${formId}-subject`}
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                required
                className="w-full rounded-xl border border-line bg-field px-3 py-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-ring"
              >
                {subjects.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.name} {sub.code ? `(${sub.code})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor={`${formId}-teacher`} className="block text-xs font-medium text-fg-muted mb-1">
                Teacher
              </label>
              <select
                id={`${formId}-teacher`}
                value={staffRecordId}
                onChange={(e) => setStaffRecordId(e.target.value)}
                required
                className="w-full rounded-xl border border-line bg-field px-3 py-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-ring"
              >
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor={`${formId}-room`} className="block text-xs font-medium text-fg-muted mb-1">
              Room / Lab / Location (Optional)
            </label>
            <input
              id={`${formId}-room`}
              type="text"
              placeholder="e.g. Science Lab, Room 102"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              className="w-full rounded-xl border border-line bg-field px-3 py-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-ring"
            />
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-line">
            {initialSlot ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting || saving}
                className="rounded-xl border border-danger-line bg-danger-bg px-4 py-2 text-xs font-medium text-danger-text hover:bg-danger-line/40 focus-visible:outline-2 focus-visible:outline-ring"
              >
                {deleting ? "Deleting..." : "Delete Slot"}
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-line px-4 py-2 text-xs font-medium text-fg-muted hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-ring"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || deleting || liveClashes.length > 0 || !isRangeValid}
                className="rounded-xl bg-brand-strong px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-brand-strong-hover disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-ring"
              >
                {saving ? "Saving..." : initialSlot ? "Update Slot" : "Add Slot"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
