"use client";

import { InfoTip } from "@/components/ui/InfoTip";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import { getJson } from "@/components/auth/postJson";
import { say, type Notice } from "@/components/academics/common";
import { MarkingDialog } from "@/components/forms/MarkingDialog";

// The practice-set attempts a teacher marks: across the branch's forms (the Marking section of the Forms page) or for one form (its Marking tab). Presentation only: the marking
// APIs say which forms a person may read and who may mark.

type MarkingStatus = "NOT_REQUIRED" | "PENDING" | "PARTIALLY_MARKED" | "MARKED";
type QueueRow = {
  responseId: string;
  formId: string;
  formTitle: string;
  student: { id: string; admissionNo: string; name: string } | null;
  markingStatus: MarkingStatus;
  score: number | null;
  maxScore: number | null;
  submittedAt: string | null;
  pendingQuestions: number;
};

const FILTERS = [
  { value: "", label: "Waiting or partly marked" },
  { value: "PENDING", label: "Waiting" },
  { value: "PARTIALLY_MARKED", label: "Partly marked" },
  { value: "MARKED", label: "Marked" },
];

const STATUS_TEXT: Record<MarkingStatus, string> = {
  NOT_REQUIRED: "Not needed",
  PENDING: "Waiting",
  PARTIALLY_MARKED: "Partly marked",
  MARKED: "Marked",
};
const STATUS_STYLE: Record<MarkingStatus, string> = {
  NOT_REQUIRED: "border-line-strong text-fg-muted",
  PENDING: "border-line-strong text-fg-2",
  PARTIALLY_MARKED: "border-warn-line bg-warn-bg text-warn-fg",
  MARKED: "border-ok-line bg-ok-bg text-ok-fg",
};

const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function MarkingQueue({ branchId, formId }: { branchId: string; formId?: string }) {
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<QueueRow[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [marking, setMarking] = useState<QueueRow | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const base = formId ? `/api/v1/forms/${encodeURIComponent(formId)}/marking-queue` : "/api/v1/forms/marking-queue";
      const reply = await getJson(`${base}?branchId=${encodeURIComponent(branchId)}${status ? `&status=${status}` : ""}`, signal);
      if (signal?.aborted) return;
      if (!reply.ok) {
        setFailed(
          reply.status === 404
            ? "Only the person who wrote this form, an administrator, or someone allowed to read form results can see its marking."
            : say(reply, "The marking queue couldn't be loaded."),
        );
        return;
      }
      setFailed(null);
      setRows((reply.data?.responses ?? []) as QueueRow[]);
    },
    [branchId, formId, status],
  );

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load the queue when the branch, the form or the filter changes
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-fg">Marking</h2>
          <InfoTip tip="forms.marking" />
        </div>
        <div className="w-full max-w-xs">
          <SelectField label="Show" value={status} onChange={(e) => setStatus(e.target.value)} options={FILTERS} />
        </div>
      </div>

      {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
      {failed && <Alert variant="error">{failed}</Alert>}

      {rows === null && !failed ? (
        <p className="text-sm text-fg-muted">Loading…</p>
      ) : rows !== null && rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
          {status === "" ? "Nothing is waiting for marking." : "Nothing here."}
        </p>
      ) : (
        <ul className="space-y-3">
          {(rows ?? []).map((r) => {
            const name = r.student?.name ?? "Unknown pupil";
            const done = r.markingStatus === "MARKED";
            return (
              <li key={r.responseId} className="space-y-3 rounded-2xl border border-line bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold break-words text-fg">{name}</p>
                    {r.student && <p className="text-xs text-fg-muted">{r.student.admissionNo}</p>}
                  </div>
                  <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_STYLE[r.markingStatus]}`}>
                    {STATUS_TEXT[r.markingStatus]}
                  </span>
                </div>
                <p className="text-sm text-fg-muted">
                  {[
                    formId ? null : <FormLink key="form" id={r.formId} title={r.formTitle} />,
                    r.submittedAt ? `Submitted ${day.format(new Date(r.submittedAt))}` : null,
                    r.score !== null && r.maxScore !== null ? `${done ? "Score" : "Score so far"}: ${r.score} of ${r.maxScore}` : null,
                    r.pendingQuestions > 0 ? `${r.pendingQuestions} still to mark` : null,
                  ]
                    .filter(Boolean)
                    .flatMap((part, i) => (i === 0 ? [part] : [" · ", part]))}
                </p>
                <Button variant={done ? "secondary" : "primary"} onClick={() => setMarking(r)}>
                  {done ? "Review" : "Mark"}
                  <span className="sr-only"> {name}</span>
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {marking && (
        <MarkingDialog
          open
          onClose={() => setMarking(null)}
          branchId={branchId}
          formId={marking.formId}
          responseId={marking.responseId}
          onSaved={(text) => {
            setNotice({ variant: "success", text });
            void load();
          }}
        />
      )}
    </div>
  );
}

function FormLink({ id, title }: { id: string; title: string }) {
  return (
    <Link href={`/forms/${id}`} className="font-medium text-fg underline-offset-2 hover:underline">
      {title}
    </Link>
  );
}
