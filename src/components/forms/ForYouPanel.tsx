"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { Dialog } from "@/components/ui/Dialog";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { TextField } from "@/components/ui/TextField";
import { getJson, sendJson } from "@/components/auth/postJson";
import { say, type Notice } from "@/components/academics/common";
import { plural, windowText, type QuestionType } from "@/components/forms/model";

// Questionnaires addressed to the signed-in member of staff, answered in place. Presentation only: the API decides who is addressed, whether it is open, and whether an answer
// has already been given; an anonymous questionnaire is stored with no link to the person, and this screen says so before it is answered.

type Available = {
  id: string;
  title: string;
  instructions: string | null;
  isAnonymous: boolean;
  questionCount: number;
  opensAt: string | null;
  closesAt: string | null;
  hasSubmitted: boolean;
};
type Option = { id: string; text: string };
type AskedQuestion = { id: string; prompt: string; questionType: QuestionType; options: unknown };
type Value = string | string[] | number;

const optionsOf = (q: AskedQuestion): Option[] =>
  Array.isArray(q.options) ? (q.options as Option[]).filter((o) => o && typeof o.id === "string" && typeof o.text === "string") : [];

export function ForYouPanel({ branchId }: { branchId: string }) {
  const [list, setList] = useState<Available[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [answering, setAnswering] = useState<Available | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const reply = await getJson(`/api/v1/forms/available?branchId=${encodeURIComponent(branchId)}`, signal);
      if (signal?.aborted) return;
      if (!reply.ok) return setFailed(say(reply, "The questionnaires couldn't be loaded."));
      setFailed(null);
      setList((reply.data?.questionnaires ?? []) as Available[]);
    },
    [branchId],
  );

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load when the branch changes
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-fg">For you</h2>
      {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
      {failed && <Alert variant="error">{failed}</Alert>}
      {list === null && !failed ? (
        <p className="text-sm text-fg-muted">Loading…</p>
      ) : list !== null && list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
          Nothing is waiting for you.
        </p>
      ) : (
        <ul className="space-y-3">
          {(list ?? []).map((q) => (
            <li key={q.id} className="space-y-2 rounded-2xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold break-words text-fg">{q.title}</p>
                  {q.instructions && <p className="mt-1 text-sm break-words text-fg-muted">{q.instructions}</p>}
                </div>
                {q.hasSubmitted ? (
                  <span className="shrink-0 rounded-full border border-ok-line bg-ok-bg px-3 py-1 text-xs font-semibold text-ok-fg">
                    Answered
                  </span>
                ) : (
                  <Button onClick={() => setAnswering(q)}>
                    Answer<span className="sr-only"> {q.title}</span>
                  </Button>
                )}
              </div>
              <p className="text-sm text-fg-muted">
                {[windowText(q.opensAt, q.closesAt), plural(q.questionCount, "question"), q.isAnonymous ? "Anonymous" : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={answering !== null} onClose={() => setAnswering(null)} title={answering?.title ?? "Questionnaire"} wide>
        {answering && (
          <AnswerBody
            key={answering.id}
            branchId={branchId}
            form={answering}
            onClose={() => setAnswering(null)}
            onSent={() => {
              setNotice({ variant: "success", text: "Thank you. Your answers were sent." });
              void load();
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function AnswerBody({ branchId, form, onClose, onSent }: { branchId: string; form: Available; onClose: () => void; onSent: () => void }) {
  const [questions, setQuestions] = useState<AskedQuestion[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, Value>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const reply = await getJson(
        `/api/v1/forms/${encodeURIComponent(form.id)}?branchId=${encodeURIComponent(branchId)}`,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if (!reply.ok) return setLoadError(say(reply, "The questions couldn't be loaded."));
      setQuestions(((reply.data?.form as { questions?: AskedQuestion[] } | undefined)?.questions ?? []) as AskedQuestion[]);
    })();
    return () => controller.abort();
  }, [branchId, form.id]);

  const set = (id: string, value: Value | null) =>
    setValues((current) => {
      const next = { ...current };
      if (value === null || value === "" || (Array.isArray(value) && value.length === 0)) delete next[id];
      else next[id] = value;
      return next;
    });

  async function send(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const answers = Object.entries(values).map(([formQuestionId, value]) => ({ formQuestionId, value }));
    if (answers.length === 0) return setProblem("Answer at least one question.");
    setProblem(null);
    setPending(true);
    const reply = await sendJson(`/api/v1/forms/${encodeURIComponent(form.id)}/submit?branchId=${encodeURIComponent(branchId)}`, "POST", {
      answers,
    });
    setPending(false);
    if (!reply.ok) return setProblem(say(reply, "Your answers couldn't be sent."));
    onSent();
    onClose();
  }

  if (loadError) return <Alert variant="error">{loadError}</Alert>;
  if (questions === null) return <p className="text-sm text-fg-muted">Loading…</p>;

  return (
    <form onSubmit={send} className="space-y-5" noValidate>
      {form.instructions && <p className="text-sm text-fg-2">{form.instructions}</p>}
      <p className="text-sm text-fg-muted">
        {form.isAnonymous
          ? "This questionnaire is anonymous: nobody, including whoever set it, can see who gave which answer."
          : "Whoever set this questionnaire can see who gave which answer."}
      </p>
      {problem && <Alert variant="error">{problem}</Alert>}
      {questions.map((q) => {
        const options = optionsOf(q);
        const value = values[q.id];
        if (q.questionType === "SINGLE" || q.questionType === "TRUE_FALSE" || q.questionType === "RATING") {
          const choices: Option[] =
            q.questionType === "RATING"
              ? [1, 2, 3, 4, 5].map((n) => ({ id: String(n), text: String(n) }))
              : q.questionType === "TRUE_FALSE"
                ? [
                    { id: "true", text: "True" },
                    { id: "false", text: "False" },
                  ]
                : options;
          return (
            <fieldset key={q.id} className="space-y-1">
              <legend className="text-sm font-semibold break-words text-fg">{q.prompt}</legend>
              {q.questionType === "RATING" && <p className="text-xs text-fg-muted">1 is the lowest, 5 the highest.</p>}
              <div className={q.questionType === "RATING" ? "flex flex-wrap gap-x-5" : "space-y-0"}>
                {choices.map((c) => (
                  <label key={c.id} className="flex min-h-11 items-center gap-3 text-sm text-fg-2">
                    <input
                      type="radio"
                      name={`q-${q.id}`}
                      checked={String(value) === c.id}
                      onChange={() => set(q.id, q.questionType === "RATING" ? Number(c.id) : c.id)}
                    />
                    {c.text}
                  </label>
                ))}
              </div>
            </fieldset>
          );
        }
        if (q.questionType === "MULTI") {
          const picked = Array.isArray(value) ? value : [];
          return (
            <fieldset key={q.id} className="space-y-1">
              <legend className="text-sm font-semibold break-words text-fg">{q.prompt}</legend>
              <p className="text-xs text-fg-muted">Tick all that apply.</p>
              {options.map((o) => (
                <CheckboxField
                  key={o.id}
                  label={o.text}
                  checked={picked.includes(o.id)}
                  onChange={(e) => set(q.id, e.target.checked ? [...picked, o.id] : picked.filter((x) => x !== o.id))}
                />
              ))}
            </fieldset>
          );
        }
        return q.questionType === "TEXT" ? (
          <TextAreaField
            key={q.id}
            label={q.prompt}
            rows={3}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => set(q.id, e.target.value)}
            maxLength={5000}
          />
        ) : (
          <TextField
            key={q.id}
            label={q.prompt}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => set(q.id, e.target.value)}
            maxLength={1000}
          />
        );
      })}
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          Send my answers
        </Button>
      </div>
    </form>
  );
}
