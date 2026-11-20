"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { ActionsMenu, type MenuAction } from "@/components/ui/ActionsMenu";
import { BranchPicker } from "@/components/ui/BranchPicker";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { TONE } from "@/components/ui/tone";
import { useNotice } from "@/components/ui/Toaster";
import { getJson, sendJson } from "@/components/auth/postJson";
import { say, type BranchChoice } from "@/components/academics/common";
import { setClassTemplate } from "@/components/results/template-calls";
import { GradeScalesSection } from "@/components/results/GradeScalesSection";
import { TemplateClassesDialog } from "@/components/results/TemplateClassesDialog";
import { TemplateFormDialog, type TemplateFormMode } from "@/components/results/TemplateFormDialog";
import { lookText, moveLines, type TemplateView, type TemplatesData } from "@/components/results/template-types";
import { SCALE_SOURCE_TEXT } from "@/lib/results/templates-rules";
import { UNCONFIRMED_NOTICE } from "@/lib/results/scale-confirmation";

// Results > Templates (task 0116): the branch's result templates, each a look + a marks structure + a grade scale with the classes that use it, and a coverage list of every class with the
// template it uses. Any number of templates; a class is in one; a class nobody placed uses the default. Presentation only: the template APIs decide who may do what.
export function TemplatesPanel({ branches, initialBranchId }: { branches: BranchChoice[]; initialBranchId?: string }) {
  const [branchId, setBranchId] = useState(branches.some((b) => b.id === initialBranchId) ? initialBranchId! : branches[0].id);
  const [data, setData] = useState<TemplatesData | null>(null);
  const [archived, setArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useNotice();
  const [form, setForm] = useState<TemplateFormMode | null>(null);
  const [classesOf, setClassesOf] = useState<TemplateView | null>(null);
  const [makeDefault, setMakeDefault] = useState<TemplateView | null>(null);
  const [move, setMove] = useState<{ classGroupId: string; target: string | null; lines: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const reply = await getJson(`/api/v1/results/templates?branchId=${encodeURIComponent(branchId)}${archived ? "&archived=1" : ""}`);
    if (!reply.ok) return setError(say(reply, "Couldn't load the templates."));
    setError(null);
    setData(reply.data as unknown as TemplatesData);
  }, [branchId, archived]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading on a branch change is exactly what this effect is for
    void load();
  }, [load]);

  const done = async (text: string) => {
    setForm(null);
    setClassesOf(null);
    setNotice({ variant: "success", text });
    await load();
  };
  const live = (data?.templates ?? []).filter((t) => !t.archived);
  const defaultTemplate = live.find((t) => t.isDefault) ?? null;

  async function act(path: string, ok: string) {
    const reply = await sendJson(path, "POST");
    setNotice(reply.ok ? { variant: "success", text: ok } : { variant: "error", text: say(reply, "That didn't work.") });
    await load();
  }
  /// Sets (or clears, with null) the class's own grade scale: it wins over the template's and the branch's.
  async function placeScale(classGroupId: string, gradeScaleId: string | null) {
    setBusy(true);
    const reply = await sendJson("/api/v1/results/templates/class-scale", "PUT", { branchId, classGroupId, gradeScaleId });
    setBusy(false);
    const name = data?.coverage.find((c) => c.classGroupId === classGroupId)?.name ?? "The class";
    setNotice(
      reply.ok
        ? {
            variant: "success",
            text: gradeScaleId ? `${name} now grades on its own scale.` : `${name} grades on its template's scale again.`,
          }
        : { variant: "error", text: say(reply, "That didn't work.") },
    );
    await load();
  }
  async function place(classGroupId: string, target: string | null, confirm: boolean) {
    if (!data) return;
    setBusy(true);
    const reply = await setClassTemplate(data, classGroupId, target, confirm);
    setBusy(false);
    const lines = moveLines(reply);
    if (lines.length > 0) return setMove({ classGroupId, target, lines });
    setMove(null);
    setNotice(
      reply.ok
        ? {
            variant: "success",
            text: target
              ? `${data.coverage.find((c) => c.classGroupId === classGroupId)?.name ?? "The class"} now uses ${data.templates.find((t) => t.id === target)?.name}.`
              : "The class now uses the default template.",
          }
        : { variant: "error", text: say(reply, "That didn't work.") },
    );
    await load();
  }

  const actionsFor = (t: TemplateView): MenuAction[] =>
    t.archived
      ? [
          {
            id: "restore",
            label: "Restore",
            ariaLabel: `Restore ${t.name}`,
            onSelect: () => void act(`/api/v1/results/templates/${t.id}/restore`, `${t.name} restored.`),
          },
        ]
      : [
          { id: "edit", label: "Edit", ariaLabel: `Edit ${t.name}`, onSelect: () => setForm({ kind: "edit", template: t }) },
          { id: "duplicate", label: "Duplicate", ariaLabel: `Duplicate ${t.name}`, onSelect: () => setForm({ kind: "copy", template: t }) },
          ...(t.isDefault
            ? []
            : [{ id: "default", label: "Make the default", ariaLabel: `Make ${t.name} the default`, onSelect: () => setMakeDefault(t) }]),
          ...(t.isDefault
            ? []
            : [
                {
                  id: "archive",
                  label: "Archive",
                  ariaLabel: `Archive ${t.name}`,
                  danger: true,
                  onSelect: () => void act(`/api/v1/results/templates/${t.id}/archive`, `${t.name} archived.`),
                },
              ]),
        ];

  return (
    <div className="space-y-6">
      <BranchPicker
        branches={branches}
        value={branchId}
        onChange={(id) => {
          setData(null);
          setNotice(null);
          setBranchId(id);
        }}
      />
      <div aria-live="polite" className="empty:hidden">
        {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}
      </div>

      <section aria-labelledby="templates-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="templates-heading" className="text-lg font-semibold tracking-tight text-fg">
              Result templates
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-fg-muted">
              A template is a look for the report card, a marks structure and a grade scale. Put classes in templates; a class nobody has
              placed uses the default template. Marks already entered keep the structure they were entered under.
            </p>
          </div>
          <Button onClick={() => setForm({ kind: "new" })}>New template</Button>
        </div>
        <CheckboxField label="Show archived templates" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
        {data === null ? (
          <p className="text-sm text-fg-muted" aria-busy="true">
            Loading…
          </p>
        ) : (
          <ul aria-label="Templates" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.templates.map((t) => {
              const classNames = t.classGroupIds
                .map((id) => data.coverage.find((c) => c.classGroupId === id)?.name)
                .filter((n): n is string => !!n);
              return (
                <li key={t.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="break-words text-base font-semibold text-fg">{t.name}</h3>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {t.isDefault && (
                          <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${TONE.brand.chip}`}>Default</span>
                        )}
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
                    <dd className="text-fg">{lookText(t, data.choices.layouts)}</dd>
                    <dt className="text-fg-muted">Marks</dt>
                    <dd className="text-fg">{t.scheme ? t.scheme.name : "The branch's usual scheme"}</dd>
                    <dt className="text-fg-muted">Grades</dt>
                    <dd className="text-fg">{t.gradeScale ? t.gradeScale.name : "The branch's default scale"}</dd>
                  </dl>
                  {classNames.length > 0 ? (
                    <ul aria-label={`Classes of ${t.name}`} className="flex flex-wrap gap-1.5">
                      {classNames.map((n) => (
                        <li key={n} className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONE.info.chip}`}>
                          {n}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-fg-muted">{t.isDefault ? "Every class nobody has placed." : "No classes placed yet."}</p>
                  )}
                  {!t.archived && (
                    <div className="mt-auto">
                      <Button variant="secondary" onClick={() => setClassesOf(t)} aria-label={`Add classes to ${t.name}`}>
                        Add classes
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {data && (
        <section aria-labelledby="coverage-heading" className="space-y-3">
          <div>
            <h2 id="coverage-heading" className="text-lg font-semibold tracking-tight text-fg">
              Which template each class uses
            </h2>
            <p className="mt-1 text-sm text-fg-muted" aria-live="polite">
              {data.coverage.length === 0
                ? "This branch has no classes yet."
                : data.unplaced === 0
                  ? "Every class has a template."
                  : `${data.unplaced} of ${data.coverage.length} ${data.unplaced === 1 ? "class uses" : "classes use"} the default template because nobody has chosen one.`}
            </p>
          </div>
          <ul aria-label="Coverage" className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {data.coverage.map((c) => (
              <li key={c.classGroupId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg">{c.name}</p>
                  <p className="text-xs text-fg-muted">
                    {[
                      c.sectionName,
                      c.explicit ? null : "Uses the default",
                      c.ownScheme ? `Has its own scheme (${c.ownScheme.name}), which is used instead of the template's` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {c.scale && (
                    <p className="text-xs text-fg-muted">
                      Grades on: {c.scale.name ?? "a scale"} ({SCALE_SOURCE_TEXT[c.scale.source]})
                      {c.scale.unconfirmed ? ` · ${UNCONFIRMED_NOTICE}` : ""}
                    </p>
                  )}
                </div>
                <div className="grid w-full gap-2 sm:w-[34rem] sm:grid-cols-2">
                  <SelectField
                    label={`Result template of ${c.name}`}
                    hideLabel
                    value={c.explicit && c.templateId ? c.templateId : ""}
                    disabled={busy}
                    onChange={(e) => void place(c.classGroupId, e.target.value === "" ? null : e.target.value, false)}
                    options={[
                      { value: "", label: `Uses the default${defaultTemplate ? ` (${defaultTemplate.name})` : ""}` },
                      ...live.map((t) => ({ value: t.id, label: t.name })),
                    ]}
                  />
                  <SelectField
                    label={`Grade scale of ${c.name}`}
                    hideLabel
                    value={c.classScaleId ?? ""}
                    disabled={busy}
                    onChange={(e) => void placeScale(c.classGroupId, e.target.value === "" ? null : e.target.value)}
                    options={[
                      { value: "", label: "Scale: template's, else the branch default" },
                      ...data.choices.scales.map((s) => ({
                        value: s.id,
                        label: `Scale: ${s.name}${s.isDefault ? " (branch default)" : ""}`,
                      })),
                    ]}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data && (
        <GradeScalesSection branchId={branchId} data={data} onChanged={load} onNotice={(variant, text) => setNotice({ variant, text })} />
      )}

      {form && data && (
        <TemplateFormDialog
          key={`${form.kind}-${"template" in form ? form.template.id : "new"}`}
          data={data}
          branchId={branchId}
          mode={form}
          onClose={() => setForm(null)}
          onDone={done}
          onChoicesChanged={load}
        />
      )}
      {classesOf && data && (
        <TemplateClassesDialog key={classesOf.id} data={data} template={classesOf} onClose={() => setClassesOf(null)} onDone={done} />
      )}
      <Dialog
        open={makeDefault !== null}
        onClose={() => setMakeDefault(null)}
        title={`Make ${makeDefault?.name ?? ""} the default`}
        description="Classes nobody has placed will use it from now on. The template that is the default now stays, as an ordinary template."
      >
        <div className="mt-4 flex flex-wrap justify-end gap-3">
          <Button variant="ghost" onClick={() => setMakeDefault(null)}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              const t = makeDefault;
              setMakeDefault(null);
              if (t) await act(`/api/v1/results/templates/${t.id}/default`, `${t.name} is now the default.`);
            }}
          >
            Make the default
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={move !== null}
        onClose={() => setMove(null)}
        title="Move this class?"
        description="It leaves the template it is in now. Marks already entered keep the structure they were entered under."
      >
        <ul aria-label="Classes that would move" className="mt-4 divide-y divide-line rounded-xl border border-line text-sm">
          {(move?.lines ?? []).map((line) => (
            <li key={line} className="px-3 py-2 text-fg">
              {line}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap justify-end gap-3">
          <Button variant="ghost" onClick={() => setMove(null)}>
            Cancel
          </Button>
          <Button loading={busy} onClick={() => move && void place(move.classGroupId, move.target, true)}>
            Move
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
