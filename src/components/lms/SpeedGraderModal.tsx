"use client";

import { useState, useEffect, useCallback, useId, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";

export interface SubmissionItem {
  id: string;
  studentId: string;
  content: string | null;
  attachments: { title: string; url: string }[];
  status: string;
  score: number | null;
  feedback: string | null;
  submittedAt: string | null;
  student: {
    id: string;
    firstName: string;
    lastName: string;
    admissionNo: string;
  };
}

export interface SpeedGraderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  branchId: string;
  assignmentId: string;
  assignmentTitle: string;
  totalPoints: number;
  submissions?: SubmissionItem[];
}

export function SpeedGraderModal({
  isOpen,
  onClose,
  onSuccess,
  branchId,
  assignmentId,
  assignmentTitle,
  totalPoints,
  submissions: initialSubmissions,
}: SpeedGraderModalProps) {
  const [submissionsList, setSubmissionsList] = useState<SubmissionItem[]>(initialSubmissions || []);
  const [loadingList, setLoadingList] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selectedSub = submissionsList[selectedIndex];

  const [score, setScore] = useState<string>("");
  const [feedback, setFeedback] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scoreId = useId();
  const feedbackId = useId();

  const fetchSubmissions = useCallback(async () => {
    if (!assignmentId || !branchId) return;
    setLoadingList(true);
    try {
      const res = await fetch(`/api/v1/lms/assignments/${assignmentId}/submissions?branchId=${branchId}`);
      if (res.ok) {
        const body = await res.json();
        setSubmissionsList(body.data || []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingList(false);
    }
  }, [assignmentId, branchId]);

  useEffect(() => {
    if (isOpen) {
      if (!initialSubmissions) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch submissions when modal opens
        void fetchSubmissions();
      } else {
        setSubmissionsList(initialSubmissions);
      }
    }
  }, [isOpen, initialSubmissions, fetchSubmissions]);

  // Keep form in sync when changing selected student
  useEffect(() => {
    if (selectedSub) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync inputs with selected submission
      setScore(selectedSub.score !== null ? String(selectedSub.score) : "");
      setFeedback(selectedSub.feedback || "");
      setError(null);
    }
  }, [selectedSub]);

  const handleGrade = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedSub) return;

    setLoading(true);
    setError(null);

    try {
      const parsedScore = score === "" ? null : Number(score);
      const res = await fetch(`/api/v1/lms/assignments/${assignmentId}/submissions/${selectedSub.id}/grade`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId,
          score: parsedScore,
          feedback: feedback || null,
        }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error?.message || "Failed to save grade");
      }

      const updated = await res.json();
      setSubmissionsList((prev) => prev.map((sub) => (sub.id === selectedSub.id ? updated.data : sub)));

      if (onSuccess) onSuccess();

      // Auto-advance to next student if available
      if (selectedIndex < submissionsList.length - 1) {
        setSelectedIndex((i) => i + 1);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving grade");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onClose={onClose} title={`Speed Grader: ${assignmentTitle}`} wide>
      <div className="space-y-4">
        {loadingList ? (
          <p className="py-8 text-center text-sm text-fg-muted animate-pulse">Loading student submissions...</p>
        ) : submissionsList.length === 0 ? (
          <p className="py-8 text-center text-sm text-fg-muted">No student submissions recorded for this assignment yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {/* Student Submissions List */}
            <div className="space-y-2 rounded-lg border border-line bg-surface-2 p-2 md:col-span-1">
              <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-fg-muted">
                Submissions ({submissionsList.length})
              </p>
              <div className="max-h-80 space-y-1 overflow-y-auto">
                {submissionsList.map((sub, idx) => (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => setSelectedIndex(idx)}
                    className={`w-full text-left rounded-md px-3 py-2 text-sm transition-colors ${
                      idx === selectedIndex ? "bg-brand-strong text-white font-medium" : "hover:bg-surface-2 text-fg"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="truncate">
                        {sub.student.firstName} {sub.student.lastName}
                      </span>
                      {sub.score !== null ? (
                        <span
                          className={`text-xs ${
                            idx === selectedIndex ? "text-white font-bold" : "text-ok-fg font-semibold"
                          }`}
                        >
                          {sub.score}/{totalPoints}
                        </span>
                      ) : (
                        <span className={`text-xs ${idx === selectedIndex ? "text-white" : "text-fg-muted"}`}>
                          Ungraded
                        </span>
                      )}
                    </div>
                    <span className={`text-xs block ${idx === selectedIndex ? "text-white" : "text-fg-muted"}`}>
                      {sub.student.admissionNo}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Grading Form & Work Details */}
            <div className="space-y-4 md:col-span-2">
              {selectedSub && (
                <>
                  <div className="rounded-lg border border-line bg-surface p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-semibold text-fg">
                          {selectedSub.student.firstName} {selectedSub.student.lastName}
                        </h4>
                        <p className="text-xs text-fg-muted">
                          Admission: {selectedSub.student.admissionNo} • Submitted:{" "}
                          {selectedSub.submittedAt ? new Date(selectedSub.submittedAt).toLocaleString() : "Draft"}
                        </p>
                      </div>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-surface-2 text-fg-muted">
                        {selectedSub.status}
                      </span>
                    </div>

                    {selectedSub.content && (
                      <div className="p-3 rounded-md bg-surface-2 text-sm text-fg whitespace-pre-wrap">{selectedSub.content}</div>
                    )}

                    {selectedSub.attachments && selectedSub.attachments.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-xs font-semibold text-fg-muted block">Attachments:</span>
                        <ul className="space-y-1">
                          {selectedSub.attachments.map((att, i) => (
                            <li key={i}>
                              <a
                                href={att.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs font-medium text-brand-fg hover:underline"
                              >
                                📎 {att.title || "Attached Document"} ↗
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  <form onSubmit={handleGrade} className="space-y-3">
                    {error && (
                      <div role="alert" className="p-3 rounded-lg bg-danger-bg border border-danger-line text-danger-fg text-sm">
                        {error}
                      </div>
                    )}

                    <div>
                      <label htmlFor={scoreId} className="block text-sm font-medium text-fg">
                        Score (out of {totalPoints})
                      </label>
                      <input
                        id={scoreId}
                        type="number"
                        min={0}
                        max={totalPoints}
                        value={score}
                        onChange={(e) => setScore(e.target.value)}
                        className="mt-1 block w-full rounded-md border border-line-strong bg-field px-3 py-1.5 text-sm shadow-sm focus:border-brand-fg focus:outline-none focus:ring-1 focus:ring-ring"
                        placeholder={`0 - ${totalPoints}`}
                      />
                    </div>

                    <div>
                      <label htmlFor={feedbackId} className="block text-sm font-medium text-fg">
                        Teacher Feedback / Notes
                      </label>
                      <textarea
                        id={feedbackId}
                        rows={3}
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        className="mt-1 block w-full rounded-md border border-line-strong bg-field px-3 py-1.5 text-sm shadow-sm focus:border-brand-fg focus:outline-none focus:ring-1 focus:ring-ring"
                        placeholder="Well done, but check question 2..."
                      />
                    </div>

                    <div className="flex justify-between items-center pt-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={selectedIndex === 0}
                          onClick={() => setSelectedIndex((i) => i - 1)}
                          className="px-3 py-1.5 rounded text-xs font-medium border border-line text-fg hover:bg-surface-2 disabled:opacity-40"
                        >
                          ← Previous
                        </button>
                        <button
                          type="button"
                          disabled={selectedIndex === submissionsList.length - 1}
                          onClick={() => setSelectedIndex((i) => i + 1)}
                          className="px-3 py-1.5 rounded text-xs font-medium border border-line text-fg hover:bg-surface-2 disabled:opacity-40"
                        >
                          Next →
                        </button>
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        className="inline-flex justify-center rounded-lg bg-brand-strong px-4 py-1.5 text-sm font-medium text-white shadow hover:bg-brand-strong-hover focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50"
                      >
                        {loading ? "Saving..." : "Save & Next Student"}
                      </button>
                    </div>
                  </form>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
