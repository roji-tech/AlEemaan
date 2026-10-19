"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { getJson, sendJson } from "@/components/auth/postJson";
import { say, type Notice } from "@/components/academics/common";
import { SchemeForm, type SchemeBody } from "@/components/academics/SchemeForm";

// "My own scheme for this subject": a teacher can write a scheme for a subject they teach, give the reason, and use it straight away while an administrator decides.
// Marks entered under it can be reviewed but not published until it is approved. A rejected scheme stays here as a draft with the reason, never deleted.

type Draft = {
  id: string;
  name: string;
  totalMax: number;
  examMax: number;
  components: { name: string; maxScore: number }[];
  reason: string;
  status: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED";
  rejectionReason: string | null;
  teacherName: string | null;
};
const STATUS: Record<Draft["status"], string> = {
  DRAFT: "Draft",
  PENDING: "Waiting for approval",
  APPROVED: "Approved",
  REJECTED: "Rejected - kept as a draft",
};
const describe = (d: Draft) => `${d.components.map((c) => `${c.name} ${c.maxScore}`).join(" + ")} + Exam ${d.examMax} = ${d.totalMax}`;

export function TeacherSchemePanel({ branchId, subjectId, subjectName }: { branchId: string; subjectId: string; subjectName: string }) {
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [editing, setEditing] = useState<{ item: Draft | null } | null>(null);

  const load = useCallback(async () => {
    const r = await getJson(
      `/api/v1/academics/schemes/teacher?branchId=${encodeURIComponent(branchId)}&subjectId=${encodeURIComponent(subjectId)}`,
    );
    if (!r.ok) return setError(say(r, "Couldn't load your schemes."));
    setError(null);
    setDrafts(r.data!.drafts as Draft[]);
  }, [branchId, subjectId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading on a subject change is exactly what this effect is for
    void load();
  }, [load]);

  const submit = (body: SchemeBody) =>
    editing?.item
      ? sendJson(`/api/v1/academics/schemes/teacher/${editing.item.id}`, "PATCH", body)
      : sendJson("/api/v1/academics/schemes/teacher", "POST", { branchId, subjectId, ...body });
  async function ask(d: Draft) {
    const r = await sendJson(`/api/v1/academics/schemes/teacher/${d.id}`, "PATCH", { submitForApproval: true });
    setNotice(
      r.ok ? { variant: "success", text: `${d.name} sent for approval.` } : { variant: "error", text: say(r, "That didn't work.") },
    );
    await load();
  }

  return (
    <section aria-labelledby="mine-heading" className="mt-8 space-y-3 border-t border-line pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="mine-heading" className="font-semibold text-fg">
          Your own scheme for {subjectName}
        </h3>
        <Button variant="secondary" onClick={() => setEditing({ item: null })}>
          New scheme for {subjectName}
        </Button>
      </div>
      <p className="text-sm text-fg-muted">
        If this subject needs different marks from the class scheme, write one and say why. You can use it at once; marks under it cannot be
        published until an administrator approves it.
      </p>
      <div aria-live="polite" className="empty:hidden">
        {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}
      </div>
      {drafts === null ? (
        <p className="text-sm text-fg-muted" aria-busy="true">
          Loading…
        </p>
      ) : drafts.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-5 text-center text-sm text-fg-muted">
          You have no scheme of your own for this subject; the class scheme applies.
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {drafts.map((d) => (
            <li key={d.id} className="space-y-1 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-semibold text-fg">
                  {d.name} <span className="ml-2 text-xs font-normal text-fg-muted">{STATUS[d.status]}</span>
                </p>
                {(d.status === "DRAFT" || d.status === "REJECTED") && (
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => setEditing({ item: d })} aria-label={`Edit ${d.name}`}>
                      Edit
                    </Button>
                    <Button onClick={() => void ask(d)} aria-label={`Ask for approval of ${d.name}`}>
                      Ask for approval
                    </Button>
                  </div>
                )}
              </div>
              <p className="text-sm text-fg-muted">{describe(d)}</p>
              <p className="text-sm text-fg-muted">Reason: {d.reason}</p>
              {d.rejectionReason && <p className="text-sm text-danger-fg">Not approved: {d.rejectionReason}</p>}
            </li>
          ))}
        </ul>
      )}
      <SchemeForm
        key={editing ? (editing.item?.id ?? "new") : "none"}
        open={editing !== null}
        title={editing?.item ? `Edit ${editing.item.name}` : `New scheme for ${subjectName}`}
        initial={
          editing?.item
            ? { name: editing.item.name, examMax: editing.item.examMax, components: editing.item.components, reason: editing.item.reason }
            : null
        }
        askReason
        askShare
        approvalButton="Save and ask for approval"
        onClose={() => setEditing(null)}
        onSubmit={submit}
        onDone={async (text) => {
          setEditing(null);
          setNotice({ variant: "success", text });
          await load();
        }}
      />
    </section>
  );
}
