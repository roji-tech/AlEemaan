"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { ActionsMenu, type MenuAction } from "@/components/ui/ActionsMenu";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { TONE } from "@/components/ui/tone";
import { useNotice } from "@/components/ui/Toaster";
import { getJson, sendJson } from "@/components/auth/postJson";
import { say } from "@/components/academics/common";
import { SchoolTemplateBranchesDialog, type BranchesMode } from "@/components/results/SchoolTemplateBranchesDialog";
import { SchoolTemplateFormDialog } from "@/components/results/SchoolTemplateFormDialog";
import { layoutName, type SchoolTemplateView, type SchoolTemplatesData } from "@/components/results/school-template-types";
import { STATE_LABEL, type RowState } from "@/lib/results/school-templates-rules";

// Results > School templates (task 0120), for a superadmin: the report cards the whole school shares. Each shows its version, what it holds, and the branches that follow it with where each stands (Up
// to date, Behind, Customised here). "Update branches" brings the chosen branches up to the current version; "Add to branches" gives a branch its own copy. Presentation only: the school-template
// APIs decide who may do what (a superadmin only).
const STATE_TONE: Record<RowState, string> = {
  "up-to-date": TONE.ok.chip,
  behind: TONE.warn.chip,
  customised: TONE.info.chip,
  "customised-behind": TONE.warn.chip,
};

export function SchoolTemplatesPanel() {
  const [data, setData] = useState<SchoolTemplatesData | null>(null);
  const [archived, setArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useNotice();
  const [form, setForm] = useState<{ template: SchoolTemplateView | null } | null>(null);
  const [branchesOf, setBranchesOf] = useState<{ template: SchoolTemplateView; mode: BranchesMode } | null>(null);

  const load = useCallback(async () => {
    const reply = await getJson(`/api/v1/school-templates${archived ? "?archived=true" : ""}`);
    if (!reply.ok) return setError(say(reply, "Couldn't load the school templates."));
    setError(null);
    setData(reply.data as unknown as SchoolTemplatesData);
  }, [archived]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading when the archived switch changes is exactly what this effect is for
    void load();
  }, [load]);

  const done = async (text: string) => {
    setForm(null);
    setBranchesOf(null);
    setNotice({ variant: "success", text });
    await load();
  };
  async function setArchivedFlag(t: SchoolTemplateView, value: boolean) {
    const reply = await sendJson(`/api/v1/school-templates/${encodeURIComponent(t.id)}`, "PATCH", { archived: value });
    setNotice(
      reply.ok
        ? { variant: "success", text: `${t.name} ${value ? "archived" : "restored"}.` }
        : { variant: "error", text: say(reply, "That didn't work.") },
    );
    await load();
  }
  const actionsFor = (t: SchoolTemplateView): MenuAction[] =>
    t.archived
      ? [{ id: "restore", label: "Restore", ariaLabel: `Restore ${t.name}`, onSelect: () => void setArchivedFlag(t, false) }]
      : [
          { id: "edit", label: "Edit", ariaLabel: `Edit ${t.name}`, onSelect: () => setForm({ template: t }) },
          {
            id: "update",
            label: "Update branches",
            ariaLabel: `Update branches to ${t.name}`,
            onSelect: () => setBranchesOf({ template: t, mode: "update" }),
          },
          {
            id: "add",
            label: "Add to branches",
            ariaLabel: `Add ${t.name} to branches`,
            onSelect: () => setBranchesOf({ template: t, mode: "add" }),
          },
          { id: "archive", label: "Archive", ariaLabel: `Archive ${t.name}`, danger: true, onSelect: () => void setArchivedFlag(t, true) },
        ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-fg-muted">
          One report card for the whole school. A branch follows it with its own copy, so classes, marks and results stay in the branch.
          Change it here, then update the branches that should have the change.
        </p>
        <Button onClick={() => setForm({ template: null })}>New school template</Button>
      </div>
      <CheckboxField label="Show archived school templates" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
      <div aria-live="polite" className="empty:hidden">
        {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}
      </div>
      {data === null ? (
        <p className="text-sm text-fg-muted">Loading…</p>
      ) : data.templates.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
          {archived ? "No archived school templates." : "No school templates yet."}
        </p>
      ) : (
        <ul aria-label="School templates" className="grid gap-4 md:grid-cols-2">
          {data.templates.map((t) => {
            const groups = t.definition.groups;
            const traits = groups.reduce((n, g) => n + g.traits.length, 0);
            return (
              <li key={t.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="break-words text-base font-semibold text-fg">{t.name}</h3>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${TONE.brand.chip}`}>Version {t.version}</span>
                      {t.archived && (
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${TONE.neutral.chip}`}>Archived</span>
                      )}
                    </div>
                  </div>
                  <ActionsMenu name={t.name} actions={actionsFor(t)} />
                </div>
                {t.description && <p className="text-sm text-fg-muted">{t.description}</p>}
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-fg-muted">Look</dt>
                  <dd className="text-fg">{layoutName(t.layoutCode)}</dd>
                  <dt className="text-fg-muted">Marks</dt>
                  <dd className="text-fg">{t.definition.scheme ? t.definition.scheme.name : "Each branch's usual scheme"}</dd>
                  <dt className="text-fg-muted">Grades</dt>
                  <dd className="text-fg">
                    {t.definition.scale ? t.definition.scale.name : "Each branch's default scale"}
                    {t.definition.scale?.unconfirmed ? " (bands to be confirmed)" : ""}
                  </dd>
                  <dt className="text-fg-muted">Traits</dt>
                  <dd className="text-fg">
                    {groups.length === 0
                      ? "None"
                      : `${traits} in ${groups.length} ${groups.length === 1 ? "section" : "sections"}: ${groups.map((g) => g.title).join(", ")}`}
                  </dd>
                </dl>
                {t.branches.length > 0 ? (
                  <ul aria-label={`Branches that follow ${t.name}`} className="flex flex-wrap gap-1.5">
                    {t.branches.map((b) => (
                      <li key={b.branchId} className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATE_TONE[b.state]}`}>
                        {b.branchName}: {STATE_LABEL[b.state]}
                        {b.state === "behind" || b.state === "customised-behind" ? ` (v${b.version ?? 0}, school has v${t.version})` : ""}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-fg-muted">No branch follows it yet.</p>
                )}
                {!t.archived && t.missingBranches.length > 0 && (
                  <p className="text-xs text-fg-muted">Not in: {t.missingBranches.map((b) => b.name).join(", ")}.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {form && <SchoolTemplateFormDialog template={form.template} onClose={() => setForm(null)} onDone={done} />}
      {branchesOf && (
        <SchoolTemplateBranchesDialog
          template={branchesOf.template}
          mode={branchesOf.mode}
          onClose={() => setBranchesOf(null)}
          onDone={done}
        />
      )}
    </div>
  );
}
