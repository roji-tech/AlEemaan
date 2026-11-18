"use client";

import { useState, type FormEvent } from "react";
import { usePathname } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { sendJson } from "@/components/auth/postJson";
import { say } from "@/components/academics/common";
import { CATEGORY_LABELS, MESSAGE_MAX, MESSAGE_MIN, REPORT_CATEGORIES, type ReportCategoryName } from "@/lib/reports/report";

// The Report tool of the Quick Tools drawer (task 0099): tell the developer something is wrong, confusing, or could be better. It is recorded and mailed by POST /api/v1/reports; the page the
// person is on, their screen size and who they are go with it (the server adds the last, not this form).

export function ReportTool() {
  const path = usePathname();
  const [category, setCategory] = useState<ReportCategoryName>("PROBLEM");
  const [message, setMessage] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const text = message.trim();
    setFailure(null);
    if (text.length < MESSAGE_MIN) return setProblem(`Tell us a little more: at least ${MESSAGE_MIN} characters.`);
    if (text.length > MESSAGE_MAX) return setProblem(`Please keep it to ${MESSAGE_MAX} characters.`);
    setProblem(null);
    setPending(true);
    const reply = await sendJson("/api/v1/reports", "POST", {
      category,
      message: text,
      pagePath: path ?? "/",
      viewport: `${window.innerWidth}x${window.innerHeight}`,
    });
    setPending(false);
    if (!reply.ok) return setFailure(say(reply, "The report could not be sent."));
    const id = String((reply.data?.report as { id?: string } | undefined)?.id ?? "");
    setSent(id.slice(-8).toUpperCase());
    setMessage("");
  }

  if (sent !== null)
    return (
      <div className="space-y-4">
        <div role="status" className="rounded-2xl border border-ok-line bg-ok-bg p-4 text-sm text-ok-fg">
          <p className="font-semibold">Thank you. Your report is recorded.</p>
          {sent && <p className="mt-1">Reference: {sent}</p>}
        </div>
        <Button variant="secondary" onClick={() => setSent(null)}>
          Send another
        </Button>
      </div>
    );

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-label="Report a problem">
      <p className="text-sm text-fg-muted">
        Something wrong, confusing, or missing? Tell the developer. The page you are on, your screen size and who you are go with it.
      </p>
      <SelectField
        label="What is it about?"
        value={category}
        onChange={(e) => setCategory(e.target.value as ReportCategoryName)}
        disabled={pending}
        options={REPORT_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))}
      />
      <TextAreaField
        label="What happened?"
        hint={`${message.trim().length} of ${MESSAGE_MAX} characters`}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        error={problem}
        rows={6}
        maxLength={MESSAGE_MAX + 200}
        disabled={pending}
      />
      {failure && <Alert variant="error">{failure}</Alert>}
      <div className="flex justify-end">
        <Button type="submit" loading={pending}>
          {pending ? "Sending…" : "Send the report"}
        </Button>
      </div>
    </form>
  );
}
