"use client";

import { useState, useEffect } from "react";
import { Dialog } from "@/components/ui/Dialog";

interface QuizOption {
  id: string;
  text: string;
}

interface Question {
  id: string;
  prompt: string;
  questionType: "MULTIPLE_CHOICE" | "TRUE_FALSE" | "SHORT_ANSWER";
  options: QuizOption[];
  points: number;
}

export interface QuizAttemptModalProps {
  isOpen: boolean;
  onClose: () => void;
  quizId: string;
  quizTitle: string;
  timeLimitMinutes: number | null;
  passingScore: number | null;
  questions: Question[];
  onComplete?: () => void;
}

interface AttemptResult {
  score: number;
  totalPoints: number;
  percentageScore: number;
  passed: boolean;
}

export function QuizAttemptModal({
  isOpen,
  onClose,
  quizId,
  quizTitle,
  timeLimitMinutes,
  passingScore,
  questions,
  onComplete,
}: QuizAttemptModalProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeftSeconds, setTimeLeftSeconds] = useState<number | null>(
    timeLimitMinutes ? timeLimitMinutes * 60 : null
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AttemptResult | null>(null);

  // Timer countdown
  useEffect(() => {
    if (!isOpen || timeLeftSeconds === null || timeLeftSeconds <= 0 || result) {
      return;
    }
    const timer = setInterval(() => {
      setTimeLeftSeconds((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, timeLeftSeconds, result]);

  const handleSelectOption = (questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);

    const formattedAnswers = Object.entries(answers).map(([qId, ans]) => ({
      questionId: qId,
      answer: ans,
    }));

    try {
      const res = await fetch(`/api/v1/lms/quizzes/${quizId}/attempt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: formattedAnswers,
        }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error?.message || "Failed to submit quiz attempt");
      }

      const data = await res.json();
      setResult(data.data);
      if (onComplete) onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error submitting quiz");
    } finally {
      setSubmitting(false);
    }
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  return (
    <Dialog open={isOpen} onClose={onClose} title={`Assessment: ${quizTitle}`}>
      {result ? (
        <div className="py-6 text-center space-y-4">
          <div
            className={`inline-flex items-center justify-center w-16 h-16 rounded-full text-2xl font-bold ${
              result.passed
                ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                : "bg-destructive/10 text-destructive border border-destructive/20"
            }`}
          >
            {result.passed ? "✓" : "!"}
          </div>

          <div>
            <h3 className="text-xl font-bold text-foreground">
              {result.passed ? "Assessment Passed!" : "Assessment Incomplete / Try Again"}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              You scored <span className="font-semibold text-foreground">{result.score}</span> out
              of {result.totalPoints} points ({result.percentageScore}%).
            </p>
            {passingScore !== null && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Required passing grade: {passingScore}%
              </p>
            )}
          </div>

          <div className="pt-4 border-t border-border flex justify-center">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              Close
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6 max-h-[75vh] overflow-y-auto px-1">
          {error && (
            <div
              role="alert"
              className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm"
            >
              {error}
            </div>
          )}

          {timeLeftSeconds !== null && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-primary/10 border border-primary/20 text-sm">
              <span className="font-medium text-primary">Time Remaining:</span>
              <span
                className={`font-mono font-bold ${
                  timeLeftSeconds < 120 ? "text-destructive animate-pulse" : "text-primary"
                }`}
              >
                {formatTimer(timeLeftSeconds)}
              </span>
            </div>
          )}

          <div className="space-y-6">
            {questions.map((q, idx) => (
              <div
                key={q.id}
                className="p-4 rounded-xl border border-border bg-card space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-sm font-semibold text-foreground">
                    <span className="text-muted-foreground mr-1.5">{idx + 1}.</span>
                    {q.prompt}
                  </h4>
                  <span className="text-xs font-medium text-muted-foreground shrink-0">
                    {q.points} {q.points === 1 ? "pt" : "pts"}
                  </span>
                </div>

                {q.questionType === "MULTIPLE_CHOICE" && (
                  <div className="space-y-2 pt-1">
                    {q.options.map((opt) => (
                      <label
                        key={opt.id}
                        className={`flex items-center gap-3 p-2.5 rounded-lg border text-sm cursor-pointer transition-colors ${
                          answers[q.id] === opt.id
                            ? "border-primary bg-primary/5 text-foreground font-medium"
                            : "border-border/60 hover:bg-muted/50 text-muted-foreground"
                        }`}
                      >
                        <input
                          type="radio"
                          name={`q-${q.id}`}
                          value={opt.id}
                          checked={answers[q.id] === opt.id}
                          onChange={() => handleSelectOption(q.id, opt.id)}
                          className="text-primary focus:ring-primary"
                        />
                        <span>{opt.text}</span>
                      </label>
                    ))}
                  </div>
                )}

                {q.questionType === "TRUE_FALSE" && (
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    {["true", "false"].map((val) => (
                      <label
                        key={val}
                        className={`flex items-center justify-center p-3 rounded-lg border text-sm cursor-pointer capitalize transition-colors ${
                          answers[q.id] === val
                            ? "border-primary bg-primary/5 text-foreground font-semibold"
                            : "border-border/60 hover:bg-muted/50 text-muted-foreground"
                        }`}
                      >
                        <input
                          type="radio"
                          name={`q-${q.id}`}
                          value={val}
                          checked={answers[q.id] === val}
                          onChange={() => handleSelectOption(q.id, val)}
                          className="sr-only"
                        />
                        <span>{val}</span>
                      </label>
                    ))}
                  </div>
                )}

                {q.questionType === "SHORT_ANSWER" && (
                  <div className="pt-1">
                    <input
                      type="text"
                      placeholder="Type your answer here..."
                      value={answers[q.id] || ""}
                      onChange={(e) => handleSelectOption(q.id, e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="inline-flex justify-center rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50"
            >
              {submitting ? "Evaluating..." : "Submit Answers"}
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
