"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { Pill } from "@/components/academics/StaffDetails";
import { getJson, sendJson } from "@/components/auth/postJson";
import { say } from "@/components/academics/common";
import { ADD_RESULT_TEXT, MAX_TAGS, type AddResult } from "@/lib/academics/subject-catalog-rules";

// The dialogs of the shared subject catalogue (task 0119). Presentation only: the catalogue API decides who may do what (a superadmin for the catalogue itself, the administrator of a branch for
// taking subjects into that branch) and every refusal comes back in words.

export type CatalogEntry = {
  id: string;
  name: string;
  code: string | null;
  tags: string[];
  archivedAt: string | null;
  branches: { branchId: string; branchName: string; subjectId: string; live: boolean; classes: number }[];
  liveBranches: number;
};
type Available = { id: string; name: string; code: string | null; tags: string[]; linksExisting: boolean };

/// Tags are labels: small neutral chips, nothing more.
export function TagChips({ tags }: { tags: readonly string[] | undefined }) {
  if (!tags || tags.length === 0) return null;
  return (
    <span role="group" aria-label="Tags" className="inline-flex flex-wrap items-center gap-1.5">
      {tags.map((t) => (
        <Pill key={t} tone="neutral">
          {t}
        </Pill>
      ))}
    </span>
  );
}

const tagOptions = (lists: readonly (readonly string[])[]) => {
  const all = [...new Set(lists.flat())].sort((a, b) => a.localeCompare(b));
  return [{ value: "", label: "All tags" }, ...all.map((t) => ({ value: t, label: t }))];
};

/// "Added 3, linked 1 …" for the notice after a request.
export function summarise(results: readonly { result: AddResult; name?: string | null }[]): string {
  const count = (r: AddResult) => results.filter((x) => x.result === r).length;
  const parts = [
    count("added") > 0 ? `added ${count("added")}` : "",
    count("linked") > 0 ? `linked ${count("linked")} that the branch already had` : "",
    count("already") > 0 ? `${count("already")} already there` : "",
  ].filter(Boolean);
  const clashes = results.filter((x) => x.result === "clash").map((x) => x.name ?? "a subject");
  const text = parts.length > 0 ? `${parts[0]!.charAt(0).toUpperCase()}${parts.join(", ").slice(1)}.` : "Nothing was added.";
  return clashes.length > 0 ? `${text} Not added (${ADD_RESULT_TEXT.clash.toLowerCase()}): ${clashes.join(", ")}.` : text;
}

