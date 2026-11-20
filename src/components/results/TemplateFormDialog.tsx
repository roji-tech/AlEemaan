"use client";

import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { TextField } from "@/components/ui/TextField";
import { sendJson } from "@/components/auth/postJson";
import { say } from "@/components/academics/common";
import { SchemeForm } from "@/components/academics/SchemeForm";
import { LAYOUT_OPTION_LABELS, type TemplateView, type TemplatesData } from "@/components/results/template-types";
import { TEMPLATE_DESCRIPTION_MAX, TEMPLATE_NAME_MAX, type LayoutOptions } from "@/lib/results/templates-rules";

// One result template's form (task 0116): its name, the look of the report card, the marks structure and the grade scale. New, edit and duplicate share it. Each choice has a first option that
// means "as the branch does today", so a template only says what is different. Presentation only: the API checks everything and answers in words.
export type TemplateFormMode = { kind: "new" } | { kind: "edit"; template: TemplateView } | { kind: "copy"; template: TemplateView };

const NEW_SCHEME = "__new";
/// What a layout shows when the template names it and says nothing more (the layouts' own defaults).
const LAYOUT_DEFAULTS: Record<string, Required<LayoutOptions>> = {
  DEFAULT: { logo: true, signatureLine: true, nextTermDate: true, classArm: false, verifyLinks: false },
  LEGACY: { logo: true, signatureLine: false, nextTermDate: false, classArm: false, verifyLinks: false },
};
const optionsFor = (code: string, own: LayoutOptions | null): Required<LayoutOptions> => ({
  ...(LAYOUT_DEFAULTS[code] ?? LAYOUT_DEFAULTS.DEFAULT),
  ...(own ?? {}),
});

