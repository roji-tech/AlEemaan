"use client";

import React, { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import type { PortalStudentRecord } from "./PortalLoginCard";

interface AssignmentItem {
  id: string;
  title: string;
  description: string | null;
  instructions?: string | null;
  subjectName: string;
  dueDate: string | null;
  totalPoints: number;
  closed?: boolean;
  submission: {
    status: string;
    score: number | null;
    feedback: string | null;
  } | null;
}

interface MaterialItem {
  id: string;
  title: string;
  description: string | null;
  subjectName: string;
  content: string | null;
  attachments: unknown;
  createdAt: string;
}

interface QuizItem {
  id: string;
  title: string;
  instructions: string | null;
  subjectName: string;
  timeLimitMinutes: number | null;
  passingScore: number | null;
  questions: { id: string; prompt: string; questionType: "MULTIPLE_CHOICE" | "TRUE_FALSE" | "SHORT_ANSWER"; options: unknown; points: number }[];
  lastAttempt: { score: number; isPassed: boolean } | null;
}

export interface PortalLms {
  assignments: AssignmentItem[];
  materials: MaterialItem[];
  quizzes: QuizItem[];
}

interface PortalLmsTabProps {
  lms: PortalLms;
  student: PortalStudentRecord;
  /** What this sign-in may do here (task 0040): a guardian reads the coursework but does not hand in work or take quizzes for the pupil. */
  canSubmit: boolean;
  canQuiz: boolean;
  /** Called after work is handed in or a quiz is taken, so the lists show the new state. */
  onChanged: () => Promise<void> | void;
}

const fieldClass =
  "w-full rounded-lg border border-line-strong bg-field px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-ring";
const primaryButton =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-strong px-4 text-sm font-semibold text-white hover:bg-brand-strong-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";
const linkButton =
  "inline-flex min-h-11 items-center rounded-lg px-2 text-xs font-semibold text-brand-fg hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

async function post(url: string, body: unknown): Promise<{ ok: boolean; data?: unknown; message?: string }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, data: json.data } : { ok: false, message: json.error?.message ?? "That did not work. Please try again." };
  } catch {
    return { ok: false, message: "Could not reach the server. Check your connection and try again." };
  }
}

