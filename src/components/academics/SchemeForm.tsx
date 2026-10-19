"use client";

import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { TextField } from "@/components/ui/TextField";
import type { Reply } from "@/components/auth/postJson";
import { say } from "@/components/academics/common";

// One form for the three new levels of assessment scheme (the school-wide default, a class group's own, a teacher's own for a subject): a name, one or more named
// continuous-assessment parts, the exam, and a live total that must reach 100. The server checks the same and answers in words; this only shows the sum as the
// person types. Optional extras per level: a reason (a teacher's scheme goes to an administrator), sharing with the branch, "make it the default".

export type SchemeBody = {
  name: string;
  examMax: number;
  components: { name: string; maxScore: number }[];
  reason?: string;
  isSharedWithBranch?: boolean;
  isDefault?: boolean;
  submitForApproval?: boolean;
};
export type SchemeInitial = { name: string; examMax: number; components: { name: string; maxScore: number }[]; reason?: string };

const num = (s: string) => (s.trim() === "" ? NaN : Number(s));
const fmt = (n: number) => String(Math.round(n * 100) / 100);

export function SchemeForm({
  open,
  title,
  description,
  initial,
  askReason = false,
  askShare = false,
  askDefault = false,
  approvalButton,
  onClose,
  onSubmit,
  onDone,
}: {
  open: boolean;
  title: string;
  description?: string;
  initial: SchemeInitial | null;
  askReason?: boolean;
  askShare?: boolean;
  askDefault?: boolean;
  /// A teacher's scheme can be saved as a draft or sent for approval in the same step: the label of the second button.
  approvalButton?: string;
  onClose: () => void;
  onSubmit: (body: SchemeBody) => Promise<Reply>;
  onDone: (text: string) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [parts, setParts] = useState(
    initial?.components.map((c) => ({ name: c.name, max: String(c.maxScore) })) ?? [{ name: "CA", max: "40" }],
  );
  const [exam, setExam] = useState(initial ? String(initial.examMax) : "60");
  const [reason, setReason] = useState(initial?.reason ?? "");
  const [shared, setShared] = useState(false);
  const [makeDefault, setMakeDefault] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const total =
    parts.reduce((sum, p) => sum + (Number.isFinite(num(p.max)) ? num(p.max) : 0), 0) + (Number.isFinite(num(exam)) ? num(exam) : 0);

  async function submit(submitForApproval: boolean) {
    if (pending) return;
    setProblem(null);
    setPending(true);
    const r = await onSubmit({
      name: name.trim(),
      examMax: num(exam),
      components: parts.map((p, i) => ({ name: p.name.trim() || (i === 0 ? "CA" : `CA ${i + 1}`), maxScore: num(p.max) })),
      ...(askReason ? { reason: reason.trim() } : {}),
      ...(askShare ? { isSharedWithBranch: shared } : {}),
      ...(askDefault ? { isDefault: makeDefault } : {}),
      ...(approvalButton ? { submitForApproval } : {}),
    });
    setPending(false);
    if (r.ok) return void (await onDone(submitForApproval ? "Sent for approval." : "Saved."));
    setProblem(say(r, "That didn't work."));
  }

  return (
    <Dialog open={open} onClose={onClose} wide title={title} description={description}>
      {open && (
        <form onSubmit={(e: FormEvent) => (e.preventDefault(), void submit(false))} noValidate className="space-y-4">
          <TextField
            label="Scheme name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            autoComplete="off"
            disabled={pending}
          />
          <div className="space-y-2">
            <p className="text-xs font-semibold tracking-wide text-fg-2 uppercase">Continuous assessment parts</p>
            {parts.map((p, i) => (
              <div key={i} className="grid grid-cols-[1fr_6rem_auto] items-end gap-2">
                <TextField
                  label={`Part ${i + 1} name`}
                  value={p.name}
                  onChange={(e) => setParts((all) => all.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                  placeholder="CA, Test 1, Project…"
                  autoComplete="off"
                  disabled={pending}
                />
                <TextField
                  label={`Part ${i + 1} marks`}
                  inputMode="decimal"
                  value={p.max}
                  onChange={(e) => setParts((all) => all.map((x, j) => (j === i ? { ...x, max: e.target.value } : x)))}
                  disabled={pending}
                />
                <Button
                  variant="ghost"
                  disabled={pending || parts.length === 1}
                  onClick={() => setParts((all) => all.filter((_, j) => j !== i))}
                  aria-label={`Remove part ${i + 1}`}
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button
              variant="secondary"
              disabled={pending || parts.length >= 8}
              onClick={() => setParts((all) => [...all, { name: "", max: "" }])}
            >
              Add a part
            </Button>
          </div>
          <TextField label="Exam marks" inputMode="decimal" value={exam} onChange={(e) => setExam(e.target.value)} disabled={pending} />
          <p role="status" className={`text-sm ${total === 100 ? "text-ok-fg" : "text-warn-fg"}`}>
            Adds up to {fmt(total)} of 100.
          </p>
          {askReason && (
            <div>
              <label htmlFor="scheme-reason" className="mb-1.5 block text-xs font-semibold tracking-wide text-fg-2 uppercase">
                Why does this subject need its own scheme?
              </label>
              <textarea
                id="scheme-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={500}
                className="w-full rounded-xl border border-line bg-field p-3 text-sm text-fg focus-visible:outline-2 focus-visible:outline-ring"
                disabled={pending}
              />
            </div>
          )}
          {askShare && (
            <label className="flex items-center gap-2 text-sm text-fg">
              <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} disabled={pending} />
              Let other teachers of this branch use it too
            </label>
          )}
          {askDefault && (
            <label className="flex items-center gap-2 text-sm text-fg">
              <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} disabled={pending} />
              Make it the default for every branch that has no scheme of its own
            </label>
          )}
          {problem && <Alert variant="error">{problem}</Alert>}
          <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" variant={approvalButton ? "secondary" : "primary"} loading={pending}>
              {approvalButton ? "Save as a draft" : "Save scheme"}
            </Button>
            {approvalButton && (
              <Button onClick={() => void submit(true)} loading={pending} disabled={reason.trim() === ""}>
                {approvalButton}
              </Button>
            )}
          </div>
        </form>
      )}
    </Dialog>
  );
}
