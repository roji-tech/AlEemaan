"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { getJson, sendJson } from "@/components/auth/postJson";
import { say } from "@/components/academics/common";
import { setClassTemplate } from "@/components/results/template-calls";
import { moveLines, type TemplatesData } from "@/components/results/template-types";

// "Result template" of one class, from the Classes tab (task 0116): the same placement as Results > Templates, for one class in one step. Moving it out of another template shows what leaves
// before it is saved. Presentation only; the template API decides.
export function ClassTemplateDialog({
  branchId,
  classGroup,
  onClose,
  onDone,
}: {
  branchId: string;
  classGroup: { id: string; name: string };
  onClose: () => void;
  onDone: (text: string) => void | Promise<void>;
}) {
  const [data, setData] = useState<TemplatesData | null>(null);
  const [value, setValue] = useState("");
  // The class's OWN grade scale ("" = follow the template, then the branch default) and what it was when the dialog opened.
  const [scaleValue, setScaleValue] = useState("");
  const [scaleWas, setScaleWas] = useState("");
  const [moves, setMoves] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void getJson(`/api/v1/results/templates?branchId=${encodeURIComponent(branchId)}`).then((reply) => {
      if (!live) return;
      if (!reply.ok) return setError(say(reply, "Couldn't load the templates."));
      const d = reply.data as unknown as TemplatesData;
      setData(d);
      const row = d.coverage.find((c) => c.classGroupId === classGroup.id);
      setValue(row?.explicit && row.templateId ? row.templateId : "");
      setScaleValue(row?.classScaleId ?? "");
      setScaleWas(row?.classScaleId ?? "");
    });
    return () => {
      live = false;
    };
  }, [branchId, classGroup.id]);

  const live = (data?.templates ?? []).filter((t) => !t.archived);
  const defaultName = live.find((t) => t.isDefault)?.name;

  async function save(confirm: boolean) {
    if (!data) return;
    setBusy(true);
    setError(null);
    const reply = await setClassTemplate(data, classGroup.id, value === "" ? null : value, confirm);
    if (!reply.ok) {
      setBusy(false);
      const lines = moveLines(reply);
      if (lines.length > 0) return setMoves(lines);
      return setError(say(reply, "That didn't work."));
    }
    // The grade scale (task 0116): its own scale for the class, or back to the template's. Saved after the template so the first can be confirmed on its own.
    if (scaleValue !== scaleWas) {
      const scale = await sendJson("/api/v1/results/templates/class-scale", "PUT", {
        branchId,
        classGroupId: classGroup.id,
        gradeScaleId: scaleValue === "" ? null : scaleValue,
      });
      if (!scale.ok) {
        setBusy(false);
        setScaleWas(scaleWas);
        return setError(say(scale, "The grade scale could not be saved."));
      }
    }
    setBusy(false);
    const template =
      value === "" ? `${classGroup.name} uses the default template.` : `${classGroup.name} uses ${live.find((t) => t.id === value)?.name}.`;
    return void (await onDone(
      scaleValue !== scaleWas ? `${template} Its grade scale is ${scaleValue === "" ? "its template's" : "its own"}.` : template,
    ));
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Result template of ${classGroup.name}`}
      description="The look of the report card, the marks structure and the grade scale come from the template. Marks already entered keep the structure they were entered under."
    >
      <div className="mt-4 space-y-4">
        {data === null && !error && (
          <p className="text-sm text-fg-muted" aria-busy="true">
            Loading…
          </p>
        )}
        {data && !moves && (
          <SelectField
            label="Result template"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            options={[
              { value: "", label: `Uses the default${defaultName ? ` (${defaultName})` : ""}` },
              ...live.map((t) => ({ value: t.id, label: t.name })),
            ]}
            hint="Add or change templates in Results > Templates."
          />
        )}
        {data && !moves && (
          <SelectField
            label="Grade scale"
            value={scaleValue}
            onChange={(e) => setScaleValue(e.target.value)}
            options={[
              { value: "", label: "Its template's scale, else the branch default" },
              ...data.choices.scales.map((s) => ({ value: s.id, label: `${s.name}${s.isDefault ? " (branch default)" : ""}` })),
            ]}
            hint="Marks already entered keep the letters they were given. Edit scales in Results > Templates."
          />
        )}
        {moves && (
          <>
            <Alert variant="warning">Moving {classGroup.name} takes it out of the template it is in now.</Alert>
            <ul aria-label="Classes that would move" className="divide-y divide-line rounded-xl border border-line text-sm">
              {moves.map((line) => (
                <li key={line} className="px-3 py-2 text-fg">
                  {line}
                </li>
              ))}
            </ul>
          </>
        )}
        {error && <Alert variant="error">{error}</Alert>}
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="ghost" onClick={moves ? () => setMoves(null) : onClose}>
            {moves ? "Back" : "Cancel"}
          </Button>
          <Button loading={busy} disabled={!data} onClick={() => void save(moves !== null)}>
            {moves ? "Move and save" : "Save"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