function HandInDialog({
  assignment,
  studentId,
  onClose,
  onDone,
}: {
  assignment: AssignmentItem;
  studentId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [content, setContent] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textId = useId();
  const titleId = useId();
  const urlId = useId();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const attachments = linkTitle.trim() && linkUrl.trim() ? [{ title: linkTitle.trim(), url: linkUrl.trim() }] : [];
    const res = await post(`/api/v1/portal/students/${studentId}/assignments/${assignment.id}/submission`, { content, attachments });
    setBusy(false);
    if (res.ok) onDone();
    else setError(res.message ?? "That did not work.");
  };

  return (
    <Dialog open onClose={onClose} title={`Hand in: ${assignment.title}`}>
      <form onSubmit={submit} className="space-y-4">
        {assignment.instructions && <p className="text-xs text-fg-2">{assignment.instructions}</p>}
        {error && (
          <p role="alert" className="rounded-lg border border-danger-line bg-danger-bg p-3 text-sm text-danger-fg">
            {error}
          </p>
        )}
        <div>
          <label htmlFor={textId} className="mb-1 block text-sm font-medium text-fg">
            Your answer
          </label>
          <textarea id={textId} rows={5} value={content} onChange={(e) => setContent(e.target.value)} className={fieldClass} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={titleId} className="mb-1 block text-sm font-medium text-fg">
              Link title (optional)
            </label>
            <input id={titleId} value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} className={fieldClass} />
          </div>
          <div>
            <label htmlFor={urlId} className="mb-1 block text-sm font-medium text-fg">
              Link address (optional)
            </label>
            <input id={urlId} type="url" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} className={fieldClass} />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="min-h-11 rounded-lg border border-line px-4 text-sm font-medium text-fg hover:bg-surface-2">
            Cancel
          </button>
          <button type="submit" disabled={busy} className={primaryButton}>
            {busy ? "Handing in…" : assignment.submission ? "Hand in again" : "Hand in"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

const optionsOf = (raw: unknown): { id: string; text: string }[] =>
  Array.isArray(raw)
    ? raw.flatMap((o) =>
        o && typeof o === "object" && "id" in o && "text" in o ? [{ id: String((o as { id: unknown }).id), text: String((o as { text: unknown }).text) }] : [],
      )
    : [];

function QuizDialog({ quiz, studentId, onClose, onDone }: { quiz: QuizItem; studentId: string; onClose: () => void; onDone: () => void }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ score: number; isPassed: boolean; totalPoints: number } | null>(null);
  const [left, setLeft] = useState<number | null>(quiz.timeLimitMinutes ? quiz.timeLimitMinutes * 60 : null);
  const formId = useId();
  const timedOut = useRef(false);

  const send = useCallback(async () => {
    setBusy(true);
    setError(null);
    const res = await post(`/api/v1/portal/students/${studentId}/quizzes/${quiz.id}/attempt`, {
      answers: Object.entries(answers)
        .filter(([, a]) => a.trim())
        .map(([questionId, answer]) => ({ questionId, answer })),
    });
    setBusy(false);
    if (res.ok) {
      setResult(res.data as { score: number; isPassed: boolean; totalPoints: number });
      onDone();
    } else setError(res.message ?? "That did not work.");
  }, [answers, studentId, quiz.id, onDone]);

  // The countdown submits what is answered when the time runs out.
  useEffect(() => {
    if (left === null || result) return;
    if (left <= 0) {
      if (!timedOut.current) {
        timedOut.current = true;
        void send();
      }
      return;
    }
    const t = setTimeout(() => setLeft((v) => (v === null ? v : v - 1)), 1000);
    return () => clearTimeout(t);
  }, [left, result, send]);

  return (
    <Dialog open onClose={onClose} title={quiz.title} wide>
      {result ? (
        <div className="space-y-4 py-4 text-center">
          <p className="text-lg font-bold text-fg">{result.isPassed ? "Passed" : "Not passed yet"}</p>
          <p className="text-sm text-fg-2">You scored {result.score}%.</p>
          {quiz.passingScore !== null && <p className="text-xs text-fg-muted">Pass mark: {quiz.passingScore}%</p>}
          <button type="button" onClick={onClose} className={primaryButton}>
            Done
          </button>
        </div>
      ) : (
        <form
          id={formId}
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="space-y-5"
        >
          {quiz.instructions && <p className="text-xs text-fg-2">{quiz.instructions}</p>}
          {left !== null && (
            <p className="rounded-lg border border-info-line bg-info-bg p-3 text-sm text-info-fg" role="timer">
              Time left: {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
            </p>
          )}
          {error && (
            <p role="alert" className="rounded-lg border border-danger-line bg-danger-bg p-3 text-sm text-danger-fg">
              {error}
            </p>
          )}
          {quiz.questions.map((q, i) => {
            const choices =
              q.questionType === "TRUE_FALSE"
                ? [
                    { id: "true", text: "True" },
                    { id: "false", text: "False" },
                  ]
                : optionsOf(q.options);
            return (
              <fieldset key={q.id} className="space-y-2 rounded-xl border border-line p-4">
                <legend className="px-1 text-sm font-semibold text-fg">
                  {i + 1}. {q.prompt} <span className="text-xs font-normal text-fg-muted">({q.points} pt)</span>
                </legend>
                {q.questionType === "SHORT_ANSWER" ? (
                  <input
                    aria-label={`Answer to question ${i + 1}`}
                    value={answers[q.id] ?? ""}
                    onChange={(e) => setAnswers((p) => ({ ...p, [q.id]: e.target.value }))}
                    className={fieldClass}
                  />
                ) : (
                  choices.map((c) => (
                    <label key={c.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-line px-3 text-sm text-fg">
                      <input
                        type="radio"
                        name={`${formId}-${q.id}`}
                        checked={answers[q.id] === c.id}
                        onChange={() => setAnswers((p) => ({ ...p, [q.id]: c.id }))}
                      />
                      {c.text}
                    </label>
                  ))
                )}
              </fieldset>
            );
          })}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="min-h-11 rounded-lg border border-line px-4 text-sm font-medium text-fg hover:bg-surface-2">
              Leave
            </button>
            <button type="submit" disabled={busy} className={primaryButton}>
              {busy ? "Submitting…" : "Submit quiz"}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

export function PortalLmsTab({ lms, student, canSubmit, canQuiz, onChanged }: PortalLmsTabProps) {
  const { assignments, materials, quizzes } = lms;
  const [handing, setHanding] = useState<AssignmentItem | null>(null);
  const [taking, setTaking] = useState<QuizItem | null>(null);

  return (
    <div className="space-y-6">
      {/* Homework & Assignments */}
      <div className="bg-surface border border-line rounded-2xl p-5 sm:p-6 shadow-sm">
        <h3 className="text-base font-bold text-fg mb-4 flex items-center justify-between">
          <span>Assignments & Coursework</span>
          <span className="text-xs font-normal text-fg-muted">{assignments.length} Available</span>
        </h3>

        {assignments.length === 0 ? (
          <p className="text-xs text-fg-muted py-6 text-center">No coursework or homework assignments published for this class yet.</p>
        ) : (
          <div className="divide-y divide-line">
            {assignments.map((a) => {
              const submission = a.submission;
              return (
                <div key={a.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-surface-2 text-fg border border-line">
                          {a.subjectName}
                        </span>
                        <h4 className="text-sm font-bold text-fg">{a.title}</h4>
                      </div>
                      {a.description && <p className="text-xs text-fg-2 mt-1 leading-relaxed">{a.description}</p>}
                    </div>

                    <div className="flex items-center gap-3 self-start sm:self-center">
                      <div className="text-right">
                        <span className="text-[11px] text-fg-muted block">
                          Due:{" "}
                          {a.dueDate
                            ? new Date(a.dueDate).toLocaleDateString("en-GB", {
                                day: "numeric",
                                month: "short",
                              })
                            : "No deadline"}
                        </span>
                        <span className="text-xs font-semibold text-fg">{a.totalPoints} pts</span>
                      </div>

                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                          submission?.status === "GRADED"
                            ? "bg-ok-bg text-ok-fg"
                            : submission?.status === "SUBMITTED"
                              ? "bg-info-bg text-info-fg"
                              : "bg-surface-2 text-fg-muted border border-line"
                        }`}
                      >
                        {submission?.status === "GRADED" ? `${submission.score}/${a.totalPoints}` : submission?.status || "PENDING"}
                      </span>
                    </div>
                  </div>

                  <div className="mt-2">
                    {a.closed ? (
                      <span className="text-xs text-fg-muted">The deadline has passed and late work is not accepted.</span>
                    ) : submission?.status === "GRADED" || !canSubmit ? null : (
                      <button type="button" onClick={() => setHanding(a)} className={linkButton} aria-label={`${submission ? "Hand in again" : "Hand in"}: ${a.title}`}>
                        {submission ? "Hand in again" : "Hand in"}
                      </button>
                    )}
                  </div>

                  {submission?.feedback && (
                    <div className="mt-2.5 p-2.5 rounded-lg bg-surface-2 border border-line text-xs text-fg-2">
                      <strong className="text-fg">Teacher Feedback:</strong> {submission.feedback}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quizzes: only for someone who may take them (the server does not send them to anyone else) */}
      {canQuiz && (
      <div className="bg-surface border border-line rounded-2xl p-5 sm:p-6 shadow-sm">
        <h3 className="text-base font-bold text-fg mb-4 flex items-center justify-between">
          <span>Quizzes</span>
          <span className="text-xs font-normal text-fg-muted">{quizzes.length} Available</span>
        </h3>
        {quizzes.length === 0 ? (
          <p className="text-xs text-fg-muted py-6 text-center">No quizzes are open for this class yet.</p>
        ) : (
          <div className="divide-y divide-line">
            {quizzes.map((q) => (
              <div key={q.id} className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-surface-2 text-fg border border-line mr-2">{q.subjectName}</span>
                  <span className="text-sm font-bold text-fg">{q.title}</span>
                  <p className="mt-1 text-xs text-fg-muted">
                    {q.questions.length} question{q.questions.length === 1 ? "" : "s"}
                    {q.timeLimitMinutes ? ` · ${q.timeLimitMinutes} minutes` : ""}
                    {q.lastAttempt ? ` · last score ${q.lastAttempt.score}%` : ""}
                  </p>
                </div>
                <button type="button" onClick={() => setTaking(q)} className={primaryButton} aria-label={`${q.lastAttempt ? "Try again" : "Start"}: ${q.title}`}>
                  {q.lastAttempt ? "Try again" : "Start quiz"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {/* Learning Materials & Notes */}
      <div className="bg-surface border border-line rounded-2xl p-5 sm:p-6 shadow-sm">
        <h3 className="text-base font-bold text-fg mb-4 flex items-center justify-between">
          <span>Course Learning Materials & Notes</span>
          <span className="text-xs font-normal text-fg-muted">
            {materials.length} Resource{materials.length === 1 ? "" : "s"}
          </span>
        </h3>

        {materials.length === 0 ? (
          <p className="text-xs text-fg-muted py-6 text-center">No course materials or lesson notes uploaded yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {materials.map((m) => (
              <div key={m.id} className="p-4 rounded-xl border border-line bg-surface-2 flex flex-col justify-between">
                <div>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-surface-2 text-fg border border-line inline-block mb-2">
                    {m.subjectName}
                  </span>
                  <h4 className="text-sm font-bold text-fg">{m.title}</h4>
                  {m.description && <p className="text-xs text-fg-muted mt-1 leading-relaxed">{m.description}</p>}
                  {m.content && (
                    <p className="text-xs text-fg-2 mt-2 line-clamp-3 bg-surface p-2.5 rounded-lg border border-line">{m.content}</p>
                  )}
                </div>
                <div className="mt-3 pt-3 border-t border-line text-[11px] text-fg-muted flex items-center justify-between">
                  <span>
                    Uploaded{" "}
                    {new Date(m.createdAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                  <span className="font-semibold text-brand-fg">Read Lesson</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {handing && (
        <HandInDialog
          assignment={handing}
          studentId={student.id}
          onClose={() => setHanding(null)}
          onDone={() => {
            setHanding(null);
            void onChanged();
          }}
        />
      )}
      {taking && <QuizDialog quiz={taking} studentId={student.id} onClose={() => setTaking(null)} onDone={() => void onChanged()} />}
    </div>
  );
}