export function TemplateFormDialog({
  data,
  branchId,
  mode,
  onClose,
  onDone,
  onChoicesChanged,
}: {
  data: TemplatesData;
  branchId: string;
  mode: TemplateFormMode;
  onClose: () => void;
  onDone: (text: string) => void | Promise<void>;
  /// A scheme was made from this form: reload the choices so it is in the list.
  onChoicesChanged: () => Promise<void>;
}) {
  const source = mode.kind === "new" ? null : mode.template;
  const editing = mode.kind === "edit" ? mode.template : null;
  const [name, setName] = useState(mode.kind === "copy" ? `${mode.template.name} copy`.slice(0, TEMPLATE_NAME_MAX) : (source?.name ?? ""));
  const [description, setDescription] = useState(source?.description ?? "");
  const [layoutCode, setLayoutCode] = useState(source?.layoutCode ?? "");
  const [options, setOptions] = useState<Required<LayoutOptions>>(
    optionsFor(source?.layoutCode ?? "DEFAULT", source?.layoutOptions ?? null),
  );
  const [schemeId, setSchemeId] = useState(source?.scheme && !source.scheme.archived ? source.scheme.id : "");
  const [scaleId, setScaleId] = useState(source?.gradeScale && !source.gradeScale.archived ? source.gradeScale.id : "");
  const [reason, setReason] = useState("");
  const [needReason, setNeedReason] = useState(false);
  const [acknowledgeText, setAcknowledgeText] = useState<string | null>(null);
  const [makingScheme, setMakingScheme] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const layoutChanged =
    editing !== null &&
    ((editing.layoutCode ?? "") !== layoutCode ||
      (layoutCode !== "" && JSON.stringify(optionsFor(layoutCode, editing.layoutOptions)) !== JSON.stringify(options)));

  async function submit(event?: FormEvent<HTMLFormElement>, acknowledge = false) {
    event?.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const base = {
      name,
      description: description.trim() === "" ? null : description.trim(),
      schemeId: schemeId === "" || schemeId === NEW_SCHEME ? null : schemeId,
      gradeScaleId: scaleId === "" ? null : scaleId,
    };
    const look = { layoutCode: layoutCode === "" ? null : layoutCode, layoutOptions: layoutCode === "" ? null : options };
    const reply = editing
      ? await sendJson(`/api/v1/results/templates/${encodeURIComponent(editing.id)}`, "PATCH", {
          ...base,
          ...(layoutChanged ? look : {}),
          ...(acknowledge ? { acknowledge: true } : {}),
          ...(needReason && reason.trim() ? { reason: reason.trim() } : {}),
        })
      : await sendJson("/api/v1/results/templates", "POST", {
          branchId,
          ...base,
          ...look,
          ...(mode.kind === "copy" ? { copyFrom: mode.template.id } : {}),
        });
    setBusy(false);
    if (reply.ok) {
      const pending = (reply.data as { pending?: boolean } | undefined)?.pending === true;
      return void (await onDone(
        pending
          ? "The look was sent to a superadmin for approval; the rest was saved. Report cards keep the present look until it is approved."
          : editing
            ? `${name.trim()} saved.`
            : `${name.trim()} made.`,
      ));
    }
    if (reply.status === 400 && (reply.details ?? []).some((d) => d.path.endsWith("reason"))) {
      setNeedReason(true);
      return setError(say(reply, "Say why this change is needed."));
    }
    if (reply.status === 409 && (reply.message ?? "").startsWith("Marks are already entered")) return setAcknowledgeText(reply.message!);
    setError(say(reply, "The template could not be saved."));
  }

  const title =
    mode.kind === "new" ? "New result template" : mode.kind === "copy" ? `Duplicate ${mode.template.name}` : `Edit ${mode.template.name}`;
  return (
    <>
      <Dialog
        open
        onClose={onClose}
        title={title}
        description="A template is a look, a marks structure and a grade scale for the classes you put in it. Leave a choice on its first option to do what the branch does today."
        wide
      >
        <form onSubmit={(e) => void submit(e)} className="mt-4 space-y-4" noValidate>
          <TextField
            label="Name"
            value={name}
            maxLength={TEMPLATE_NAME_MAX}
            onChange={(e) => setName(e.target.value)}
            hint="For example Nursery, Primary, JSS or SSS 3."
          />
          <TextField
            label="Description (optional)"
            value={description}
            maxLength={TEMPLATE_DESCRIPTION_MAX}
            onChange={(e) => setDescription(e.target.value)}
          />
          <fieldset className="space-y-3 rounded-xl border border-line p-3">
            <legend className="px-1 text-sm font-semibold text-fg">Look of the report card</legend>
            <SelectField
              label="Layout"
              value={layoutCode}
              onChange={(e) => {
                setLayoutCode(e.target.value);
                if (e.target.value) setOptions(optionsFor(e.target.value, null));
              }}
              options={[
                { value: "", label: "The branch's standard layout" },
                ...data.choices.layouts.map((l) => ({ value: l.code, label: l.name })),
              ]}
              hint="The standard layout is the one in Approvals > Report cards."
            />
            {layoutCode !== "" && (
              <div role="group" aria-label="What the report card shows">
                {LAYOUT_OPTION_LABELS.map((o) => (
                  <CheckboxField
                    key={o.key}
                    label={o.label}
                    checked={options[o.key]}
                    onChange={(e) => setOptions((all) => ({ ...all, [o.key]: e.target.checked }))}
                  />
                ))}
              </div>
            )}
            <p className="text-xs text-fg-muted">
              The look is read when a card is drawn, so a change also shows on this class&apos;s earlier terms. The marks never change.
            </p>
          </fieldset>
          <SelectField
            label="Marks structure"
            value={schemeId}
            onChange={(e) => (e.target.value === NEW_SCHEME ? setMakingScheme(true) : setSchemeId(e.target.value))}
            options={[
              { value: "", label: "The branch's usual scheme" },
              ...data.choices.schemes.map((s) => ({ value: s.id, label: `${s.name} (${s.note})` })),
              { value: NEW_SCHEME, label: "Make a new scheme for this template…" },
            ]}
            hint="A class that has a scheme of its own in Academics > Assessment and grading keeps using that one."
          />
          <SelectField
            label="Grade scale"
            value={scaleId}
            onChange={(e) => setScaleId(e.target.value)}
            options={[
              { value: "", label: "The branch's default grade scale" },
              ...data.choices.scales.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
          {needReason && (
            <TextAreaField
              label="Why is this change needed?"
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
              hint="A superadmin approves changes to the report-card layout."
            />
          )}
          {acknowledgeText && (
            <Alert variant="warning">
              {acknowledgeText}
              <span className="mt-2 block">
                <Button variant="secondary" onClick={() => void submit(undefined, true)}>
                  Change it anyway
                </Button>
              </span>
            </Alert>
          )}
          {error && <Alert variant="error">{error}</Alert>}
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              {mode.kind === "edit" ? "Save" : mode.kind === "copy" ? "Duplicate" : "Make template"}
            </Button>
          </div>
        </form>
      </Dialog>
      {makingScheme && (
        <SchemeForm
          open
          title="New scheme for this template"
          description="Continuous-assessment parts and the exam; together they must add up to 100."
          initial={null}
          onClose={() => setMakingScheme(false)}
          onSubmit={async (body) => {
            const reply = await sendJson("/api/v1/results/templates/schemes", "POST", {
              branchId,
              name: body.name,
              examMax: body.examMax,
              components: body.components,
            });
            const made = (reply.data as { scheme?: { id: string } } | undefined)?.scheme?.id;
            if (reply.ok && made) setSchemeId(made);
            return reply;
          }}
          onDone={async () => {
            setMakingScheme(false);
            await onChoicesChanged();
          }}
        />
      )}
    </>
  );
}
