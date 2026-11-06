"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { getJson, sendJson } from "@/components/auth/postJson";
import { say, type Notice } from "@/components/academics/common";
import type { PolicyView } from "@/lib/finance/part-payment-service";

// The part-payment rule (task 0046): may an invoice be paid in parts, and what is the smallest part. The school's rule is the ceiling; a branch can only tighten it. The server
// decides and says why when it refuses; this screen only asks and shows what applies.

type Policy = { allowed: boolean; minimum: { kind: "NONE" } | { kind: "AMOUNT"; value: number } | { kind: "PERCENT"; value: number } };
const DEFAULT: Policy = { allowed: true, minimum: { kind: "NONE" } };

export function PaymentRulesPanel() {
  const [view, setView] = useState<PolicyView | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    const reply = await getJson("/api/v1/settings/part-payment", signal);
    if (signal?.aborted) return;
    if (!reply.ok) return setFailed(say(reply, "The rule couldn't be loaded."));
    setFailed(null);
    setView(reply.data as unknown as PolicyView);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load once on arrival
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function save(key: string, body: Record<string, unknown>, done: string) {
    setBusy(key);
    setNotice(null);
    const reply = await sendJson("/api/v1/settings/part-payment", "PATCH", body);
    setBusy(null);
    setNotice(reply.ok ? { variant: "success", text: done } : { variant: "error", text: say(reply, "That didn't work.") });
    if (reply.ok) setView(reply.data as unknown as PolicyView);
  }

  if (failed) return <Alert variant="error">{failed}</Alert>;
  if (!view) return <p className="text-sm text-fg-muted">Loading…</p>;

  return (
    <div className="space-y-5">
      {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
      <Card className="space-y-3">
        <h2 className="text-lg font-semibold text-fg">Part payments</h2>
        <p className="text-sm text-fg-muted">
          Whether a parent or guardian can pay an invoice in parts, and the smallest part. The school&apos;s rule applies everywhere; a
          branch can make it stricter for itself but never looser. The payment that settles the whole balance is always allowed. One invoice
          can also be marked &ldquo;pay in full&rdquo; from its page.
        </p>
        <p className="text-sm font-semibold text-fg" id="part-payment-school-text">
          The school: {view.school.text}
        </p>
        {view.canEditSchool && (
          <PolicyEditor
            key={JSON.stringify(view.school.stored)}
            idPrefix="school"
            stored={view.school.stored}
            busy={busy === "school"}
            saveLabel="Save the school's rule"
            onSave={(policy) => save("school", { scope: "GLOBAL", policy }, "The school's rule is saved.")}
          />
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="text-lg font-semibold text-fg">Branches</h2>
        <ul className="space-y-3">
          {view.branches.map((branch) => (
            <li key={branch.id} className="space-y-2 rounded-xl border border-line px-3 py-3 text-sm">
              <p className="text-fg">
                <span className="font-semibold">{branch.name}</span>
                <span className="text-fg-muted"> · {branch.text}</span>
              </p>
              {branch.canEdit && (
                <PolicyEditor
                  key={JSON.stringify(branch.stored)}
                  idPrefix={branch.id}
                  stored={branch.stored}
                  busy={busy === branch.id}
                  saveLabel={`Save the rule for ${branch.name}`}
                  onSave={(policy) =>
                    save(branch.id, { scope: "BRANCH", branchId: branch.id, policy }, `The rule for ${branch.name} is saved.`)
                  }
                  onClear={
                    branch.stored
                      ? () =>
                          save(
                            branch.id,
                            { scope: "BRANCH", branchId: branch.id, policy: null },
                            `${branch.name} follows the school's rule again.`,
                          )
                      : undefined
                  }
                  clearLabel={`Follow the school's rule in ${branch.name}`}
                />
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function PolicyEditor({
  idPrefix,
  stored,
  busy,
  saveLabel,
  clearLabel,
  onSave,
  onClear,
}: {
  idPrefix: string;
  stored: Policy | null;
  busy: boolean;
  saveLabel: string;
  clearLabel?: string;
  onSave: (policy: Policy) => void;
  onClear?: () => void;
}) {
  const start = stored ?? DEFAULT;
  const [allowed, setAllowed] = useState(start.allowed);
  const [kind, setKind] = useState<Policy["minimum"]["kind"]>(start.minimum.kind);
  const [value, setValue] = useState(start.minimum.kind === "NONE" ? "" : String(start.minimum.value));
  const [problem, setProblem] = useState<string | null>(null);

  function submit() {
    setProblem(null);
    if (!allowed || kind === "NONE") return onSave({ allowed, minimum: { kind: "NONE" } });
    const amount = Number(value);
    if (!value.trim() || !Number.isFinite(amount) || amount <= 0)
      return setProblem(
        kind === "AMOUNT" ? "Give the smallest part as an amount in naira." : "Give the smallest part as a percentage from 1 to 100.",
      );
    onSave({ allowed, minimum: { kind, value: amount } });
  }

  return (
    <div className="space-y-3">
      <CheckboxField label="Invoices can be paid in parts" checked={allowed} onChange={(e) => setAllowed(e.target.checked)} />
      {allowed && (
        <div className="grid gap-3 sm:grid-cols-[14rem_1fr]">
          <SelectField
            label="Smallest part"
            value={kind}
            onChange={(e) => setKind(e.target.value as Policy["minimum"]["kind"])}
            options={[
              { value: "NONE", label: "Any amount" },
              { value: "AMOUNT", label: "An amount (₦)" },
              { value: "PERCENT", label: "A percentage of the invoice" },
            ]}
            id={`${idPrefix}-kind`}
          />
          {kind !== "NONE" && (
            <TextField
              label={kind === "AMOUNT" ? "Smallest amount (₦)" : "Smallest percentage"}
              type="number"
              inputMode="decimal"
              min={0}
              step={kind === "AMOUNT" ? "0.01" : "1"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              error={problem}
              id={`${idPrefix}-value`}
            />
          )}
        </div>
      )}
      {problem && kind === "NONE" && <Alert variant="error">{problem}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" loading={busy} onClick={submit}>
          {saveLabel}
        </Button>
        {onClear && (
          <Button variant="ghost" disabled={busy} onClick={onClear}>
            {clearLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
