"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { TextField } from "@/components/ui/TextField";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { TONE } from "@/components/ui/tone";
import { GENERIC_ERROR, getJson, problemFor, sendJson } from "@/components/auth/postJson";
import { GuardianSlipCard, SlipSheet, type GuardianSlip, type SignIn } from "./AccessSlips";
import { blockedText, codeText, relationshipLabel, type GuardianChild, type GuardianDetail } from "./model";

// One guardian, opened from Users > Guardians (task 0113 D10; the maintainer: "I wanna see all the children under a guardian when I click on it, and I want the superadmin/admin to be able
// to block access to some students under a guardian"). Their details (Edit when the caller may: task 0113 D4), every child in the caller's reach with Allowed or Blocked and Block (a reason
// is required) or Unblock, and their access code (Make code / New code), shown once in a printable slip. Every answer comes from the API, which decides; this only draws it.

function Chip({ tone, children }: { tone: keyof typeof TONE; children: React.ReactNode }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${TONE[tone].chip}`}>{children}</span>
  );
}

function ChildRow({
  child,
  busy,
  onBlock,
  onUnblock,
}: {
  child: GuardianChild;
  busy: boolean;
  onBlock: (child: GuardianChild, reason: string) => Promise<string | null>;
  onUnblock: (child: GuardianChild) => void;
}) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const relation = relationshipLabel(child.relationship);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (reason.trim().length < 3) return setProblem("Say why this guardian is blocked.");
    const failed = await onBlock(child, reason.trim());
    if (failed) setProblem(failed);
    else setAsking(false);
  }
  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold wrap-break-word text-fg">{child.name}</p>
          <p className="text-sm text-fg-muted">
            <span className="font-mono">{child.admissionNo}</span>
            {child.className ? ` · ${child.className}` : ""} · {child.branchName}
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {relation && <Chip tone="neutral">{relation}</Chip>}
            {child.isMain && <Chip tone="brand">Main contact</Chip>}
            {child.archived && <Chip tone="neutral">Archived</Chip>}
            {child.blocked ? <Chip tone="danger">Blocked</Chip> : <Chip tone="ok">Allowed</Chip>}
          </div>
          {child.blocked && <p className="mt-1 text-xs text-fg-muted">{blockedText(child.blocked)}</p>}
        </div>
        {child.canManage &&
          (child.blocked ? (
            <Button
              variant="secondary"
              loading={busy}
              onClick={() => onUnblock(child)}
              aria-label={`Unblock this guardian from ${child.name}`}
            >
              Unblock
            </Button>
          ) : (
            !asking && (
              <Button
                variant="danger"
                disabled={busy}
                onClick={() => (setAsking(true), setProblem(null))}
                aria-label={`Block this guardian from ${child.name}`}
              >
                Block
              </Button>
            )
          ))}
      </div>
      {asking && (
        <form
          onSubmit={submit}
          className="space-y-2 rounded-xl border border-line bg-surface-2 p-3"
          aria-label={`Block from ${child.name}`}
        >
          <TextAreaField
            label={`Why is this guardian blocked from ${child.name}?`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={2}
            error={problem ?? undefined}
            hint="They will not be able to sign in with this child, will not see them, and will not get messages about them. Their open sign-in ends."
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setAsking(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" loading={busy}>
              Block
            </Button>
          </div>
        </form>
      )}
    </li>
  );
}

export function GuardianDialog({
  guardianId,
  onClose,
  onChanged,
}: {
  guardianId: string | null;
  onClose: () => void;
  onChanged: (text: string) => void;
}) {
  const [detail, setDetail] = useState<GuardianDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [fieldProblems, setFieldProblems] = useState<Record<string, string | undefined>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [slip, setSlip] = useState<{ slip: GuardianSlip; signIn: SignIn } | null>(null);

  const load = useCallback(async (id: string) => {
    const reply = await getJson(`/api/v1/guardians/${id}`);
    if (reply.ok) {
      setDetail(reply.data as GuardianDetail);
      setError(null);
    } else setError(reply.message ?? GENERIC_ERROR);
  }, []);

  useEffect(() => {
    if (!guardianId) return;
    /* eslint-disable react-hooks/set-state-in-effect -- a newly opened guardian starts from a clean dialog */
    setDetail(null);
    setEditing(false);
    setSlip(null);
    setError(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    void load(guardianId);
  }, [guardianId, load]);

  const g = detail?.guardian;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!g) return;
    setBusy("save");
    const reply = await sendJson(`/api/v1/guardians/${g.id}`, "PATCH", {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
    });
    setBusy(null);
    if (!reply.ok) {
      setFieldProblems({ name: problemFor(reply, "name"), phone: problemFor(reply, "phone"), email: problemFor(reply, "email") });
      setError(reply.message ?? GENERIC_ERROR);
      return;
    }
    setDetail(reply.data as GuardianDetail);
    setEditing(false);
    setError(null);
    onChanged(`${form.name.trim()}'s details are saved, for all their children.`);
  }

  async function block(child: GuardianChild, reason: string): Promise<string | null> {
    if (!g) return GENERIC_ERROR;
    setBusy(child.studentId);
    const reply = await sendJson(`/api/v1/guardians/${g.id}/children/${child.studentId}`, "PATCH", { blocked: true, reason });
    setBusy(null);
    if (!reply.ok) return problemFor(reply, "reason") ?? reply.message ?? GENERIC_ERROR;
    setDetail((reply.data as { guardian: GuardianDetail }).guardian);
    onChanged(`${g.name} is blocked from ${child.name}.`);
    return null;
  }

  async function unblock(child: GuardianChild) {
    if (!g) return;
    setBusy(child.studentId);
    const reply = await sendJson(`/api/v1/guardians/${g.id}/children/${child.studentId}`, "PATCH", { blocked: false });
    setBusy(null);
    if (!reply.ok) return setError(reply.message ?? GENERIC_ERROR);
    setDetail((reply.data as { guardian: GuardianDetail }).guardian);
    onChanged(`${g.name} can reach ${child.name} again.`);
  }

  async function makeCode() {
    if (!g) return;
    setBusy("code");
    const reply = await sendJson(`/api/v1/guardians/${g.id}/access-code`, "POST", {});
    setBusy(null);
    if (!reply.ok) return setError(reply.message ?? GENERIC_ERROR);
    const data = reply.data as { guardianName: string; code: string; children: GuardianSlip["children"]; signIn: SignIn };
    setSlip({ slip: { guardianName: data.guardianName, code: data.code, children: data.children }, signIn: data.signIn });
    await load(g.id);
    onChanged(`A new code was made for ${data.guardianName}. Their earlier code no longer works.`);
  }

  return (
    <Dialog open={guardianId !== null} onClose={onClose} title={g ? `Guardian ${g.name}` : "Guardian"} wide>
      {error && <Alert variant="error">{error}</Alert>}
      {!detail ? (
        !error && <p className="text-sm text-fg-muted">Loading…</p>
      ) : (
        <div className="space-y-6">
          <section aria-labelledby="guardian-details" className="space-y-3">
            <h3 id="guardian-details" className="text-sm font-semibold text-fg">
              Details
            </h3>
            {editing ? (
              <form onSubmit={save} className="space-y-3">
                <TextField
                  label="Name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  maxLength={100}
                  error={fieldProblems.name}
                />
                <TextField
                  label="Phone"
                  inputMode="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  maxLength={40}
                  error={fieldProblems.phone}
                />
                <TextField
                  label="Email"
                  inputMode="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  maxLength={254}
                  error={fieldProblems.email}
                />
                <p className="text-xs text-fg-muted">One change for all their children: each child&apos;s contact details follow.</p>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="ghost" onClick={() => setEditing(false)} disabled={busy === "save"}>
                    Cancel
                  </Button>
                  <Button type="submit" loading={busy === "save"}>
                    Save
                  </Button>
                </div>
              </form>
            ) : (
              <div className="flex flex-wrap items-start justify-between gap-3">
                <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
                  <dt className="text-fg-muted">Phone</dt>
                  <dd className="text-fg">{g!.phone ?? "Not given"}</dd>
                  <dt className="text-fg-muted">Email</dt>
                  <dd className="break-all text-fg">{g!.email ?? "Not given"}</dd>
                  <dt className="text-fg-muted">Access code</dt>
                  <dd className="text-fg">{codeText(g!.codeAt)}</dd>
                </dl>
                <div className="flex flex-wrap gap-2">
                  {detail.can.edit && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setForm({ name: g!.name, phone: g!.phone ?? "", email: g!.email ?? "" });
                        setFieldProblems({});
                        setEditing(true);
                      }}
                    >
                      Edit details
                    </Button>
                  )}
                  {detail.can.code && (
                    <Button variant="secondary" loading={busy === "code"} onClick={() => void makeCode()}>
                      {g!.codeAt ? "New code" : "Make code"}
                    </Button>
                  )}
                </div>
              </div>
            )}
            {!detail.can.edit && (
              <p className="text-xs text-fg-muted">
                This guardian has children in a branch you do not run, so their details and code are changed by a superadmin.
              </p>
            )}
          </section>

          {slip && (
            <section aria-labelledby="guardian-slip" className="space-y-3">
              <h3 id="guardian-slip" className="text-sm font-semibold text-fg">
                The new code (shown once)
              </h3>
              <Alert variant="info">
                Print or copy it now: it is not kept, and closing this shows it no more. A lost code is replaced with a new one.
              </Alert>
              <ul>
                <GuardianSlipCard slip={slip.slip} signIn={slip.signIn} />
              </ul>
              <Button variant="secondary" onClick={() => window.print()}>
                Print the slip
              </Button>
              <SlipSheet>
                <GuardianSlipCard slip={slip.slip} signIn={slip.signIn} />
              </SlipSheet>
            </section>
          )}

          <section aria-labelledby="guardian-children" className="space-y-1">
            <h3 id="guardian-children" className="text-sm font-semibold text-fg">
              Children ({detail.children.length})
            </h3>
            {detail.children.length === 0 ? (
              <p className="text-sm text-fg-muted">No child in your branches is linked to this guardian.</p>
            ) : (
              <ul aria-label={`Children of ${g!.name}`} className="divide-y divide-line">
                {detail.children.map((child) => (
                  <ChildRow
                    key={child.studentId}
                    child={child}
                    busy={busy === child.studentId}
                    onBlock={block}
                    onUnblock={(c) => void unblock(c)}
                  />
                ))}
              </ul>
            )}
            {detail.otherBranches > 0 && (
              <p className="text-xs text-fg-muted">
                And {detail.otherBranches} more in {detail.otherBranches === 1 ? "a branch" : "branches"} you do not run.
              </p>
            )}
          </section>
          <div className="flex justify-end">
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
