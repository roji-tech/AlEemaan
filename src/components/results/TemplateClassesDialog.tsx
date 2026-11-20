"use client";

import { useId, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { say } from "@/components/academics/common";
import { placeClasses } from "@/components/results/template-calls";
import { moveLines, type TemplateView, type TemplatesData } from "@/components/results/template-types";
import { idsInSection, rangeSelection } from "@/lib/results/templates-rules";

// "Add classes" to a template (task 0116): a checklist of every class of the branch in the list's order, with where each one is now, a range helper ("from Basic 1 to Basic 5") and "all of a
// section", so any pattern, in runs or scattered, is a few clicks. Classes that are in another template are marked and, if ticked, are shown as a move to confirm before anything changes.
export function TemplateClassesDialog({
  data,
  template,
  onClose,
  onDone,
}: {
  data: TemplatesData;
  template: TemplateView;
  onClose: () => void;
  onDone: (text: string) => void | Promise<void>;
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set(template.classGroupIds));
  const [from, setFrom] = useState(data.coverage[0]?.classGroupId ?? "");
  const [to, setTo] = useState(data.coverage[data.coverage.length - 1]?.classGroupId ?? "");
  const [moves, setMoves] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const legendId = useId();
  const ordered = data.coverage.map((c) => ({ id: c.classGroupId }));
  const sections = [...new Map(data.classes.filter((c) => c.sectionId).map((c) => [c.sectionId!, c.sectionName ?? "Section"])).entries()];
  const nameOf = (id: string) => data.coverage.find((c) => c.classGroupId === id)?.name ?? id;

  const add = (ids: readonly string[]) => setChecked((all) => new Set([...all, ...ids]));
  const toggle = (id: string, on: boolean) =>
    setChecked((all) => {
      const next = new Set(all);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  async function save(confirm: boolean) {
    setBusy(true);
    setError(null);
    const reply = await placeClasses(template.id, [...checked], confirm);
    setBusy(false);
    if (reply.ok) {
      const d = reply.data as { added: number; dropped: number } | undefined;
      const parts = [d?.added ? `${d.added} added` : "", d?.dropped ? `${d.dropped} back to the default` : ""].filter(Boolean);
      return void (await onDone(parts.length > 0 ? `${template.name}: ${parts.join(", ")}.` : `${template.name}: no change.`));
    }
    const lines = moveLines(reply);
    if (lines.length > 0) return setMoves(lines);
    setError(say(reply, "The classes could not be saved."));
  }

  const removed = template.classGroupIds.filter((id) => !checked.has(id));
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Classes of ${template.name}`}
      description="Tick the classes that use this template. A class can be in one template only; a class in none uses the default template. Marks already entered keep the structure they were entered under."
      wide
    >
      {moves ? (
        <div className="mt-4 space-y-4">
          <Alert variant="warning">Move these classes into {template.name}? They leave the template they are in now.</Alert>
          <ul aria-label="Classes that would move" className="divide-y divide-line rounded-xl border border-line text-sm">
            {moves.map((line) => (
              <li key={line} className="px-3 py-2 text-fg">
                {line}
              </li>
            ))}
          </ul>
          {error && <Alert variant="error">{error}</Alert>}
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="ghost" onClick={() => setMoves(null)}>
              Back
            </Button>
            <Button loading={busy} onClick={() => void save(true)}>
              Move and save
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface-2 p-3">
            <SelectField
              label="From class"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              options={data.coverage.map((c) => ({ value: c.classGroupId, label: c.name }))}
            />
            <SelectField
              label="To class"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              options={data.coverage.map((c) => ({ value: c.classGroupId, label: c.name }))}
            />
            <Button variant="secondary" onClick={() => add(rangeSelection(ordered, from, to))}>
              Select the range
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {sections.map(([id, name]) => (
              <Button key={id} variant="secondary" onClick={() => add(idsInSection(data.classes, id))}>
                Select all in {name}
              </Button>
            ))}
            <Button variant="ghost" onClick={() => setChecked(new Set(data.coverage.map((c) => c.classGroupId)))}>
              Select all
            </Button>
            <Button variant="ghost" onClick={() => setChecked(new Set())}>
              Clear
            </Button>
          </div>
          <fieldset aria-labelledby={legendId} className="max-h-80 overflow-y-auto rounded-xl border border-line px-3">
            <legend id={legendId} className="sr-only">
              Classes of {template.name}
            </legend>
            {data.coverage.length === 0 && <p className="py-3 text-sm text-fg-muted">This branch has no classes yet.</p>}
            {data.coverage.map((c) => {
              const elsewhere = c.explicit && c.templateId !== template.id ? c.templateName : null;
              return (
                <div
                  key={c.classGroupId}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-line last:border-b-0"
                >
                  <CheckboxField
                    label={c.name}
                    checked={checked.has(c.classGroupId)}
                    onChange={(e) => toggle(c.classGroupId, e.target.checked)}
                  />
                  <span className="text-xs text-fg-muted">
                    {elsewhere
                      ? `In ${elsewhere}${checked.has(c.classGroupId) ? " (will move)" : ""}`
                      : c.explicit
                        ? ""
                        : "Uses the default"}
                  </span>
                </div>
              );
            })}
          </fieldset>
          <p className="text-sm text-fg-muted" aria-live="polite">
            {checked.size} {checked.size === 1 ? "class" : "classes"} ticked
            {removed.length > 0 ? `. ${removed.map(nameOf).join(", ")} will go back to the default template.` : "."}
          </p>
          {error && <Alert variant="error">{error}</Alert>}
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button loading={busy} onClick={() => void save(false)}>
              Save classes
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
