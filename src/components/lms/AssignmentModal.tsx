"use client";

import { useState, useId, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";

export interface AssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  branchId: string;
  subjects: { id: string; name: string }[];
  classGroups: { id: string; name: string }[];
}

export function AssignmentModal({ isOpen, onClose, onSuccess, branchId, subjects, classGroups }: AssignmentModalProps) {
  const [title, setTitle] = useState("");
  const [subjectId, setSubjectId] = useState(subjects[0]?.id || "");
  const [classGroupId, setClassGroupId] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [totalPoints, setTotalPoints] = useState(100);
  const [allowLate, setAllowLate] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titleId = useId();
  const subjectIdField = useId();
  const classGroupIdField = useId();
  const descriptionId = useId();
  const instructionsId = useId();
  const dueDateId = useId();
  const totalPointsId = useId();
  const allowLateId = useId();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/v1/lms/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId,
          title,
          subjectId: subjectId || subjects[0]?.id,
          classGroupId: classGroupId || null,
          description: description || null,
          instructions: instructions || null,
          dueDate: dueDate ? new Date(dueDate).toISOString() : null,
          totalPoints: Number(totalPoints),
          allowLate,
          status: "PUBLISHED",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to create assignment");
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onClose={onClose} title="Create Coursework Assignment">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div role="alert" className="rounded-md border border-line bg-surface-muted p-3 text-sm text-fg-muted">
            {error}
          </div>
        )}

        <div>
          <label htmlFor={titleId} className="block text-xs font-semibold uppercase tracking-wider text-fg-muted">
            Assignment Title
          </label>
          <input
            id={titleId}
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Calculus Problem Set 1"
            className="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={subjectIdField} className="block text-xs font-semibold uppercase tracking-wider text-fg-muted">
              Subject
            </label>
            <select
              id={subjectIdField}
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-brand"
            >
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={classGroupIdField} className="block text-xs font-semibold uppercase tracking-wider text-fg-muted">
              Class Target (Optional)
            </label>
            <select
              id={classGroupIdField}
              value={classGroupId}
              onChange={(e) => setClassGroupId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-brand"
            >
              <option value="">All Classes in Subject</option>
              {classGroups.map((cg) => (
                <option key={cg.id} value={cg.id}>
                  {cg.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor={descriptionId} className="block text-xs font-semibold uppercase tracking-wider text-fg-muted">
            Description
          </label>
          <textarea
            id={descriptionId}
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief overview of topic or learning objectives..."
            className="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>

        <div>
          <label htmlFor={instructionsId} className="block text-xs font-semibold uppercase tracking-wider text-fg-muted">
            Instructions
          </label>
          <textarea
            id={instructionsId}
            rows={3}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Specific questions, submission guidelines, or formatting rules..."
            className="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={dueDateId} className="block text-xs font-semibold uppercase tracking-wider text-fg-muted">
              Due Date & Time
            </label>
            <input
              id={dueDateId}
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>

          <div>
            <label htmlFor={totalPointsId} className="block text-xs font-semibold uppercase tracking-wider text-fg-muted">
              Total Points
            </label>
            <input
              id={totalPointsId}
              type="number"
              min={1}
              max={1000}
              value={totalPoints}
              onChange={(e) => setTotalPoints(Number(e.target.value))}
              className="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <input
            id={allowLateId}
            type="checkbox"
            checked={allowLate}
            onChange={(e) => setAllowLate(e.target.checked)}
            className="h-4 w-4 rounded border-line text-brand focus:ring-brand"
          />
          <label htmlFor={allowLateId} className="text-sm text-fg">
            Accept late submissions past the due date
          </label>
        </div>

        <div className="flex justify-end gap-3 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold text-fg hover:bg-surface-hover"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="min-h-11 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
          >
            {loading ? "Publishing..." : "Publish Assignment"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
