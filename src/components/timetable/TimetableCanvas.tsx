"use client";

import { useState } from "react";
import { getDayName, getShortDayName, findSlotClashes, type TimetableSlotInput } from "@/lib/timetable/rules";
import { SlotEditModal, type SlotDto } from "./SlotEditModal";
import { BatchSlotsModal } from "./BatchSlotsModal";

export interface TimetableCanvasProps {
  branchId: string;
  slots: SlotDto[];
  classArms: { id: string; name: string }[];
  subjects: { id: string; name: string; code?: string | null }[];
  teachers: { id: string; name: string }[];
  readOnly?: boolean;
  onRefresh: () => void;
}

export function TimetableCanvas({ branchId, slots, classArms, subjects, teachers, readOnly = false, onRefresh }: TimetableCanvasProps) {
  const [batchOpen, setBatchOpen] = useState(false);
  const [selectedArmId, setSelectedArmId] = useState<string>("ALL");
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>("ALL");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<SlotDto | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | undefined>(undefined);

  // Pre-calculate clashes in current dataset for visual badge highlighting
  const clashSlotIds = new Set<string>();
  const slotInputs: TimetableSlotInput[] = slots.map((s) => ({
    id: s.id,
    dayOfWeek: s.dayOfWeek,
    classArmId: s.classArmId,
    subjectId: s.subjectId,
    staffRecordId: s.staffRecordId,
    startTime: s.startTime,
    endTime: s.endTime,
    room: s.room,
  }));

  for (const s of slotInputs) {
    const clashes = findSlotClashes(s, slotInputs);
    if (clashes.length > 0) {
      if (s.id) clashSlotIds.add(s.id);
    }
  }

  // Filter slots
  const filteredSlots = slots.filter((slot) => {
    if (selectedArmId !== "ALL" && slot.classArmId !== selectedArmId) return false;
    if (selectedTeacherId !== "ALL" && slot.staffRecordId !== selectedTeacherId) return false;
    return true;
  });

  // Group filtered slots by day (1 to 5 weekdays default, or 1 to 6 if Saturday has slots)
  const daysToShow = [1, 2, 3, 4, 5];
  const hasWeekend = filteredSlots.some((s) => s.dayOfWeek === 6 || s.dayOfWeek === 7);
  const activeDays = hasWeekend ? [1, 2, 3, 4, 5, 6] : daysToShow;

  const handleOpenAdd = (day?: number) => {
    if (readOnly) return;
    setSelectedDay(day);
    setEditingSlot(null);
    setModalOpen(true);
  };

  const handleEdit = (slot: SlotDto) => {
    if (readOnly) return;
    setEditingSlot(slot);
    setModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Top Filter and Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-surface p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label htmlFor="filter-arm" className="sr-only">
              Filter by Class Arm
            </label>
            <select
              id="filter-arm"
              value={selectedArmId}
              onChange={(e) => setSelectedArmId(e.target.value)}
              className="rounded-xl border border-line bg-field px-3 py-2 text-xs font-medium text-fg focus-visible:outline-2 focus-visible:outline-ring"
            >
              <option value="ALL">All Class Arms</option>
              {classArms.map((arm) => (
                <option key={arm.id} value={arm.id}>
                  {arm.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filter-teacher" className="sr-only">
              Filter by Teacher
            </label>
            <select
              id="filter-teacher"
              value={selectedTeacherId}
              onChange={(e) => setSelectedTeacherId(e.target.value)}
              className="rounded-xl border border-line bg-field px-3 py-2 text-xs font-medium text-fg focus-visible:outline-2 focus-visible:outline-ring"
            >
              <option value="ALL">All Teachers</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center rounded-xl border border-line bg-field p-1">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                viewMode === "grid" ? "bg-surface text-fg shadow-xs" : "text-fg-muted hover:text-fg"
              }`}
            >
              Grid View
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                viewMode === "list" ? "bg-surface text-fg shadow-xs" : "text-fg-muted hover:text-fg"
              }`}
            >
              List View
            </button>
          </div>
        </div>

        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleOpenAdd()}
              className="flex items-center gap-1.5 rounded-xl bg-brand-strong px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-brand-strong-hover focus-visible:outline-2 focus-visible:outline-ring"
            >
              <span>+</span> Schedule Period
            </button>
            <button
              type="button"
              onClick={() => setBatchOpen(true)}
              className="flex items-center gap-1.5 rounded-xl border border-line-strong bg-surface px-4 py-2 text-xs font-semibold text-fg transition hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Same period, several days
            </button>
          </div>
        )}
      </div>

      {/* Grid Canvas View */}
      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-5 lg:grid-cols-5 gap-4">
          {activeDays.map((day) => {
            const daySlots = filteredSlots.filter((s) => s.dayOfWeek === day).sort((a, b) => a.startTime.localeCompare(b.startTime));

            return (
              <div key={day} className="flex flex-col rounded-2xl border border-line bg-surface overflow-hidden min-h-87.5 shadow-sm">
                {/* Day Header */}
                <div className="flex items-center justify-between border-b border-line bg-surface-2 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-fg">{getDayName(day)}</span>
                    <span className="rounded-full bg-field border border-line px-2 py-0.5 text-[10px] font-medium text-fg-muted">
                      {daySlots.length}
                    </span>
                  </div>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => handleOpenAdd(day)}
                      title={`Add slot to ${getDayName(day)}`}
                      className="rounded-lg p-1 text-fg-muted hover:bg-field hover:text-fg focus-visible:outline-2 focus-visible:outline-ring"
                      aria-label={`Add slot on ${getDayName(day)}`}
                    >
                      +
                    </button>
                  )}
                </div>

                {/* Day Slots List */}
                <div className="flex-1 p-2 space-y-2 overflow-y-auto">
                  {daySlots.length === 0 ? (
                    <div className="flex h-32 items-center justify-center text-xs text-fg-muted italic">No periods scheduled</div>
                  ) : (
                    daySlots.map((slot) => {
                      const isClashing = clashSlotIds.has(slot.id);

                      return (
                        <div
                          key={slot.id}
                          onClick={() => handleEdit(slot)}
                          role="button"
                          tabIndex={readOnly ? -1 : 0}
                          onKeyDown={(e) => {
                            if (!readOnly && (e.key === "Enter" || e.key === " ")) {
                              handleEdit(slot);
                            }
                          }}
                          className={`group relative rounded-xl border p-3 text-left transition ${
                            isClashing
                              ? "border-danger-line bg-danger-bg/40 text-danger-text"
                              : "border-line bg-field/70 hover:border-line-strong hover:bg-field"
                          } ${!readOnly ? "cursor-pointer" : ""}`}
                        >
                          {isClashing && (
                            <span className="absolute right-2 top-2 rounded-full bg-danger-text px-1.5 py-0.5 text-[9px] font-bold text-white">
                              Clash
                            </span>
                          )}

                          <div className="text-xs font-semibold text-fg flex items-center justify-between">
                            <span>{slot.subject?.name ?? "Subject"}</span>
                            {slot.periodNumber && <span className="text-[10px] text-fg-muted">P{slot.periodNumber}</span>}
                          </div>

                          <div className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-brand-fg">
                            <span>
                              ⏱ {slot.startTime} – {slot.endTime}
                            </span>
                          </div>

                          <div className="mt-2 flex flex-wrap items-center gap-1 text-[10px] text-fg-muted">
                            <span className="rounded-md bg-surface px-1.5 py-0.5 border border-line">{slot.classArm?.name ?? "Arm"}</span>
                            {slot.staffRecord && (
                              <span className="rounded-md bg-surface px-1.5 py-0.5 border border-line">
                                👤 {slot.staffRecord.firstName} {slot.staffRecord.lastName}
                              </span>
                            )}
                            {slot.room && <span className="rounded-md bg-surface px-1.5 py-0.5 border border-line">📍 {slot.room}</span>}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table List View */
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-sm">
          <table className="w-full text-left text-xs text-fg">
            <thead className="border-b border-line bg-surface-2 text-fg-muted font-semibold">
              <tr>
                <th className="px-4 py-3">Day</th>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3">Class Arm</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Teacher</th>
                <th className="px-4 py-3">Room</th>
                <th className="px-4 py-3">Status</th>
                {!readOnly && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filteredSlots.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-fg-muted">
                    No scheduled periods matching selected criteria.
                  </td>
                </tr>
              ) : (
                filteredSlots.map((slot) => {
                  const isClashing = clashSlotIds.has(slot.id);

                  return (
                    <tr key={slot.id} className="hover:bg-surface-2/50 transition">
                      <td className="px-4 py-3 font-medium">{getShortDayName(slot.dayOfWeek)}</td>
                      <td className="px-4 py-3 font-semibold text-brand-fg">
                        {slot.startTime} – {slot.endTime}
                      </td>
                      <td className="px-4 py-3">{slot.periodNumber ? `P${slot.periodNumber}` : "—"}</td>
                      <td className="px-4 py-3">{slot.classArm?.name ?? "—"}</td>
                      <td className="px-4 py-3 font-semibold">{slot.subject?.name ?? "—"}</td>
                      <td className="px-4 py-3">{slot.staffRecord ? `${slot.staffRecord.firstName} ${slot.staffRecord.lastName}` : "—"}</td>
                      <td className="px-4 py-3">{slot.room ?? "—"}</td>
                      <td className="px-4 py-3">
                        {isClashing ? (
                          <span className="rounded-full bg-danger-bg border border-danger-line px-2 py-0.5 text-[10px] font-bold text-danger-text">
                            ⚠️ Clash
                          </span>
                        ) : (
                          <span className="rounded-full bg-ok-bg border border-ok-line px-2 py-0.5 text-[10px] font-medium text-ok-icon">
                            Active
                          </span>
                        )}
                      </td>
                      {!readOnly && (
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleEdit(slot)}
                            className="rounded-lg border border-line px-2.5 py-1 text-[11px] font-medium text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-ring"
                          >
                            Edit
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit / Create Dialog */}
      <BatchSlotsModal
        key={batchOpen ? "open" : "closed"}
        open={batchOpen}
        branchId={branchId}
        classArms={classArms}
        subjects={subjects}
        teachers={teachers}
        onClose={() => setBatchOpen(false)}
        onSaved={onRefresh}
      />
      <SlotEditModal
        branchId={branchId}
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={onRefresh}
        initialSlot={editingSlot}
        initialDay={selectedDay}
        existingSlots={slots}
        classArms={classArms}
        subjects={subjects}
        teachers={teachers}
      />
    </div>
  );
}
