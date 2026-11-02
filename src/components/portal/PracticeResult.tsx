"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { getJson } from "@/components/auth/postJson";
import { say } from "@/components/academics/common";
import { downloadPdf } from "@/components/forms/pdf";
import { keyValue, plural, valueText, type QuestionType } from "@/components/forms/model";

// The result of a pupil's attempt, as the API says the pupil may see it. An answer the machine marked shows whether it was right, the correct answer and the explanation. An answer
// that still waits for the teacher shows no score and no key and says so, and the total is "so far": a score that does not exist yet is never shown as a final zero. Presentation
// only: the API withholds what the rules withhold, and nothing here fetches a key to hide it.

type ResultAnswer = {
  answerId: string;
  prompt: string;
  questionType: QuestionType;
  options: unknown;
  points: number;
  submittedValue: unknown;
  score: number | null;
  isCorrect: boolean | null;
  feedback: string | null;
  isPending: boolean;
  correctAnswer: string | null;
  explanation: string | null;
};
type Result = { formTitle: string; score: number | null; maxScore: number | null; answers: ResultAnswer[] };

export function PracticeResult({
  studentId,
  formId,
  responseId,
  onBack,
}: {
  studentId: string;
  formId: string;
  responseId: string;
  onBack: () => void;
}) {
  const base = `/api/v1/portal/students/${encodeURIComponent(studentId)}/forms/practice-sets/${encodeURIComponent(formId)}/responses/${encodeURIComponent(responseId)}`;
  const [result, setResult] = useState<Result | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const reply = await getJson(base, controller.signal);
      if (controller.signal.aborted) return;
      if (!reply.ok) return setFailed(say(reply, "The result couldn't be loaded."));
      setResult(reply.data?.response as Result);
    })();
    return () => controller.abort();
  }, [base]);

  async function download() {
    setPrinting(true);
    const reply = await getJson(`${base}/print?format=json`);
    setPrinting(false);
    const pdf = reply.data?.pdfBase64;
    if (!reply.ok || typeof pdf !== "string") return setFailed(say(reply, "The PDF couldn't be made."));
    downloadPdf(pdf, `${String(reply.data?.title ?? "result")}.pdf`);
  }

  const waiting = result?.answers.filter((a) => a.isPending).length ?? 0;

  return (
    <section aria-label="Your result" className="space-y-5">
      {failed && <Alert variant="error">{failed}</Alert>}
      {result === null && !failed && <p className="text-sm text-fg-muted">Loading…</p>}
      {result && (
        <>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold break-words text-fg">{result.formTitle}</h2>
            {result.score !== null && result.maxScore !== null && (
              <p className="text-base font-semibold text-fg">
                {waiting > 0 ? "Score so far" : "Your score"}: {result.score} of {result.maxScore}
              </p>
            )}
            {waiting > 0 && (
              <p className="text-sm text-fg-2">Your teacher still has to mark {plural(waiting, "answer")}, so this may go up.</p>
            )}
          </div>

          <ol aria-label="Answers" className="space-y-4">
            {result.answers.map((a, i) => (
              <li key={a.answerId} className="space-y-2 rounded-2xl border border-line bg-surface p-4">
                <p className="text-xs font-semibold text-fg-muted">
                  <span className="text-fg">Question {i + 1}</span> · {plural(a.points, "point")}
                </p>
                <p className="text-sm break-words whitespace-pre-wrap text-fg">{a.prompt}</p>
                <p className="text-sm text-fg-2">
                  <span className="font-semibold text-fg">Your answer: </span>
                  <span className="break-words whitespace-pre-wrap">{valueText(a.questionType, a.options, a.submittedValue)}</span>
                </p>
                {a.isPending ? (
                  <p className="text-sm font-medium text-fg-2">Waiting for your teacher to mark this answer.</p>
                ) : (
                  <>
                    <p className="text-sm font-medium text-fg">
                      {a.isCorrect === true ? "Correct" : a.isCorrect === false ? "Not quite" : null}
                      {a.isCorrect !== null && a.score !== null ? " · " : ""}
                      {a.score !== null ? `Score: ${a.score} of ${a.points}` : null}
                    </p>
                    {a.isCorrect !== true && a.correctAnswer && (
                      <p className="text-sm text-fg-2">
                        <span className="font-semibold text-fg">Correct answer: </span>
                        <span className="break-words">
                          {valueText(a.questionType, a.options, keyValue(a.questionType, a.correctAnswer))}
                        </span>
                      </p>
                    )}
                    {a.explanation && (
                      <p className="text-sm text-fg-2">
                        <span className="font-semibold text-fg">Explanation: </span>
                        <span className="break-words">{a.explanation}</span>
                      </p>
                    )}
                    {a.feedback && (
                      <p className="text-sm text-fg-2">
                        <span className="font-semibold text-fg">Your teacher says: </span>
                        <span className="break-words whitespace-pre-wrap">{a.feedback}</span>
                      </p>
                    )}
                  </>
                )}
              </li>
            ))}
          </ol>

          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" loading={printing} onClick={download}>
              Download PDF
            </Button>
            <Button variant="ghost" onClick={onBack}>
              Back to practice sets
            </Button>
          </div>
        </>
      )}
      {failed && result === null && (
        <Button variant="ghost" onClick={onBack}>
          Back to practice sets
        </Button>
      )}
    </section>
  );
}
