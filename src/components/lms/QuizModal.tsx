"use client";

import { useState, useId, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";

export interface QuizModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  branchId: string;
  subjects: { id: string; name: string }[];
  classGroups: { id: string; name: string }[];
}

interface QuestionDraft {
  prompt: string;
  questionType: "MULTIPLE_CHOICE" | "TRUE_FALSE" | "SHORT_ANSWER";
  options: { id: string; text: string }[];
  correctAnswer: string;
  points: number;
}

export function QuizModal({ isOpen, onClose, onSuccess, branchId, subjects, classGroups }: QuizModalProps) {
  const [title, setTitle] = useState("");
  const [subjectId, setSubjectId] = useState(subjects[0]?.id || "");
  const [classGroupId, setClassGroupId] = useState("");
  const [instructions, setInstructions] = useState("");
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number | "">(30);
  const [passingScore, setPassingScore] = useState<number | "">(60);
  const [status, setStatus] = useState<"DRAFT" | "PUBLISHED">("PUBLISHED");

  const [questions, setQuestions] = useState<QuestionDraft[]>([
    {
      prompt: "",
      questionType: "MULTIPLE_CHOICE",
      options: [
        { id: "opt-1", text: "" },
        { id: "opt-2", text: "" },
      ],
      correctAnswer: "opt-1",
      points: 5,
    },
  ]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titleId = useId();
  const subjectIdField = useId();
  const classGroupIdField = useId();
  const instructionsId = useId();
  const timeLimitId = useId();
  const passingScoreId = useId();
  const statusId = useId();

  const handleAddQuestion = () => {
    setQuestions((prev) => [
      ...prev,
      {
        prompt: "",
        questionType: "MULTIPLE_CHOICE",
        options: [
          { id: "opt-1", text: "" },
          { id: "opt-2", text: "" },
        ],
        correctAnswer: "opt-1",
        points: 5,
      },
    ]);
  };

  const handleRemoveQuestion = (idx: number) => {
    if (questions.length <= 1) return;
    setQuestions((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateQuestion = (idx: number, patch: Partial<QuestionDraft>) => {
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Basic client validation
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.prompt.trim()) {
        setError(`Question ${i + 1} prompt cannot be empty`);
        setLoading(false);
        return;
      }
      if (q.questionType === "MULTIPLE_CHOICE") {
        if (q.options.some((o) => !o.text.trim())) {
          setError(`All options in Question ${i + 1} must have text`);
          setLoading(false);
          return;
        }
      }
    }

    try {
      const payload = {
        branchId,
        title,
        subjectId: subjectId || subjects[0]?.id,
        classGroupId: classGroupId || null,
        instructions: instructions || null,
        timeLimitMinutes: timeLimitMinutes ? Number(timeLimitMinutes) : null,
        passingScore: passingScore ? Number(passingScore) : null,
        status,
        questions: questions.map((q, idx) => ({
          prompt: q.prompt,
          questionType: q.questionType,
          options: q.options,
          correctAnswer: q.correctAnswer,
          points: Number(q.points) || 1,
          sortOrder: idx,
        })),
      };

      const res = await fetch("/api/v1/lms/quizzes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error?.message || "Failed to create quiz");
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creating quiz");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onClose={onClose} title="Create Interactive Quiz / Test">
      <form onSubmit={handleSubmit} className="space-y-5 max-h-[75vh] overflow-y-auto px-1">
        {error && (
          <div role="alert" className="p-3 rounded-lg bg-danger-bg border border-danger-line text-danger-fg text-sm">
            {error}
          </div>
        )}

        <div>
          <label htmlFor={titleId} className="block text-sm font-medium text-fg">
            Quiz Title <span className="text-danger-fg">*</span>
          </label>
          <input
            id={titleId}
            type="text"
            required
            placeholder="e.g. Mid-term Assessment: Fiqh of Taharah"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 block w-full rounded-md border border-line-strong bg-field px-3 py-2 text-sm text-fg shadow-sm focus:border-brand-fg focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor={subjectIdField} className="block text-sm font-medium text-fg">
              Subject <span className="text-danger-fg">*</span>
            </label>
            <select
              id={subjectIdField}
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-line-strong bg-field px-3 py-2 text-sm text-fg shadow-sm focus:border-brand-fg focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={classGroupIdField} className="block text-sm font-medium text-fg">
              Target Class (Optional)
            </label>
            <select
              id={classGroupIdField}
              value={classGroupId}
              onChange={(e) => setClassGroupId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-line-strong bg-field px-3 py-2 text-sm text-fg shadow-sm focus:border-brand-fg focus:outline-none focus:ring-1 focus:ring-ring"
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

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor={timeLimitId} className="block text-sm font-medium text-fg">
              Time Limit (Minutes)
            </label>
            <input
              id={timeLimitId}
              type="number"
              min={1}
              max={360}
              placeholder="30"
              value={timeLimitMinutes}
              onChange={(e) => setTimeLimitMinutes(e.target.value ? Number(e.target.value) : "")}
              className="mt-1 block w-full rounded-md border border-line-strong bg-field px-3 py-2 text-sm text-fg shadow-sm focus:border-brand-fg focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div>
            <label htmlFor={passingScoreId} className="block text-sm font-medium text-fg">
              Passing Score (%)
            </label>
            <input
              id={passingScoreId}
              type="number"
              min={0}
              max={100}
              placeholder="60"
              value={passingScore}
              onChange={(e) => setPassingScore(e.target.value ? Number(e.target.value) : "")}
              className="mt-1 block w-full rounded-md border border-line-strong bg-field px-3 py-2 text-sm text-fg shadow-sm focus:border-brand-fg focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div>
            <label htmlFor={statusId} className="block text-sm font-medium text-fg">
              Status
            </label>
            <select
              id={statusId}
              value={status}
              onChange={(e) => setStatus(e.target.value as "DRAFT" | "PUBLISHED")}
              className="mt-1 block w-full rounded-md border border-line-strong bg-field px-3 py-2 text-sm text-fg shadow-sm focus:border-brand-fg focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="PUBLISHED">Published (Active)</option>
              <option value="DRAFT">Draft (Hidden)</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor={instructionsId} className="block text-sm font-medium text-fg">
            Instructions
          </label>
          <textarea
            id={instructionsId}
            rows={2}
            placeholder="Instructions for students before beginning the quiz..."
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            className="mt-1 block w-full rounded-md border border-line-strong bg-field px-3 py-2 text-sm text-fg shadow-sm focus:border-brand-fg focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {/* Questions Builder */}
        <div className="pt-4 border-t border-line space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-fg">Questions ({questions.length})</h4>
            <button type="button" onClick={handleAddQuestion} className="text-xs font-semibold text-brand-fg hover:underline">
              + Add Question
            </button>
          </div>

          {questions.map((q, idx) => (
            <div key={idx} className="p-4 rounded-xl border border-line bg-surface space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-fg-muted">Question #{idx + 1}</span>
                {questions.length > 1 && (
                  <button type="button" onClick={() => handleRemoveQuestion(idx)} className="text-xs text-danger-fg hover:underline">
                    Remove
                  </button>
                )}
              </div>

              <div>
                <input
                  type="text"
                  required
                  placeholder={`Question prompt (e.g. How many pillars of Islam are there?)`}
                  value={q.prompt}
                  onChange={(e) => updateQuestion(idx, { prompt: e.target.value })}
                  className="w-full rounded-md border border-line-strong bg-field px-3 py-1.5 text-sm text-fg shadow-sm focus:border-brand-fg focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-fg-muted mb-1">Question Type</label>
                  <select
                    value={q.questionType}
                    onChange={(e) => {
                      const type = e.target.value as QuestionDraft["questionType"];
                      let opts = q.options;
                      let correct = q.correctAnswer;
                      if (type === "TRUE_FALSE") {
                        opts = [
                          { id: "true", text: "True" },
                          { id: "false", text: "False" },
                        ];
                        correct = "true";
                      } else if (type === "SHORT_ANSWER") {
                        opts = [];
                        correct = "";
                      } else if (type === "MULTIPLE_CHOICE" && opts.length === 0) {
                        opts = [
                          { id: "opt-1", text: "" },
                          { id: "opt-2", text: "" },
                        ];
                        correct = "opt-1";
                      }
                      updateQuestion(idx, {
                        questionType: type,
                        options: opts,
                        correctAnswer: correct,
                      });
                    }}
                    className="w-full rounded-md border border-line-strong bg-field px-2 py-1 shadow-sm"
                  >
                    <option value="MULTIPLE_CHOICE">Multiple Choice</option>
                    <option value="TRUE_FALSE">True / False</option>
                    <option value="SHORT_ANSWER">Short Answer</option>
                  </select>
                </div>

                <div>
                  <label className="block text-fg-muted mb-1">Points</label>
                  <input
                    type="number"
                    min={1}
                    value={q.points}
                    onChange={(e) => updateQuestion(idx, { points: Number(e.target.value) || 1 })}
                    className="w-full rounded-md border border-line-strong bg-field px-2 py-1 shadow-sm"
                  />
                </div>
              </div>

              {/* Options for MULTIPLE_CHOICE */}
              {q.questionType === "MULTIPLE_CHOICE" && (
                <div className="space-y-2 pt-2">
                  <span className="text-xs font-medium text-fg block">Options & Correct Answer:</span>
                  {q.options.map((opt, oIdx) => (
                    <div key={opt.id} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`correct-${idx}`}
                        checked={q.correctAnswer === opt.id}
                        onChange={() => updateQuestion(idx, { correctAnswer: opt.id })}
                        title="Mark as correct answer"
                        className="text-brand-fg focus:ring-ring h-4 w-4"
                      />
                      <input
                        type="text"
                        placeholder={`Option ${oIdx + 1}`}
                        value={opt.text}
                        onChange={(e) => {
                          const newOpts = [...q.options];
                          newOpts[oIdx] = { ...opt, text: e.target.value };
                          updateQuestion(idx, { options: newOpts });
                        }}
                        className="flex-1 rounded-md border border-line-strong bg-field px-2 py-1 text-xs"
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      const newId = `opt-${q.options.length + 1}`;
                      updateQuestion(idx, {
                        options: [...q.options, { id: newId, text: "" }],
                      });
                    }}
                    className="text-xs text-brand-fg hover:underline font-medium"
                  >
                    + Add Option
                  </button>
                </div>
              )}

              {/* Options for TRUE_FALSE */}
              {q.questionType === "TRUE_FALSE" && (
                <div className="flex items-center gap-4 pt-2">
                  <label className="inline-flex items-center gap-1.5 text-xs">
                    <input
                      type="radio"
                      name={`tf-${idx}`}
                      checked={q.correctAnswer === "true"}
                      onChange={() => updateQuestion(idx, { correctAnswer: "true" })}
                      className="text-brand-fg focus:ring-ring"
                    />
                    <span>True</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-xs">
                    <input
                      type="radio"
                      name={`tf-${idx}`}
                      checked={q.correctAnswer === "false"}
                      onChange={() => updateQuestion(idx, { correctAnswer: "false" })}
                      className="text-brand-fg focus:ring-ring"
                    />
                    <span>False</span>
                  </label>
                </div>
              )}

              {/* Input for SHORT_ANSWER */}
              {q.questionType === "SHORT_ANSWER" && (
                <div className="pt-1">
                  <label className="block text-xs text-fg-muted mb-1">Expected exact keyword or phrase</label>
                  <input
                    type="text"
                    required
                    placeholder="Correct keyword"
                    value={q.correctAnswer}
                    onChange={(e) => updateQuestion(idx, { correctAnswer: e.target.value })}
                    className="w-full rounded-md border border-line-strong bg-field px-2 py-1 text-xs"
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-line">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg border border-line-strong bg-field px-4 py-2 text-sm font-medium text-fg hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex justify-center rounded-lg bg-brand-strong px-4 py-2 text-sm font-medium text-white shadow hover:bg-brand-strong-hover focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50"
          >
            {loading ? "Creating..." : "Save & Publish Quiz"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
