"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { Dialog } from "@/components/ui/Dialog";
import { TextField } from "@/components/ui/TextField";
import { sendJson } from "@/components/auth/postJson";
import { say } from "@/components/academics/common";
import { KIND_NOUN, type FormKindKey } from "@/components/forms/model";

// Printing a form as a PDF made by the server, with a watermark and a line in the print log. The answer key is offered only where the questions came with one. Presentation only: the
// API decides who may print and says why not.

function download(base64: string, name: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function FormPrintDialog({
  open,
  onClose,
  kind,
  branchId,
  formId,
  mayHaveKey,
}: {
  open: boolean;
  onClose: () => void;
  kind: FormKindKey;
  branchId: string;
  formId: string;
  mayHaveKey: boolean;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Print this ${KIND_NOUN[kind]}`}
      description="The PDF is watermarked and the print is logged."
    >
      {open && <Body kind={kind} branchId={branchId} formId={formId} mayHaveKey={mayHaveKey} onClose={onClose} />}
    </Dialog>
  );
}

function Body({
  kind,
  branchId,
  formId,
  mayHaveKey,
  onClose,
}: {
  kind: FormKindKey;
  branchId: string;
  formId: string;
  mayHaveKey: boolean;
  onClose: () => void;
}) {
  const [withKey, setWithKey] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function print() {
    setPending(true);
    setProblem(null);
    const reply = await sendJson(`/api/v1/forms/${encodeURIComponent(formId)}/print`, "POST", {
      branchId,
      format: "json",
      ...(withKey ? { includeAnswerKey: true } : {}),
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    });
    setPending(false);
    const pdf = reply.data?.pdfBase64;
    if (!reply.ok || typeof pdf !== "string") return setProblem(say(reply, "It couldn't be printed."));
    download(pdf, `${String(reply.data?.title ?? "form")}.pdf`);
    onClose();
  }

  return (
    <div className="space-y-4">
      {problem && <Alert variant="error">{problem}</Alert>}
      {kind === "PRACTICE_SET" && mayHaveKey && (
        <CheckboxField label="Include the answer key" checked={withKey} onChange={(e) => setWithKey(e.target.checked)} />
      )}
      <TextField
        label="Reason (optional)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={500}
        hint="It is written in the print log."
      />
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button loading={pending} onClick={print}>
          Download PDF
        </Button>
      </div>
    </div>
  );
}
