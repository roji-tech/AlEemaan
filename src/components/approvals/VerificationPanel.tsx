"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import { getJson, sendJson } from "@/components/auth/postJson";
import { say, type BranchChoice, type Notice } from "@/components/academics/common";

// What anyone holding a report card's verification link sees about it. A fixed minimum is always shown; a superadmin chooses the rest, for every branch or for one.
// An administrator can propose a change for their own branch: it needs a reason and a superadmin approves it under Requests.

type Config = {
  showPupilName: boolean;
  pupilNameFormat: "FULL" | "FIRST_LAST_INITIAL" | "INITIALS";
  showSubject: boolean;
  showMarks: boolean;
  showGrade: boolean;
};
const ALL = "__all__";

export function VerificationPanel({ branches, isSuperAdmin }: { branches: BranchChoice[]; isSuperAdmin: boolean }) {
  const [scopeId, setScopeId] = useState(isSuperAdmin ? ALL : branches[0].id);
  const [config, setConfig] = useState<Config | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, setPending] = useState(false);
  const canEdit = isSuperAdmin || (branches.find((b) => b.id === scopeId)?.canEdit ?? false);

  const load = useCallback(async () => {
    const r = await getJson(`/api/v1/settings/verification${scopeId === ALL ? "" : `?branchId=${encodeURIComponent(scopeId)}`}`);
    if (!r.ok) return setError(say(r, "Couldn't load the settings."));
    setError(null);
    setConfig(r.data!.config as Config);
  }, [scopeId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading on a scope change is exactly what this effect is for
    void load();
  }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!config || pending) return;
    setPending(true);
    setNotice(null);
    const { showPupilName, pupilNameFormat, showSubject, showMarks, showGrade } = config;
    const r = await sendJson("/api/v1/settings/verification", "PATCH", {
      branchId: scopeId === ALL ? null : scopeId,
      showPupilName,
      pupilNameFormat,
      showSubject,
      showMarks,
      showGrade,
      ...(!isSuperAdmin ? { reason: reason.trim() } : {}),
    });
    setPending(false);
    if (r.ok) {
      setReason("");
      setNotice({
        variant: "success",
        text: r.status === 202 ? "Sent to a superadmin for approval. The public page stays as it is until it is approved." : "Saved.",
      });
      return void (await load());
    }
    setNotice({ variant: "error", text: say(r, "That didn't work.") });
  }
  const set = <K extends keyof Config>(key: K, value: Config[K]) => setConfig((c) => (c ? { ...c, [key]: value } : c));

  return (
    <div className="space-y-6">
      <SelectField
        label={isSuperAdmin ? "Applies to" : "Branch"}
        value={scopeId}
        onChange={(e) => {
          setConfig(null);
          setNotice(null);
          setScopeId(e.target.value);
        }}
        options={[
          ...(isSuperAdmin ? [{ value: ALL, label: "Every branch (unless a branch has its own)" }] : []),
          ...branches.map((b) => ({ value: b.id, label: b.name })),
        ]}
      />
      <p className="text-sm text-fg-muted">
        Always shown, whatever you choose: the school, the branch, the class, the term, the date published, and that the card is genuine.
      </p>
      <div aria-live="polite" className="empty:hidden">
        {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}
      </div>
      {config === null ? (
        <p className="text-sm text-fg-muted" aria-busy="true">
          Loading…
        </p>
      ) : (
        <form onSubmit={save} className="space-y-4" noValidate>
          <label className="flex items-center gap-2 text-sm text-fg">
            <input
              type="checkbox"
              checked={config.showPupilName}
              onChange={(e) => set("showPupilName", e.target.checked)}
              disabled={!canEdit}
            />
            Show the pupil&apos;s name
          </label>
          <SelectField
            label="How the name is written"
            value={config.pupilNameFormat}
            onChange={(e) => set("pupilNameFormat", e.target.value as Config["pupilNameFormat"])}
            disabled={!canEdit || !config.showPupilName}
            options={[
              { value: "FIRST_LAST_INITIAL", label: "First name and the first letter of the last name (Amina Y.)" },
              { value: "INITIALS", label: "Initials only (A. Y.)" },
              { value: "FULL", label: "Full name" },
            ]}
          />
          <label className="flex items-center gap-2 text-sm text-fg">
            <input
              type="checkbox"
              checked={config.showSubject}
              onChange={(e) => set("showSubject", e.target.checked)}
              disabled={!canEdit}
            />
            Show the subject
          </label>
          <label className="flex items-center gap-2 text-sm text-fg">
            <input type="checkbox" checked={config.showMarks} onChange={(e) => set("showMarks", e.target.checked)} disabled={!canEdit} />
            Show the marks
          </label>
          <label className="flex items-center gap-2 text-sm text-fg">
            <input type="checkbox" checked={config.showGrade} onChange={(e) => set("showGrade", e.target.checked)} disabled={!canEdit} />
            Show the grade
          </label>
          {canEdit && !isSuperAdmin && (
            <div>
              <label htmlFor="verify-reason" className="mb-1.5 block text-xs font-semibold tracking-wide text-fg-2 uppercase">
                Why is this change needed? (a superadmin decides)
              </label>
              <textarea
                id="verify-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                maxLength={500}
                className="w-full rounded-xl border border-line bg-field p-3 text-sm text-fg focus-visible:outline-2 focus-visible:outline-ring"
              />
            </div>
          )}
          {canEdit && (
            <Button type="submit" loading={pending} disabled={!isSuperAdmin && reason.trim() === ""}>
              {pending ? "Saving…" : isSuperAdmin ? "Save" : "Send for approval"}
            </Button>
          )}
        </form>
      )}
    </div>
  );
}
