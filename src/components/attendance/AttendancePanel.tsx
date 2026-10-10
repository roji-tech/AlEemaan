"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { flushSync } from "react-dom";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import { getJson, sendJson } from "@/components/auth/postJson";
import { AttendanceStatus } from "@/lib/attendance/rules";
import type { StudentRollCallEntry } from "@/lib/attendance/service";

export type BranchOption = { id: string; name: string };

type StudentEntry = {
  studentId: string;
  admissionNo: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  status: AttendanceStatus;
  remarks: string;
};

type OverrideMap = Record<string, { status?: AttendanceStatus; remarks?: string }>;
type Notice = { variant: "success" | "error"; text: string } | null;

export function AttendancePanel({ branches, readOnly = false }: { branches: BranchOption[]; readOnly?: boolean }) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [date, setDate] = useState(today);
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [className, setClassName] = useState("Primary 1");
  const [arm, setArm] = useState("");
  const [overrides, setOverrides] = useState<OverrideMap>({});
  const [notice, setNotice] = useState<Notice>(null);
  const [saving, setSaving] = useState(false);

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [serverStudents, setServerStudents] = useState<StudentRollCallEntry[]>([]);
  const [canEditServer, setCanEditServer] = useState(true);

  // Fetch Roll Call
  const loadRollCall = useCallback(
    async (signal?: AbortSignal, flush = false) => {
      if (!branchId || !className) return;

      const query = new URLSearchParams({
        branchId,
        className,
        date,
        ...(arm ? { arm } : {}),
      });

      const res = await getJson(`/api/v1/attendance?${query.toString()}`, signal);
      if (signal?.aborted) return;

      const apply = () => {
        setLoading(false);
        if (res.ok && res.data) {
          const data = res.data as { students: StudentRollCallEntry[]; canEdit: boolean };
          setServerStudents(data.students ?? []);
          setCanEditServer(Boolean(data.canEdit));
          setLoadError(null);
        } else {
          setLoadError(res.message ?? "Unable to load roll call roster");
          setServerStudents([]);
        }
      };

      if (flush) flushSync(apply);
      else apply();
    },
    [branchId, className, arm, date],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadRollCall(controller.signal);
    return () => controller.abort();
  }, [loadRollCall]);

  const isEditable = !readOnly && canEditServer && date <= today;

  // Derived student entries combining server records with local edits
  const entries: StudentEntry[] = useMemo(() => {
    return serverStudents.map((s) => {
      const override = overrides[s.studentId];
      return {
        studentId: s.studentId,
        admissionNo: s.admissionNo,
        firstName: s.firstName,
        middleName: s.middleName,
        lastName: s.lastName,
        status: override?.status ?? s.status ?? AttendanceStatus.PRESENT,
        remarks: override?.remarks ?? s.remarks ?? "",
      };
    });
  }, [serverStudents, overrides]);

  // Summary KPI computation
  const summary = useMemo(() => {
    const total = entries.length;
    let present = 0;
    let late = 0;
    let absent = 0;
    let excused = 0;

    for (const e of entries) {
      if (e.status === AttendanceStatus.PRESENT) present++;
      else if (e.status === AttendanceStatus.LATE) late++;
      else if (e.status === AttendanceStatus.ABSENT) absent++;
      else if (e.status === AttendanceStatus.EXCUSED) excused++;
    }

    const rate = total > 0 ? Math.round(((present + late) / total) * 100) : 0;
    return { total, present, late, absent, excused, rate };
  }, [entries]);

  const stepDate = (days: number) => {
    const current = new Date(date);
    current.setDate(current.getDate() + days);
    const nextStr = current.toISOString().slice(0, 10);
    if (nextStr <= today) {
      setDate(nextStr);
      setOverrides({});
    }
  };

  const handleStatusChange = (studentId: string, status: AttendanceStatus) => {
    if (!isEditable) return;
    setOverrides((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        status,
      },
    }));
  };

  const handleRemarksChange = (studentId: string, remarks: string) => {
    if (!isEditable) return;
    setOverrides((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        remarks,
      },
    }));
  };

  const handleMarkAllPresent = () => {
    if (!isEditable) return;
    const nextOverrides: OverrideMap = { ...overrides };
    for (const e of entries) {
      if (e.status !== AttendanceStatus.EXCUSED) {
        nextOverrides[e.studentId] = {
          ...nextOverrides[e.studentId],
          status: AttendanceStatus.PRESENT,
        };
      }
    }
    setOverrides(nextOverrides);
  };

  const handleSave = async () => {
    if (!isEditable || !branchId || entries.length === 0) return;
    setSaving(true);
    setNotice(null);

    const payload = {
      branchId,
      date,
      records: entries.map((e) => ({
        studentId: e.studentId,
        status: e.status,
        remarks: e.remarks.trim() || undefined,
      })),
    };

    const res = await sendJson("/api/v1/attendance", "POST", payload);
    setSaving(false);

    if (res.ok) {
      setNotice({
        variant: "success",
        text: `Attendance recorded for ${date} (${entries.length} students).`,
      });
      setOverrides({});
      await loadRollCall();
    } else {
      setNotice({
        variant: "error",
        text: res.message || "Failed to record attendance. Please check date or permissions.",
      });
    }
  };

  return (
    <section aria-labelledby="attendance-heading" className="space-y-6">
      {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="attendance-heading" className="text-lg font-semibold tracking-tight text-fg">
            Daily Attendance
          </h2>
          <p className="mt-1 text-sm text-fg-muted">Touch-optimised roll call with real-time statistics and 7-day edit grace period.</p>
        </div>

        {isEditable && entries.length > 0 && (
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={handleMarkAllPresent} disabled={saving} className="min-h-11">
              Mark All Present
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving} className="min-h-11 bg-brand text-white hover:bg-brand/90">
              {saving ? "Saving..." : "Save Roll Call"}
            </Button>
          </div>
        )}
      </div>

      {/* Control Bar: Branch, Class, Arm, Date Navigation */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5 items-end bg-surface-1 p-4 rounded-xl border border-line">
        <div>
          <SelectField
            label="Branch"
            value={branchId}
            onChange={(e) => {
              setBranchId(e.target.value);
              setOverrides({});
            }}
            options={branches.map((b) => ({ value: b.id, label: b.name }))}
          />
        </div>

        <div>
          <label htmlFor="class-name-input" className="block text-sm font-medium text-fg mb-1">
            Class
          </label>
          <input
            id="class-name-input"
            type="text"
            value={className}
            onChange={(e) => {
              setClassName(e.target.value);
              setOverrides({});
            }}
            placeholder="e.g. Primary 1, JSS 2"
            className="w-full rounded-md border border-line bg-surface-base px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>

        <div>
          <label htmlFor="arm-input" className="block text-sm font-medium text-fg mb-1">
            Arm (optional)
          </label>
          <input
            id="arm-input"
            type="text"
            value={arm}
            onChange={(e) => {
              setArm(e.target.value);
              setOverrides({});
            }}
            placeholder="e.g. Gold, A"
            className="w-full rounded-md border border-line bg-surface-base px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>

        <div>
          <label htmlFor="attendance-date" className="block text-sm font-medium text-fg mb-1">
            Date
          </label>
          <input
            id="attendance-date"
            type="date"
            max={today}
            value={date}
            onChange={(e) => {
              if (e.target.value) {
                setDate(e.target.value);
                setOverrides({});
              }
            }}
            className="w-full rounded-md border border-line bg-surface-base px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>

        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={() => stepDate(-1)} aria-label="Previous day" className="min-h-11 flex-1">
            ← Prev
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setDate(today);
              setOverrides({});
            }}
            disabled={date === today}
            className="min-h-11"
          >
            Today
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => stepDate(1)}
            disabled={date >= today}
            aria-label="Next day"
            className="min-h-11 flex-1"
          >
            Next →
          </Button>
        </div>
      </div>

      {/* Status Notice if Locked */}
      {!isEditable && (
        <div className="p-3 bg-warn-bg text-warn-fg rounded-lg text-xs font-semibold border border-warn-border">
          {readOnly
            ? "Read-Only Access"
            : date > today
              ? "Future dates cannot be recorded."
              : "Edit window has expired (> 7 days). Historical changes require an administrator."}
        </div>
      )}

      {/* KPI Overview */}
      {entries.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-3 bg-surface-1 rounded-lg border border-line text-center">
            <div className="text-xs text-fg-muted uppercase tracking-wider font-semibold">Enrolled</div>
            <div className="text-2xl font-bold text-fg mt-1">{summary.total}</div>
          </div>
          <div className="p-3 bg-ok-bg/30 rounded-lg border border-ok-border text-center">
            <div className="text-xs text-ok-fg uppercase tracking-wider font-semibold">Present</div>
            <div className="text-2xl font-bold text-ok-fg mt-1">{summary.present}</div>
          </div>
          <div className="p-3 bg-warn-bg/30 rounded-lg border border-warn-border text-center">
            <div className="text-xs text-warn-fg uppercase tracking-wider font-semibold">Late</div>
            <div className="text-2xl font-bold text-warn-fg mt-1">{summary.late}</div>
          </div>
          <div className="p-3 bg-danger-bg/30 rounded-lg border border-danger-border text-center">
            <div className="text-xs text-danger-fg uppercase tracking-wider font-semibold">Absent</div>
            <div className="text-2xl font-bold text-danger-fg mt-1">{summary.absent}</div>
          </div>
          <div className="p-3 bg-info-bg/30 rounded-lg border border-info-border text-center">
            <div className="text-xs text-info-fg uppercase tracking-wider font-semibold">Excused</div>
            <div className="text-2xl font-bold text-info-fg mt-1">{summary.excused}</div>
          </div>
          <div className="p-3 bg-surface-2 rounded-lg border border-line text-center">
            <div className="text-xs text-fg-muted uppercase tracking-wider font-semibold">Rate</div>
            <div className="text-2xl font-bold text-fg mt-1">{summary.rate}%</div>
          </div>
        </div>
      )}

      {/* Error or Empty States */}
      {loadError && (
        <Alert variant="error">
          <p>{loadError}</p>
          <Button variant="secondary" className="mt-3 min-h-11" onClick={() => void loadRollCall()}>
            Try again
          </Button>
        </Alert>
      )}

      {loading && (
        <p className="p-6 text-sm text-fg-muted bg-surface rounded-xl border border-line" aria-busy="true">
          Loading roll call roster…
        </p>
      )}

      {!loading && !loadError && entries.length === 0 && (
        <div className="p-6 text-sm text-fg-muted bg-surface rounded-xl border border-line text-center">
          No active students enrolled in {className} for this branch in the current session.
        </div>
      )}

      {/* Roster Touch Grid */}
      {entries.length > 0 && (
        <div className="space-y-3">
          {entries.map((student, idx) => (
            <div
              key={student.studentId}
              className="flex flex-col md:flex-row items-start md:items-center justify-between p-4 bg-surface-1 rounded-xl border border-line gap-4 transition-colors hover:border-brand/40"
            >
              {/* Student Info */}
              <div className="min-w-50 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-fg-muted">#{idx + 1}</span>
                  <span className="font-semibold text-fg">
                    {student.lastName}, {student.firstName} {student.middleName ?? ""}
                  </span>
                </div>
                <div className="text-xs font-mono text-fg-muted mt-0.5">Admission: {student.admissionNo}</div>
              </div>

              {/* Touch Segment Controls (>= 44px tap targets) */}
              <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
                <button
                  type="button"
                  disabled={!isEditable}
                  onClick={() => handleStatusChange(student.studentId, AttendanceStatus.PRESENT)}
                  className={`min-h-11 min-w-17.5 px-3 py-2 text-xs font-bold rounded-lg transition-all ${
                    student.status === AttendanceStatus.PRESENT
                      ? "bg-green-600 text-white shadow-sm ring-2 ring-green-500/50"
                      : "bg-surface-2 text-fg-muted hover:bg-surface-3 hover:text-fg"
                  } disabled:opacity-60 disabled:cursor-not-allowed`}
                >
                  PRESENT
                </button>

                <button
                  type="button"
                  disabled={!isEditable}
                  onClick={() => handleStatusChange(student.studentId, AttendanceStatus.LATE)}
                  className={`min-h-11 min-w-17.5 px-3 py-2 text-xs font-bold rounded-lg transition-all ${
                    student.status === AttendanceStatus.LATE
                      ? "bg-amber-600 text-white shadow-sm ring-2 ring-amber-500/50"
                      : "bg-surface-2 text-fg-muted hover:bg-surface-3 hover:text-fg"
                  } disabled:opacity-60 disabled:cursor-not-allowed`}
                >
                  LATE
                </button>

                <button
                  type="button"
                  disabled={!isEditable}
                  onClick={() => handleStatusChange(student.studentId, AttendanceStatus.ABSENT)}
                  className={`min-h-11 min-w-17.5 px-3 py-2 text-xs font-bold rounded-lg transition-all ${
                    student.status === AttendanceStatus.ABSENT
                      ? "bg-rose-600 text-white shadow-sm ring-2 ring-rose-500/50"
                      : "bg-surface-2 text-fg-muted hover:bg-surface-3 hover:text-fg"
                  } disabled:opacity-60 disabled:cursor-not-allowed`}
                >
                  ABSENT
                </button>

                <button
                  type="button"
                  disabled={!isEditable}
                  onClick={() => handleStatusChange(student.studentId, AttendanceStatus.EXCUSED)}
                  className={`min-h-11 min-w-17.5 px-3 py-2 text-xs font-bold rounded-lg transition-all ${
                    student.status === AttendanceStatus.EXCUSED
                      ? "bg-sky-600 text-white shadow-sm ring-2 ring-sky-500/50"
                      : "bg-surface-2 text-fg-muted hover:bg-surface-3 hover:text-fg"
                  } disabled:opacity-60 disabled:cursor-not-allowed`}
                >
                  EXCUSED
                </button>
              </div>

              {/* Inline Remarks */}
              <div className="w-full md:w-64">
                <input
                  type="text"
                  disabled={!isEditable}
                  placeholder="Remarks (e.g. sick note)..."
                  value={student.remarks}
                  onChange={(e) => handleRemarksChange(student.studentId, e.target.value)}
                  maxLength={500}
                  className="w-full text-xs rounded-lg border border-line bg-surface-base px-3 py-2 text-fg placeholder:text-fg-muted/60 focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-50"
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Floating Save Action on long lists */}
      {isEditable && entries.length > 5 && (
        <div className="sticky bottom-4 z-10 flex justify-end p-3 bg-surface-base/90 backdrop-blur border border-line rounded-xl shadow-lg">
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="min-h-11 px-6 bg-brand text-white hover:bg-brand/90 font-semibold"
          >
            {saving ? "Saving..." : "Save Roll Call"}
          </Button>
        </div>
      )}
    </section>
  );
}
