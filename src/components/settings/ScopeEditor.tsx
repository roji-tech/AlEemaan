"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import type { ApproverView, ClassGroupView, SectionView } from "@/lib/academics/approver-settings";
import { heldEntries, sameEntries, scopeEntries, wordsFor } from "@/lib/academics/approver-view";
import type { ScopeEntry } from "@/lib/academics/section-rules";

// Where one approver approves (task 0039): Everything (General), or any mix of sections and classes of the branch. A section the person holds but that is archived stays in the
// list, ticked and marked, so the screen explains the refusal (restore it first) instead of hiding it.
export function ScopeEditor({
  approver,
  sections,
  classGroups,
  busy,
  onSave,
  onCancel,
}: {
  approver: ApproverView;
  sections: readonly SectionView[];
  classGroups: readonly ClassGroupView[];
  busy: boolean;
  /// Called with the entries to save and the words for the confirmation dialog (what they would be).
  onSave: (entries: ScopeEntry[], toWords: string) => void;
  onCancel: () => void;
}) {
  const held = useMemo(() => heldEntries(approver.scopes), [approver.scopes]);
  const [general, setGeneral] = useState(held.some((entry) => entry.kind === "GENERAL"));
  const [sectionIds, setSectionIds] = useState<Set<string>>(new Set(held.flatMap((entry) => (entry.kind === "SECTION" ? [entry.sectionId] : []))));
  const [classIds, setClassIds] = useState<Set<string>>(new Set(held.flatMap((entry) => (entry.kind === "CLASS" ? [entry.classGroupId] : []))));

  const offeredSections = sections.filter((section) => !section.archived || sectionIds.has(section.id));
  const entries = scopeEntries(general, [...sectionIds], [...classIds]);
  const changed = !sameEntries(entries, held);

  const toggle = (set: Set<string>, setter: (next: Set<string>) => void, id: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(id);
    else next.delete(id);
    setter(next);
  };

  return (
    <div className="mt-4 space-y-4 rounded-xl border border-line bg-field/30 p-4">
      <CheckboxField
        label="Everything (General)"
        checked={general}
        onChange={(event) => {
          setGeneral(event.target.checked);
          if (event.target.checked) {
            setSectionIds(new Set());
            setClassIds(new Set());
          }
        }}
      />
      <p className="-mt-2 text-xs text-fg-muted">Every class in the branch. Ticking it takes the boxes below away, because it already covers them.</p>

      <fieldset disabled={general} className="min-w-0 space-y-1 disabled:opacity-60">
        <legend className="text-xs font-semibold tracking-wide text-fg-2 uppercase">Sections</legend>
        {offeredSections.length === 0 ? (
          <p className="text-xs text-fg-muted">There is no section this person can be given yet.</p>
        ) : (
          <ul className="grid gap-x-6 sm:grid-cols-2">
            {offeredSections.map((section) => (
              <li key={section.id}>
                <CheckboxField
                  label={`${section.name}${section.archived ? " (archived: restore it first)" : ""}`}
                  checked={sectionIds.has(section.id)}
                  onChange={(event) => toggle(sectionIds, setSectionIds, section.id, event.target.checked)}
                />
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <fieldset disabled={general} className="min-w-0 space-y-1 disabled:opacity-60">
        <legend className="text-xs font-semibold tracking-wide text-fg-2 uppercase">Classes</legend>
        {classGroups.length === 0 ? (
          <p className="text-xs text-fg-muted">There is no class this person can be given.</p>
        ) : (
          <ul className="grid gap-x-6 sm:grid-cols-2">
            {classGroups.map((group) => (
              <li key={group.id}>
                <CheckboxField label={group.name} checked={classIds.has(group.id)} onChange={(event) => toggle(classIds, setClassIds, group.id, event.target.checked)} />
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      {entries.length === 0 && <p className="text-xs text-fg-muted">With nothing ticked this person approves nothing, until you give them somewhere.</p>}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="button" variant="primary" onClick={() => onSave(entries, wordsFor(entries, sections, classGroups))} disabled={busy || !changed}>
          Review &amp; save
        </Button>
      </div>
    </div>
  );
}
