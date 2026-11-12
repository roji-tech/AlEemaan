"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import { getJson } from "@/components/auth/postJson";
import { say } from "@/components/academics/common";
import { whenText } from "@/components/question-bank/model";

// The print log: who printed what, when, how many pages and why, newest first, for a branch (`GET .../print-logs`). Presentation only: the list is what the server answered. A log line
// is never changed or removed (the table is append-only), so there is nothing to edit here.

type TargetKind = "QUESTION_BANK_ITEM" | "FORM" | "QUIZ" | "PRACTICE_SESSION" | "FORM_RESPONSE";
type Person = { id: string; name: string; admissionNo?: string; email?: string };
type PrintLog = {
  id: string;
  targetKind: TargetKind;
  title: string;
  pageCount: number;
  reason: string | null;
  createdAt: string;
  printedBy: Person | null;
  student: Person | null;
  recipientStudent: Person | null;
};

const KIND_LABEL: Record<TargetKind, string> = {
  QUESTION_BANK_ITEM: "A question",
  FORM: "A form",
  QUIZ: "A quiz",
  PRACTICE_SESSION: "A practice session",
  FORM_RESPONSE: "A pupil's answers",
};
const PAGE = 20;

export function PrintLogPanel({ branches }: { branches: { id: string; name: string }[] }) {
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [kind, setKind] = useState<"" | TargetKind>("");
  const [logs, setLogs] = useState<PrintLog[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [version, setVersion] = useState(0);

  const query = (page: number) => {
    const q = new URLSearchParams({ branchId, page: String(page), pageSize: String(PAGE) });
    if (kind) q.set("targetKind", kind);
    return `/api/v1/question-bank/print-logs?${q.toString()}`;
  };

  // The log is read again when the branch or the kind changes; an older answer never overwrites a newer one.
  useEffect(() => {
    if (!branchId) return;
    let current = true;
    void (async () => {
      const reply = await getJson(query(1));
      if (!current) return;
      if (!reply.ok) return setError(say(reply, "Couldn't load the print log."));
      setError(null);
      setLogs(reply.data!.logs as PrintLog[]);
      setTotal(reply.data!.total as number);
    })();
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `query` is built from exactly these values
  }, [branchId, kind, version]);

  async function showMore() {
    if (!logs || more) return;
    setMore(true);
    const reply = await getJson(query(Math.floor(logs.length / PAGE) + 1));
    setMore(false);
    if (!reply.ok) return setError(say(reply, "Couldn't load more of the print log."));
    setLogs((current) => [...(current ?? []), ...(reply.data!.logs as PrintLog[])]);
  }

  if (!branchId) return <p className="text-sm text-fg-muted">You are not staff in a branch, so there is no print log to show.</p>;

  return (
    <div className="space-y-5">
      <p className="text-sm text-fg-2">
        Every print of a question, a quiz, a form or a pupil&apos;s answers, newest first. A line is never changed or removed.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        {branches.length > 1 && (
          <div className="sm:w-56">
            <SelectField
              label="Branch"
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              options={branches.map((b) => ({ value: b.id, label: b.name }))}
            />
          </div>
        )}
        <div className="sm:w-56">
          <SelectField
            label="What was printed"
            value={kind}
            onChange={(e) => setKind(e.target.value as "" | TargetKind)}
            options={[
              { value: "", label: "Anything" },
              ...(Object.keys(KIND_LABEL) as TargetKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] })),
            ]}
          />
        </div>
      </div>

      <div aria-live="polite" className="empty:hidden">
        {error && (
          <Alert variant="error">
            <div className="flex flex-wrap items-center gap-3">
              <span>{error}</span>
              <Button variant="secondary" onClick={() => setVersion((v) => v + 1)}>
                Try again
              </Button>
            </div>
          </Alert>
        )}
      </div>

      {logs === null ? (
        !error && (
          <p className="text-sm text-fg-muted" aria-busy="true">
            Loading…
          </p>
        )
      ) : logs.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
          {kind ? "Nothing of that kind has been printed." : "Nothing has been printed yet."}
        </p>
      ) : (
        <>
          <ul aria-label="Print log" className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {logs.map((log) => (
              <li key={log.id} className="space-y-1 p-4">
                <p className="font-medium text-fg">{log.title}</p>
                <p className="text-sm text-fg-2">
                  {KIND_LABEL[log.targetKind]} · {log.pageCount} {log.pageCount === 1 ? "page" : "pages"} · printed by{" "}
                  {log.printedBy?.name ?? (log.student ? `${log.student.name} (pupil)` : "someone")} · {whenText(log.createdAt)}
                </p>
                {log.recipientStudent && <p className="text-sm text-fg-2">Handout for {log.recipientStudent.name}.</p>}
                {log.reason && <p className="text-sm text-fg">Reason: {log.reason}</p>}
              </li>
            ))}
          </ul>
          {logs.length < total && (
            <div className="text-center">
              <Button variant="secondary" onClick={showMore} loading={more}>
                {more ? "Loading…" : "Show more"}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
