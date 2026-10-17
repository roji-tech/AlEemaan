"use client";

import { useState, useEffect, useCallback } from "react";
import { TimetableCanvas } from "./TimetableCanvas";
import type { SlotDto } from "./SlotEditModal";

export interface TimetablePanelProps {
  branches: { id: string; name: string }[];
  isAdmin: boolean;
}

export function TimetablePanel({ branches, isAdmin }: TimetablePanelProps) {
  const [selectedBranchId, setSelectedBranchId] = useState<string>(branches[0]?.id ?? "");
  const [slots, setSlots] = useState<SlotDto[]>([]);
  const [classArms, setClassArms] = useState<{ id: string; name: string }[]>([]);
  const [subjects, setSubjects] = useState<{ id: string; name: string; code?: string | null }[]>([]);
  const [teachers, setTeachers] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (branchId: string) => {
    if (!branchId) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Fetch slots
      const slotsRes = await fetch(`/api/v1/timetable?branchId=${branchId}`);
      const slotsData = await slotsRes.json();
      if (!slotsRes.ok) throw new Error(slotsData.error?.message || "Failed to load slots");
      setSlots(slotsData.data || []);

      // 2. Fetch academic reference data (arms, subjects, staff)
      const [armsRes, subsRes, staffRes] = await Promise.all([
        fetch(`/api/v1/academics/arms?branchId=${branchId}`),
        fetch(`/api/v1/academics/subjects?branchId=${branchId}`),
        fetch(`/api/v1/staff?branchId=${branchId}`),
      ]);

      if (armsRes.ok) {
        const d = await armsRes.json();
        setClassArms(d.data?.arms || d.data || []);
      }
      if (subsRes.ok) {
        const d = await subsRes.json();
        setSubjects(d.data?.subjects || d.data || []);
      }
      if (staffRes.ok) {
        const d = await staffRes.json();
        const staffList = d.data?.staff || d.data || [];
        setTeachers(
          staffList.map((s: { id: string; firstName: string; lastName: string }) => ({
            id: s.id,
            name: `${s.firstName} ${s.lastName}`,
          })),
        );
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load timetable data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedBranchId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- loading timetable data when selected branch changes
      void loadData(selectedBranchId);
    }
  }, [selectedBranchId, loadData]);

  return (
    <div className="space-y-6">
      {/* Branch selector if more than one branch is available */}
      {branches.length > 1 && (
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4">
          <label htmlFor="timetable-branch-select" className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
            Active Branch:
          </label>
          <select
            id="timetable-branch-select"
            value={selectedBranchId}
            onChange={(e) => setSelectedBranchId(e.target.value)}
            className="rounded-xl border border-line bg-field px-3 py-1.5 text-xs font-semibold text-fg focus-visible:outline-2 focus-visible:outline-ring"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-danger-line bg-danger-bg p-3 text-xs text-danger-text">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex h-64 items-center justify-center rounded-2xl border border-line bg-surface">
          <p className="text-xs font-medium text-fg-muted animate-pulse">Loading weekly timetable canvas...</p>
        </div>
      ) : (
        <TimetableCanvas
          branchId={selectedBranchId}
          slots={slots}
          classArms={classArms}
          subjects={subjects}
          teachers={teachers}
          readOnly={!isAdmin}
          onRefresh={() => loadData(selectedBranchId)}
        />
      )}
    </div>
  );
}
