"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { getJson, sendJson, type FieldProblem } from "@/components/auth/postJson";
import { say, type BranchChoice, type Notice } from "@/components/academics/common";

// The question bank's switches. A superadmin sets the school-wide values; a branch administrator may only make a value STRICTER for their branch (the server refuses
// anything looser and says why). Each row shows the built-in default, the school's value, the branch's own value and what actually applies. Presentation only.

type Value = boolean | number | number[];
type Row = {
  key: string;
  label: string;
  help: string;
  kind: "flag" | "whole" | "presets" | "images";
  min: number | null;
  max: number | null;
  unit: string | null;
  stricter: string;
  default: Value;
  school: Value;
  override: Value | null;
  effective: Value;
};
type Draft = boolean | string;

const SCHOOL = "__school__";

const show = (value: Value, unit: string | null) =>
  typeof value === "boolean" ? (value ? "On" : "Off") : Array.isArray(value) ? value.join(", ") : unit ? `${value} ${unit}` : String(value);

const toDraft = (value: Value): Draft => (typeof value === "boolean" ? value : Array.isArray(value) ? value.join(", ") : String(value));

/// The draft as the value to send, or null (with `why`) when it is not a valid entry.
function toValue(row: Row, draft: Draft): { value: Value } | { why: string } {
  if (row.kind === "flag") return { value: draft === true };
  const text = String(draft).trim();
  if (row.kind === "presets") {
    const sizes = text
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
    return sizes.length > 0 && sizes.every((n) => Number.isInteger(n))
      ? { value: sizes }
      : { why: "Type whole numbers separated by commas, like 10, 20, 50." };
  }
  const n = Number(text);
  return text !== "" && Number.isInteger(n) ? { value: n } : { why: "Type a whole number." };
}

