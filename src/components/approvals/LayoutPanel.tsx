"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import { getJson, sendJson } from "@/components/auth/postJson";
import { say, type BranchChoice, type Notice } from "@/components/academics/common";

// Which report-card layout a branch prints, and which of its optional parts it shows. A superadmin can also switch "an administrator's change needs my approval" on
// (for every branch): then an administrator's save becomes a request with their reason, and the report cards keep the old layout until it is approved.

type Layout = { code: string; name: string; type: string; isLegacy: boolean };
type Options = { logo: boolean; signatureLine: boolean; nextTermDate: boolean };
const OPTIONS: { key: keyof Options; label: string }[] = [
  { key: "logo", label: "School logo" },
  { key: "signatureLine", label: "Signature line" },
  { key: "nextTermDate", label: "Next-term resumption date" },
];

export function LayoutPanel({ branches, isSuperAdmin }: { branches: BranchChoice[]; isSuperAdmin: boolean }) {
  const [branchId, setBranchId] = useState(branches[0].id);
  const branch = branches.find((b) => b.id === branchId) ?? branches[0];
  const [layouts, setLayouts] = useState<Layout[] | null>(null);
  const [code, setCode] = useState("DEFAULT");
  const [options, setOptions] = useState<Options>({ logo: true, signatureLine: true, nextTermDate: true });
  const [reason, setReason] = useState("");
  const [enforced, setEnforced] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    const [l, e] = await Promise.all([
      getJson(`/api/v1/settings/layouts?branchId=${encodeURIComponent(branchId)}`),
      isSuperAdmin ? getJson("/api/v1/settings/enforcement") : Promise.resolve(null),
    ]);
    if (!l.ok) return setError(say(l, "Couldn't load the layouts."));
    setError(null);
    setLayouts(l.data!.layouts as Layout[]);
    const active = l.data!.activeLayout as { code: string; options: Partial<Options> } | null;
    setCode(active?.code ?? "DEFAULT");
    setOptions({ logo: true, signatureLine: true, nextTermDate: true, ...(active?.options ?? {}) });
    if (e?.ok) {
      const flags = e.data!.flags as { key: string; branchId: string | null; enforced: boolean }[];
      setEnforced(flags.some((f) => f.key === "report_card_layout" && f.branchId === null && f.enforced));
    }
  }, [branchId, isSuperAdmin]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading on a branch change is exactly what this effect is for
    void load();
  }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setNotice(null);
    const r = await sendJson("/api/v1/settings/layouts", "PATCH", {
      branchId,
      layoutCode: code,
      options,
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    });
    setPending(false);
    if (r.ok) {
      setNotice(
        r.status === 202
          ? {
              variant: "success",
              text: "Sent to a superadmin for approval. The report cards keep their present layout until it is approved.",
            }
          : { variant: "success", text: `Saved. ${branch.name} report cards now use this layout.` },
      );
      setReason("");
      return void (await load());
    }
    setNotice({ variant: "error", text: say(r, "That didn't work.") });
  }
  async function setEnforcement(next: boolean) {
    const r = await sendJson("/api/v1/settings/enforcement", "PUT", { key: "report_card_layout", enforced: next });
    if (r.ok) {
      setEnforced(next);
      setNotice({
        variant: "success",
        text: next ? "Administrators' layout changes now need your approval." : "Administrators can change the layout without approval.",
      });
    } else setNotice({ variant: "error", text: say(r, "That didn't work.") });
  }

  return (
    <div className="space-y-6">
      {branches.length > 1 && (
        <SelectField
          label="Branch"
          value={branchId}
          onChange={(e) => {
            setLayouts(null);
            setBranchId(e.target.value);
          }}
          options={branches.map((b) => ({ value: b.id, label: b.name }))}
        />
      )}
      <div aria-live="polite" className="empty:hidden">
        {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}
      </div>
      {isSuperAdmin && enforced !== null && (
        <label className="flex items-start gap-2 rounded-2xl border border-line bg-surface p-4 text-sm text-fg">
          <input type="checkbox" className="mt-1" checked={enforced} onChange={(e) => void setEnforcement(e.target.checked)} />
          <span>
            <strong>An administrator&apos;s layout change needs my approval</strong> (every branch). They give a reason, and you decide
            under Requests.
          </span>
        </label>
      )}
      {layouts === null ? (
        <p className="text-sm text-fg-muted" aria-busy="true">
          Loading…
        </p>
      ) : (
        <form onSubmit={save} className="space-y-5" noValidate>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-fg">Layout for {branch.name}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {layouts.map((l) => (
                <label key={l.code} className="flex items-start gap-2 rounded-xl border border-line bg-surface p-3 text-sm text-fg">
                  <input
                    type="radio"
                    name="layout"
                    className="mt-1"
                    value={l.code}
                    checked={code === l.code}
                    onChange={() => setCode(l.code)}
                    disabled={!branch.canEdit}
                  />
                  <span>
                    {l.name}
                    {l.isLegacy && <span className="ml-2 text-xs text-fg-muted">(the old school look)</span>}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-fg">Show on the card</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {OPTIONS.map((o) => (
                <label key={o.key} className="flex items-center gap-2 text-sm text-fg">
                  <input
                    type="checkbox"
                    checked={options[o.key]}
                    onChange={(e) => setOptions((all) => ({ ...all, [o.key]: e.target.checked }))}
                    disabled={!branch.canEdit}
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </fieldset>
          {branch.canEdit && (
            <>
              {!isSuperAdmin && (
                <div>
                  <label htmlFor="layout-reason" className="mb-1.5 block text-xs font-semibold tracking-wide text-fg-2 uppercase">
                    Reason (needed when a superadmin has put this behind approval)
                  </label>
                  <textarea
                    id="layout-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    maxLength={500}
                    className="w-full rounded-xl border border-line bg-field p-3 text-sm text-fg focus-visible:outline-2 focus-visible:outline-ring"
                  />
                </div>
              )}
              <Button type="submit" loading={pending}>
                {pending ? "Saving…" : "Save layout"}
              </Button>
            </>
          )}
        </form>
      )}
    </div>
  );
}
