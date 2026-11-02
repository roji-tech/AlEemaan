"use client";

import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { sendJson } from "@/components/auth/postJson";
import { say } from "@/components/academics/common";
import { PrintDialog } from "@/components/question-bank/PrintDialog";

// A quiz's questions for the people who manage it: the list, "Print this quiz" (a watermarked PDF and a line in the print log), and "Offer to the question bank" on a question, which
// sends a copy of it to the reviewers as a new question (it never overwrites the bank's version; it waits in My questions and the review queue like any question). Presentation
// only: the API decides who may do either and says why not.

export type QuizForQuestions = {
  id: string;
  title: string;
  subject: { name: string };
  questions: { id: string; prompt: string; questionType: "MULTIPLE_CHOICE" | "TRUE_FALSE" | "SHORT_ANSWER"; points: number }[];
};
const TYPE_TEXT = { MULTIPLE_CHOICE: "One correct answer", TRUE_FALSE: "True or false", SHORT_ANSWER: "Short answer" } as const;

export function QuizQuestionsDialog({ quiz, branchId, onClose }: { quiz: QuizForQuestions | null; branchId: string; onClose: () => void }) {
  return (
    <Dialog open={quiz !== null} onClose={onClose} title="Quiz questions" description={quiz?.title} wide>
      {quiz && <Body key={quiz.id} quiz={quiz} branchId={branchId} onClose={onClose} />}
    </Dialog>
  );
}

function Body({ quiz, branchId, onClose }: { quiz: QuizForQuestions; branchId: string; onClose: () => void }) {
  const [offering, setOffering] = useState<QuizForQuestions["questions"][number] | null>(null);
  const [offered, setOffered] = useState<string[]>([]);
  const [printing, setPrinting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      <div aria-live="polite" className="empty:hidden">
        {notice && (
          <Alert variant="success" announce={false}>
            {notice}
          </Alert>
        )}
      </div>
      {quiz.questions.length === 0 ? (
        <p className="text-sm text-fg-muted">This quiz has no questions.</p>
      ) : (
        <ol aria-label="Questions of the quiz" className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {quiz.questions.map((q, i) => (
            <li key={q.id} className="space-y-2 p-4">
              <p className="text-sm font-medium text-fg">
                <span className="text-fg-muted">{i + 1}. </span>
                {q.prompt}
              </p>
              <p className="text-sm text-fg-2">
                {TYPE_TEXT[q.questionType]} · {q.points} {q.points === 1 ? "point" : "points"}
              </p>
              {offered.includes(q.id) ? (
                <p className="text-sm font-semibold text-ok-fg">Offered to the question bank.</p>
              ) : (
                <Button variant="secondary" onClick={() => setOffering(q)}>
                  Offer to the question bank
                </Button>
              )}
            </li>
          ))}
        </ol>
      )}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
        <Button variant="secondary" onClick={() => setPrinting(true)}>
          Print this quiz
        </Button>
      </div>

      <OfferDialog
        question={offering}
        quiz={quiz}
        branchId={branchId}
        onClose={() => setOffering(null)}
        onOffered={(id) => {
          setOffering(null);
          setOffered((o) => [...o, id]);
          setNotice("Offered. A reviewer will look at it, and you will find it in My questions in the Question bank.");
        }}
      />
      <PrintDialog
        open={printing}
        onClose={() => setPrinting(false)}
        onPrinted={() => {
          setPrinting(false);
          setNotice("The PDF was downloaded and the print is in the print log.");
        }}
        branchId={branchId}
        targetKind="QUIZ"
        targetId={quiz.id}
        noun="quiz"
      />
    </div>
  );
}

function OfferDialog({
  question,
  quiz,
  branchId,
  onClose,
  onOffered,
}: {
  question: QuizForQuestions["questions"][number] | null;
  quiz: QuizForQuestions;
  branchId: string;
  onClose: () => void;
  onOffered: (questionId: string) => void;
}) {
  return (
    <Dialog open={question !== null} onClose={onClose} title="Offer to the question bank" description={question?.prompt}>
      {question && <OfferForm question={question} quiz={quiz} branchId={branchId} onClose={onClose} onOffered={onOffered} />}
    </Dialog>
  );
}

function OfferForm({
  question,
  quiz,
  branchId,
  onClose,
  onOffered,
}: {
  question: QuizForQuestions["questions"][number];
  quiz: QuizForQuestions;
  branchId: string;
  onClose: () => void;
  onOffered: (questionId: string) => void;
}) {
  const [subject, setSubject] = useState(quiz.subject.name);
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [refused, setRefused] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setRefused(null);
    setBusy(true);
    const reply = await sendJson("/api/v1/question-bank/items/offer-back", "POST", {
      branchId,
      quizId: quiz.id,
      quizQuestionId: question.id,
      ...(subject.trim() ? { subjectLabel: subject.trim() } : {}),
      ...(topic.trim() ? { topic: topic.trim() } : {}),
      ...(difficulty ? { difficulty: Number(difficulty) } : {}),
    });
    setBusy(false);
    if (!reply.ok) return setRefused(say(reply, "It couldn't be offered."));
    onOffered(question.id);
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <p className="text-sm text-fg-2">
        A copy goes to the reviewers as a new question. The bank&apos;s own question is never overwritten.
      </p>
      {refused && <Alert variant="error">{refused}</Alert>}
      <TextField label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={80} />
      <TextField label="Topic (optional)" value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={100} />
      <SelectField
        label="Difficulty (optional)"
        value={difficulty}
        onChange={(e) => setDifficulty(e.target.value)}
        options={[{ value: "", label: "Not said" }, ...[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n} of 5` }))]}
      />
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" loading={busy}>
          {busy ? "Offering…" : "Offer it"}
        </Button>
      </div>
    </form>
  );
}
