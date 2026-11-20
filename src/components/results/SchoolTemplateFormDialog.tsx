"use client";

import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { sendJson } from "@/components/auth/postJson";
import { say } from "@/components/academics/common";
import { EMPTY_DEFINITION, LAYOUT_NAMES, freshKey, type SchoolTemplateView } from "@/components/results/school-template-types";
import { LAYOUT_OPTION_LABELS } from "@/components/results/template-types";
import { LAYOUT_CODES, TEMPLATE_DESCRIPTION_MAX, TEMPLATE_NAME_MAX, type LayoutOptions } from "@/lib/results/templates-rules";
import type { Definition } from "@/lib/results/school-templates-rules";

// One school-wide template's form (task 0120): its name, the look, the marks scheme, the grade scale and the trait groups. New and edit share it. A superadmin only (the API refuses anyone else).
// Saving a change makes a new version; the branches are brought up to it afterwards with "Update branches". Presentation only: the API checks everything and answers in words.
const num = (v: string): number => (v.trim() === "" ? Number.NaN : Number(v));
const text = (n: number | undefined) => (n === undefined || Number.isNaN(n) ? "" : String(n));

export function SchoolTemplateFormDialog({
  template,
  onClose,
  onDone,
}: {
  template: SchoolTemplateView | null;
  onClose: () => void;
  onDone: (message: string) => void | Promise<void>;
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [layoutCode, setLayoutCode] = useState(template?.layoutCode ?? "");
  const [options, setOptions] = useState<Required<LayoutOptions>>({
    logo: true,
    signatureLine: true,
    nextTermDate: true,
    classArm: false,
    verifyLinks: false,
    ...(template?.layoutOptions ?? {}),
  });
  const [def, setDef] = useState<Definition>(() => JSON.parse(JSON.stringify(template?.definition ?? EMPTY_DEFINITION)) as Definition);
  const [useScheme, setUseScheme] = useState(def.scheme !== null);
  const [useScale, setUseScale] = useState(def.scale !== null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scheme = def.scheme ?? EMPTY_DEFINITION.scheme!;
  const scale = def.scale ?? EMPTY_DEFINITION.scale!;
  const patchScheme = (p: Partial<NonNullable<Definition["scheme"]>>) =>
    setDef((d) => ({ ...d, scheme: { ...(d.scheme ?? EMPTY_DEFINITION.scheme!), ...p } }));
  const patchScale = (p: Partial<NonNullable<Definition["scale"]>>) =>
    setDef((d) => ({ ...d, scale: { ...(d.scale ?? EMPTY_DEFINITION.scale!), ...p } }));
  const takenGroupKeys = () => new Set(def.groups.map((g) => g.key));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const body = {
      name,
      description: description.trim() === "" ? null : description,
      layoutCode: layoutCode === "" ? null : layoutCode,
      layoutOptions: layoutCode === "" ? null : options,
      definition: { scheme: useScheme ? def.scheme : null, scale: useScale ? def.scale : null, groups: def.groups },
    };
    const reply = template
      ? await sendJson(`/api/v1/school-templates/${encodeURIComponent(template.id)}`, "PATCH", body)
      : await sendJson("/api/v1/school-templates", "POST", body);
    setBusy(false);
    if (!reply.ok) return setError(say(reply, "That didn't save. Check the fields and try again."));
    const version = (reply.data as { version?: number } | undefined)?.version;
    await onDone(
      template
        ? (reply.data as { changed?: boolean } | undefined)?.changed === false
          ? `${name} is unchanged.`
          : `${name} saved as version ${version}. Update the branches to bring them up to it.`
        : `${name} created. Add it to the branches that should use it.`,
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={template ? `Edit ${template.name}` : "New school template"}
      description="A school template is one report card for the whole school: its look, marks, grade scale and trait sections. Branches follow it and are brought up to each new version when you update them."
      wide
    >
      <form onSubmit={(e) => void submit(e)} className="mt-4 space-y-4" noValidate>
        <TextField
          label="Name"
          value={name}
          maxLength={TEMPLATE_NAME_MAX}
          onChange={(e) => setName(e.target.value)}
          hint="For example Nursery card or Senior secondary."
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
            onChange={(e) => setLayoutCode(e.target.value)}
            options={[
              { value: "", label: "Each branch's standard layout" },
              ...LAYOUT_CODES.map((c) => ({ value: c, label: LAYOUT_NAMES[c] ?? c })),
            ]}
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
        </fieldset>

        <fieldset className="space-y-3 rounded-xl border border-line p-3">
          <legend className="px-1 text-sm font-semibold text-fg">Marks</legend>
          <CheckboxField
            label="Set the marks structure (otherwise each branch uses its usual scheme)"
            checked={useScheme}
            onChange={(e) => setUseScheme(e.target.checked)}
          />
          {useScheme && (
            <>
              <TextField
                label="Scheme name"
                value={scheme.name}
                maxLength={60}
                onChange={(e) => patchScheme({ name: e.target.value })}
                hint="One name stands for one structure across the whole school: a different structure needs a different name."
              />
              <div className="grid grid-cols-2 gap-3">
                <TextField
                  label="Total"
                  inputMode="decimal"
                  value={text(scheme.totalMax)}
                  onChange={(e) => patchScheme({ totalMax: num(e.target.value) })}
                />
                <TextField
                  label="Exam"
                  inputMode="decimal"
                  value={text(scheme.examMax)}
                  onChange={(e) => patchScheme({ examMax: num(e.target.value) })}
                />
              </div>
              <ul aria-label="Continuous assessment parts" className="space-y-2">
                {scheme.components.map((c, i) => (
                  <li key={i} className="grid grid-cols-[1fr_6rem_auto] items-end gap-2">
                    <TextField
                      label={`Part ${i + 1}`}
                      value={c.name}
                      maxLength={40}
                      onChange={(e) =>
                        patchScheme({ components: scheme.components.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })
                      }
                    />
                    <TextField
                      label="Marks"
                      inputMode="decimal"
                      value={text(c.maxScore)}
                      onChange={(e) =>
                        patchScheme({
                          components: scheme.components.map((x, j) => (j === i ? { ...x, maxScore: num(e.target.value) } : x)),
                        })
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={`Remove part ${i + 1}`}
                      onClick={() => patchScheme({ components: scheme.components.filter((_, j) => j !== i) })}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
              {scheme.components.length < 10 && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => patchScheme({ components: [...scheme.components, { name: "", maxScore: 0 }] })}
                >
                  Add a part
                </Button>
              )}
            </>
          )}
        </fieldset>

        <fieldset className="space-y-3 rounded-xl border border-line p-3">
          <legend className="px-1 text-sm font-semibold text-fg">Grade scale</legend>
          <CheckboxField
            label="Set the grade scale (otherwise each branch uses its default scale)"
            checked={useScale}
            onChange={(e) => setUseScale(e.target.checked)}
          />
          {useScale && (
            <>
              <TextField label="Scale name" value={scale.name} maxLength={60} onChange={(e) => patchScale({ name: e.target.value })} />
              <CheckboxField
                label="These bands still need confirming (each branch is asked to confirm them)"
                checked={scale.unconfirmed}
                onChange={(e) => patchScale({ unconfirmed: e.target.checked })}
              />
              <ul aria-label="Grade bands" className="space-y-2">
                {scale.bands.map((b, i) => (
                  <li key={i} className="grid grid-cols-[4rem_4rem_4rem_1fr_auto] items-end gap-2">
                    <TextField
                      label="From"
                      inputMode="decimal"
                      value={text(b.min)}
                      onChange={(e) => patchScale({ bands: scale.bands.map((x, j) => (j === i ? { ...x, min: num(e.target.value) } : x)) })}
                    />
                    <TextField
                      label="To"
                      inputMode="decimal"
                      value={text(b.max)}
                      onChange={(e) => patchScale({ bands: scale.bands.map((x, j) => (j === i ? { ...x, max: num(e.target.value) } : x)) })}
                    />
                    <TextField
                      label="Grade"
                      value={b.letter}
                      maxLength={4}
                      onChange={(e) => patchScale({ bands: scale.bands.map((x, j) => (j === i ? { ...x, letter: e.target.value } : x)) })}
                    />
                    <TextField
                      label="Remark"
                      value={b.remark}
                      maxLength={40}
                      onChange={(e) => patchScale({ bands: scale.bands.map((x, j) => (j === i ? { ...x, remark: e.target.value } : x)) })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={`Remove band ${i + 1}`}
                      onClick={() => patchScale({ bands: scale.bands.filter((_, j) => j !== i) })}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
              {scale.bands.length < 12 && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => patchScale({ bands: [...scale.bands, { min: 0, max: 0, letter: "", remark: "" }] })}
                >
                  Add a band
                </Button>
              )}
            </>
          )}
        </fieldset>

        <fieldset className="space-y-3 rounded-xl border border-line p-3">
          <legend className="px-1 text-sm font-semibold text-fg">Trait sections</legend>
          <p className="text-xs text-fg-muted">
            Each section lists traits a teacher rates for every pupil each term. A trait keeps its identity when you rename it, so ratings
            already entered stay with it; one you remove is hidden in the branches, never deleted.
          </p>
          {def.groups.map((g, gi) => (
            <div
              key={g.key}
              role="group"
              aria-label={`Section ${g.title || gi + 1}`}
              className="space-y-2 rounded-lg border border-line p-3"
            >
              <TextField
                label={`Section ${gi + 1} title`}
                value={g.title}
                maxLength={60}
                onChange={(e) =>
                  setDef((d) => ({ ...d, groups: d.groups.map((x, j) => (j === gi ? { ...x, title: e.target.value } : x)) }))
                }
              />
              <CheckboxField
                label="Add a SIGN column beside the rating"
                checked={g.showSign}
                onChange={(e) =>
                  setDef((d) => ({ ...d, groups: d.groups.map((x, j) => (j === gi ? { ...x, showSign: e.target.checked } : x)) }))
                }
              />
              <ul aria-label={`Traits of ${g.title || `section ${gi + 1}`}`} className="space-y-2">
                {g.traits.map((t, ti) => (
                  <li key={t.key} className="grid grid-cols-[1fr_auto] items-end gap-2">
                    <TextField
                      label={`Trait ${ti + 1}`}
                      value={t.name}
                      maxLength={60}
                      onChange={(e) =>
                        setDef((d) => ({
                          ...d,
                          groups: d.groups.map((x, j) =>
                            j === gi ? { ...x, traits: x.traits.map((y, k) => (k === ti ? { ...y, name: e.target.value } : y)) } : x,
                          ),
                        }))
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={`Remove trait ${ti + 1} of ${g.title || `section ${gi + 1}`}`}
                      onClick={() =>
                        setDef((d) => ({
                          ...d,
                          groups: d.groups.map((x, j) => (j === gi ? { ...x, traits: x.traits.filter((_, k) => k !== ti) } : x)),
                        }))
                      }
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                {g.traits.length < 30 && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      setDef((d) => ({
                        ...d,
                        groups: d.groups.map((x, j) =>
                          j === gi
                            ? {
                                ...x,
                                traits: [
                                  ...x.traits,
                                  { key: freshKey(`trait-${x.traits.length + 1}`, new Set(x.traits.map((y) => y.key))), name: "" },
                                ],
                              }
                            : x,
                        ),
                      }))
                    }
                  >
                    Add a trait
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setDef((d) => ({ ...d, groups: d.groups.filter((_, j) => j !== gi) }))}
                >
                  Remove this section
                </Button>
              </div>
            </div>
          ))}
          {def.groups.length < 8 && (
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                setDef((d) => ({
                  ...d,
                  groups: [
                    ...d.groups,
                    {
                      key: freshKey(`section-${d.groups.length + 1}`, takenGroupKeys()),
                      title: "",
                      showSign: false,
                      traits: [{ key: "trait-1", name: "" }],
                    },
                  ],
                }))
              }
            >
              Add a section
            </Button>
          )}
        </fieldset>

        {error && <Alert variant="error">{error}</Alert>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            {busy ? "Saving…" : template ? "Save a new version" : "Create template"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