/// A branch administrator takes subjects from the school's catalogue (those the branch does not have yet), one by one or all that carry a tag.
export function AddFromCatalogDialog({
  open,
  branchId,
  branchName,
  onClose,
  onDone,
}: {
  open: boolean;
  branchId: string;
  branchName: string;
  onClose: () => void;
  onDone: (text: string) => void | Promise<void>;
}) {
  const [entries, setEntries] = useState<Available[] | null>(null);
  const [tag, setTag] = useState("");
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!open) return;
    let live = true;
    void getJson(`/api/v1/subject-catalog/available?branchId=${encodeURIComponent(branchId)}`).then((reply) => {
      if (!live) return;
      if (!reply.ok) return setProblem(say(reply, "Couldn't load the catalogue."));
      setEntries(reply.data!.entries as Available[]);
    });
    return () => {
      live = false;
    };
  }, [open, branchId]);
  const shown = useMemo(() => (entries ?? []).filter((e) => tag === "" || e.tags.includes(tag)), [entries, tag]);
  const allShownChosen = shown.length > 0 && shown.every((e) => chosen.has(e.id));
  const toggle = (id: string, on: boolean) =>
    setChosen((all) => {
      const next = new Set(all);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || chosen.size === 0) return;
    setProblem(null);
    setPending(true);
    const reply = await sendJson("/api/v1/academics/subjects/from-catalog", "POST", { branchId, catalogIds: [...chosen] });
    setPending(false);
    if (!reply.ok) return setProblem(say(reply, "That didn't work."));
    const results = reply.data!.results as { result: AddResult; name: string | null }[];
    await onDone(summarise(results));
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add from the school's subject catalogue"
      description={`Subjects the school keeps once, for ${branchName} to take. A subject this branch already has with the same name is linked, not duplicated.`}
    >
      <form onSubmit={submit} noValidate className="mt-4 space-y-3">
        {entries === null && !problem ? (
          <p className="text-sm text-fg-muted">Loading the catalogue…</p>
        ) : entries !== null && entries.length === 0 ? (
          <p className="text-sm text-fg-muted">This branch already has every subject in the catalogue.</p>
        ) : (
          entries !== null && (
            <>
              <SelectField
                label="Tag"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                options={tagOptions(entries.map((e) => e.tags))}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-fg-muted" aria-live="polite">
                  {chosen.size} chosen · {shown.length} shown
                </p>
                <Button
                  variant="secondary"
                  onClick={() =>
                    setChosen((all) => {
                      const next = new Set(all);
                      for (const e of shown) {
                        if (allShownChosen) next.delete(e.id);
                        else next.add(e.id);
                      }
                      return next;
                    })
                  }
                >
                  {allShownChosen ? "Clear the ones shown" : tag ? `Choose all tagged ${tag}` : "Choose all shown"}
                </Button>
              </div>
              <fieldset className="max-h-80 space-y-1 overflow-y-auto">
                <legend className="text-xs font-semibold tracking-wide text-fg-2 uppercase">Subjects in the catalogue</legend>
                {shown.map((e) => (
                  <div key={e.id} className="flex flex-wrap items-center gap-x-3">
                    <CheckboxField
                      label={`${e.name}${e.code ? ` (${e.code})` : ""}${e.linksExisting ? " - links the one it has" : ""}`}
                      checked={chosen.has(e.id)}
                      onChange={(ev) => toggle(e.id, ev.target.checked)}
                      disabled={pending}
                    />
                    <TagChips tags={e.tags} />
                  </div>
                ))}
              </fieldset>
            </>
          )
        )}
        {problem && <Alert variant="error">{problem}</Alert>}
        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" loading={pending} disabled={chosen.size === 0}>
            {pending ? "Working…" : `Add ${chosen.size === 0 ? "" : chosen.size + " "}to ${branchName}`}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/// A superadmin makes or edits one catalogue entry: name, code and tags (typed with commas between them). Renaming offers to rename it in every branch that has it.
export function CatalogEntryDialog({
  entry,
  open,
  onClose,
  onDone,
}: {
  entry: CatalogEntry | null;
  open: boolean;
  onClose: () => void;
  onDone: (text: string) => void | Promise<void>;
}) {
  const [name, setName] = useState(entry?.name ?? "");
  const [code, setCode] = useState(entry?.code ?? "");
  const [tags, setTags] = useState((entry?.tags ?? []).join(", "));
  const [everywhere, setEverywhere] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const renamed = entry !== null && name.trim() !== entry.name;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setProblem(null);
    setPending(true);
    const body = {
      name,
      code: code.trim() === "" ? null : code,
      tags: tags
        .split(/[,;]/)
        .map((t) => t.trim())
        .filter(Boolean),
    };
    const reply = entry
      ? await sendJson(`/api/v1/subject-catalog/${entry.id}`, "PATCH", {
          ...body,
          ...(renamed && everywhere ? { renameInBranches: true } : {}),
        })
      : await sendJson("/api/v1/subject-catalog", "POST", body);
    setPending(false);
    if (!reply.ok) return setProblem(say(reply, "That didn't work."));
    const inBranches = Number((reply.data?.entry as { renamedInBranches?: number } | undefined)?.renamedInBranches ?? 0);
    await onDone(
      entry
        ? `${name.trim()} saved${inBranches > 0 ? ` and renamed in ${inBranches} ${inBranches === 1 ? "branch" : "branches"}` : ""}.`
        : `${name.trim()} added to the catalogue.`,
    );
  }
  return (
    <Dialog open={open} onClose={onClose} title={entry ? `Edit ${entry.name}` : "New catalogue subject"}>
      <form onSubmit={submit} noValidate className="mt-4 space-y-4">
        <TextField label="Subject name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} disabled={pending} required />
        <TextField
          label="Code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={12}
          hint="Up to 12 letters, numbers, dots, dashes or underscores. May be left empty."
          disabled={pending}
        />
        <TextField
          label="Tags"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          hint={`Labels with commas between them (core, basic, arabic). Up to ${MAX_TAGS}; letters, numbers, spaces and dashes. They only group subjects: they change no access and no result.`}
          disabled={pending}
        />
        {renamed && entry.liveBranches > 0 && (
          <CheckboxField
            label={`Also rename it in the ${entry.liveBranches} ${entry.liveBranches === 1 ? "branch that has" : "branches that have"} it`}
            checked={everywhere}
            onChange={(e) => setEverywhere(e.target.checked)}
            disabled={pending}
          />
        )}
        {problem && <Alert variant="error">{problem}</Alert>}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" loading={pending}>
            {pending ? "Working…" : entry ? "Save" : "Add subject"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/// A superadmin puts the chosen catalogue subjects into several branches at once. One request per subject; each branch is reported on its own, so a clash in one does not stop the rest.
export function AddToBranchesDialog({
  entries,
  branches,
  onClose,
  onDone,
}: {
  entries: readonly CatalogEntry[];
  branches: readonly { id: string; name: string }[];
  onClose: () => void;
  onDone: (text: string) => void | Promise<void>;
}) {
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const all = branches.length > 0 && chosen.size === branches.length;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || chosen.size === 0) return;
    setProblem(null);
    setPending(true);
    const results: { result: AddResult; name: string }[] = [];
    for (const entry of entries) {
      const reply = await sendJson(`/api/v1/subject-catalog/${entry.id}/branches`, "POST", { branchIds: [...chosen] });
      if (!reply.ok) {
        setPending(false);
        setProblem(`${entry.name}: ${say(reply, "That didn't work.")}${results.length > 0 ? " The ones before it were done." : ""}`);
        return;
      }
      for (const r of reply.data!.results as { result: AddResult; branchName: string | null }[])
        results.push({ result: r.result, name: `${entry.name} in ${r.branchName ?? "an unknown branch"}` });
    }
    setPending(false);
    await onDone(summarise(results));
  }
  const what = entries.length === 1 ? entries[0]!.name : `${entries.length} subjects`;
  return (
    <Dialog
      open={entries.length > 0}
      onClose={onClose}
      title={`Add ${what} to branches`}
      description="Each branch gets its own subject, linked to the catalogue. A branch that already has one of that name is linked, not duplicated."
    >
      <form onSubmit={submit} noValidate className="mt-4 space-y-3">
        <fieldset className="max-h-72 space-y-1 overflow-y-auto">
          <legend className="text-xs font-semibold tracking-wide text-fg-2 uppercase">Branches</legend>
          <CheckboxField
            label="All branches"
            checked={all}
            onChange={(e) => setChosen(e.target.checked ? new Set(branches.map((b) => b.id)) : new Set())}
            disabled={pending}
          />
          {branches.map((b) => (
            <CheckboxField
              key={b.id}
              label={b.name}
              checked={chosen.has(b.id)}
              onChange={(e) =>
                setChosen((set) => {
                  const next = new Set(set);
                  if (e.target.checked) next.add(b.id);
                  else next.delete(b.id);
                  return next;
                })
              }
              disabled={pending}
            />
          ))}
        </fieldset>
        {problem && <Alert variant="error">{problem}</Alert>}
        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" loading={pending} disabled={chosen.size === 0}>
            {pending
              ? "Working…"
              : `Add to ${chosen.size === 0 ? "branches" : `${chosen.size} ${chosen.size === 1 ? "branch" : "branches"}`}`}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