export function SettingsPanel({ branches, isSuperAdmin }: { branches: BranchChoice[]; isSuperAdmin: boolean }) {
  const editable = branches.filter((b) => b.canEdit);
  const [where, setWhere] = useState(isSuperAdmin ? SCHOOL : (editable[0]?.id ?? SCHOOL));
  const [rows, setRows] = useState<Row[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [cleared, setCleared] = useState<Record<string, boolean>>({});
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, setPending] = useState(false);
  const [reason, setReason] = useState("");

  const isSchool = where === SCHOOL;
  const branch = branches.find((b) => b.id === where);
  const canEdit = isSchool ? isSuperAdmin : (branch?.canEdit ?? false);

  // Loading lives in the effect, with a guard: switching scope quickly must not let an older response overwrite a newer one. `version` re-runs it after a save.
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let current = true;
    void (async () => {
      const reply = await getJson(`/api/v1/question-bank/settings${where === SCHOOL ? "" : `?branchId=${encodeURIComponent(where)}`}`);
      if (!current) return;
      if (!reply.ok) return setError(say(reply, "Couldn't load the settings."));
      setError(null);
      const loaded = reply.data!.settings as Row[];
      const fresh: Record<string, Draft> = {};
      for (const r of loaded) fresh[r.key] = toDraft(where === SCHOOL ? r.school : (r.override ?? r.school));
      setRows(loaded);
      setDrafts(fresh);
      setCleared({});
      setProblems({});
    })();
    return () => {
      current = false;
    };
  }, [where, version]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !rows) return;
    setNotice(null);
    const changes: Record<string, unknown> = {};
    const local: Record<string, string> = {};
    for (const row of rows) {
      if (cleared[row.key]) {
        changes[row.key] = null;
        continue;
      }
      const parsed = toValue(row, drafts[row.key]);
      if ("why" in parsed) {
        local[row.key] = parsed.why;
        continue;
      }
      const before = isSchool ? row.school : (row.override ?? row.school);
      if (JSON.stringify(parsed.value) !== JSON.stringify(before)) changes[row.key] = parsed.value;
    }
    setProblems(local);
    if (Object.keys(local).length > 0) return setNotice({ variant: "error", text: "Some entries need fixing before this can be saved." });
    if (Object.keys(changes).length === 0) return setNotice({ variant: "success", text: "Nothing to save: no setting was changed." });
    setPending(true);
    const reply = await sendJson("/api/v1/question-bank/settings", "PUT", {
      scope: isSchool ? "GLOBAL" : "BRANCH",
      ...(isSchool ? {} : { branchId: where }),
      changes,
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    });
    setPending(false);
    if (!reply.ok) {
      const fieldProblems: Record<string, string> = {};
      for (const d of (reply.details ?? []) as FieldProblem[]) fieldProblems[d.path.replace(/^changes\./, "")] = d.message;
      setProblems(fieldProblems);
      return setNotice({ variant: "error", text: say(reply, "That didn't work.") });
    }
    const count = (reply.data!.changed as string[]).length;
    setReason("");
    setNotice({
      variant: "success",
      text:
        count === 0
          ? "Nothing changed."
          : `Saved. ${count === 1 ? "One setting" : `${count} settings`} changed ${isSchool ? "for every branch" : `for ${branch?.name ?? "this branch"}`}.`,
    });
    setVersion(version + 1);
  }

  if (editable.length === 0 && !isSuperAdmin)
    return (
      <p role="alert" className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
        You do not administer a branch, so you cannot change these settings.
      </p>
    );

  return (
    <div className="space-y-6">
      <Alert variant="info">
        <p>
          <strong>What these switches can and cannot do.</strong> Screenshots and phone photos cannot be prevented in a browser. These
          controls (caps, rate limits, an audit trail and, later, watermarks) discourage copying and leave a trail; they do not make it
          impossible. Every change is recorded with who made it.
        </p>
      </Alert>
      {(editable.length > 1 || isSuperAdmin) && (
        <SelectField
          label="Settings for"
          value={where}
          onChange={(e) => {
            setRows(null);
            setNotice(null);
            setWhere(e.target.value);
          }}
          options={[
            ...(isSuperAdmin ? [{ value: SCHOOL, label: "Every branch (school-wide)" }] : []),
            ...editable.map((b) => ({ value: b.id, label: b.name })),
          ]}
        />
      )}
      <div aria-live="polite" className="empty:hidden">
        {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}
      </div>
      {!isSchool && (
        <p className="text-sm text-fg-muted">
          A branch can only make a switch stricter than the school&apos;s: it can switch something off, lower a limit, or raise a minimum,
          never the other way.
        </p>
      )}
      {rows === null ? (
        <p className="text-sm text-fg-muted" aria-busy="true">
          Loading…
        </p>
      ) : (
        <form onSubmit={save} className="space-y-4" noValidate>
          <ul className="space-y-3">
            {rows.map((row) => {
              const draft = drafts[row.key];
              const setDraft = (value: Draft) => {
                setDrafts({ ...drafts, [row.key]: value });
                setCleared({ ...cleared, [row.key]: false });
              };
              const note = isSchool
                ? `Built-in default: ${show(row.default, row.unit)}.`
                : `School: ${show(row.school, row.unit)}. Applies here: ${show(row.effective, row.unit)}.`;
              const error = problems[row.key] ?? null;
              return (
                <li key={row.key} className="space-y-2 rounded-2xl border border-line bg-surface p-4">
                  {row.kind === "flag" ? (
                    <CheckboxField
                      label={row.label}
                      checked={draft === true}
                      disabled={!canEdit}
                      onChange={(e) => setDraft(e.target.checked)}
                    />
                  ) : row.kind === "images" ? (
                    <SelectField
                      label={row.label}
                      value={String(draft)}
                      disabled={!canEdit}
                      onChange={(e) => setDraft(e.target.value)}
                      error={error}
                      options={[
                        { value: "3", label: "3" },
                        { value: "4", label: "4" },
                      ]}
                    />
                  ) : (
                    <TextField
                      label={`${row.label}${row.unit ? ` (${row.unit})` : ""}`}
                      inputMode="numeric"
                      value={String(draft)}
                      disabled={!canEdit}
                      onChange={(e) => setDraft(e.target.value)}
                      error={error}
                    />
                  )}
                  {row.kind === "flag" && error && <p className="text-sm text-danger-fg">{error}</p>}
                  <p className="text-sm text-fg-2">{row.help}</p>
                  <p className="text-xs text-fg-muted">
                    {row.stricter} {note}
                  </p>
                  {!isSchool && canEdit && row.override !== null && !cleared[row.key] && (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setCleared({ ...cleared, [row.key]: true });
                        setDrafts({ ...drafts, [row.key]: toDraft(row.school) });
                      }}
                    >
                      Use the school&apos;s setting<span className="sr-only"> for {row.label}</span>
                    </Button>
                  )}
                  {cleared[row.key] && <p className="text-sm text-fg-2">This branch will use the school&apos;s setting once you save.</p>}
                </li>
              );
            })}
          </ul>
          {canEdit && (
            <>
              <TextField
                label="Reason (optional)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                hint="Kept with the change in the audit trail."
              />
              <Button type="submit" loading={pending}>
                {pending ? "Saving…" : "Save settings"}
              </Button>
            </>
          )}
        </form>
      )}
    </div>
  );
}
