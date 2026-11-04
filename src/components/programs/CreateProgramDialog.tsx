"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { TextField } from "@/components/ui/TextField";
import { problemFor, sendJson } from "@/components/auth/postJson";
import { say } from "@/components/academics/common";
import { DURATIONS } from "@/components/programs/model";

// Starting a program (a super admin's act). The server checks every field again; this form only collects them and shows what the server says.

type Branch = { id: string; name: string };
const MAX_LEVELS = 4;

export function CreateProgramDialog({ open, onClose, branches }: { open: boolean; onClose: () => void; branches: Branch[] }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New program"
      description="A program is learning that is not a normal class. You can change almost everything later."
      wide
    >
      {open && <Body branches={branches} onClose={onClose} />}
    </Dialog>
  );
}

function Body({ branches, onClose }: { branches: Branch[]; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<"ONGOING" | "FIXED_TERM">("ONGOING");
  const [startsOn, setStartsOn] = useState("");
  const [length, setLength] = useState<string>(DURATIONS[0].value);
  const [endsOn, setEndsOn] = useState("");
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [ownBranch, setOwnBranch] = useState(false);
  const [ownBranchName, setOwnBranchName] = useState("");
  const [labels, setLabels] = useState<string[]>(["Class"]);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const toggleBranch = (id: string, on: boolean) => setBranchIds(on ? [...branchIds, id] : branchIds.filter((x) => x !== id));
  const setLabel = (index: number, value: string) => setLabels(labels.map((label, i) => (i === index ? value : label)));

  async function save(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setMessage(null);
    setFields({});
    setPending(true);
    const body: Record<string, unknown> = {
      name,
      description: description.trim() || null,
      kind,
      branchIds,
      ownBranch: ownBranch ? { name: ownBranchName.trim() || name } : null,
      levelLabels: labels,
    };
    if (startsOn) body.startsOn = startsOn;
    if (kind === "FIXED_TERM") {
      if (length === "END") body.endsOn = endsOn;
      else body.duration = DURATIONS.find((d) => d.value === length)?.duration;
    }
    const reply = await sendJson("/api/v1/programs", "POST", body);
    setPending(false);
    if (!reply.ok) {
      const found: Record<string, string> = {};
      for (const field of ["name", "description", "startsOn", "endsOn", "duration", "branchIds", "ownBranch.name", "levelLabels"]) {
        const text = problemFor(reply, field);
        if (text) found[field] = text;
      }
      setFields(found);
      setMessage(Object.keys(found).length > 0 ? "Please check the fields marked below." : say(reply, "The program couldn't be created."));
      return;
    }
    onClose();
    router.push(`/programs/${(reply.data as { id: string }).id}`);
  }

  return (
    <form onSubmit={save} className="mt-5 space-y-5" noValidate>
      {message && <Alert variant="error">{message}</Alert>}

      <TextField label="Program name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required error={fields.name} />
      <TextAreaField
        label="What it is (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={500}
        rows={2}
        error={fields.description}
      />

      <fieldset className="space-y-3">
        <legend className="mb-1.5 block text-xs font-semibold tracking-wide text-fg-2 uppercase">How long it runs</legend>
        <p className="text-sm text-fg-muted">
          A memorisation program that keeps going never ends; a course of 6 months or 3 years runs for a set period.
        </p>
        <SelectField
          label="Kind"
          hideLabel
          value={kind}
          onChange={(e) => setKind(e.target.value as "ONGOING" | "FIXED_TERM")}
          options={[
            { value: "ONGOING", label: "Never ends" },
            { value: "FIXED_TERM", label: "For a set period" },
          ]}
        />
        <TextField
          label={kind === "FIXED_TERM" ? "Starts on" : "Starts on (optional)"}
          type="date"
          value={startsOn}
          onChange={(e) => setStartsOn(e.target.value)}
          error={fields.startsOn}
        />
        {kind === "FIXED_TERM" && (
          <>
            <SelectField
              label="Runs for"
              value={length}
              onChange={(e) => setLength(e.target.value)}
              options={[...DURATIONS.map((d) => ({ value: d.value, label: d.label })), { value: "END", label: "Until a date I choose" }]}
              error={fields.duration}
            />
            {length === "END" && (
              <TextField
                label="Ends on (the last day)"
                type="date"
                value={endsOn}
                onChange={(e) => setEndsOn(e.target.value)}
                error={fields.endsOn}
              />
            )}
          </>
        )}
      </fieldset>

      <fieldset className="space-y-1">
        <legend className="mb-1.5 block text-xs font-semibold tracking-wide text-fg-2 uppercase">Where it runs</legend>
        {branches.map((branch) => (
          <CheckboxField
            key={branch.id}
            label={branch.name}
            checked={branchIds.includes(branch.id)}
            onChange={(e) => toggleBranch(branch.id, e.target.checked)}
          />
        ))}
        <CheckboxField label="Give it a branch of its own" checked={ownBranch} onChange={(e) => setOwnBranch(e.target.checked)} />
        {ownBranch && (
          <TextField
            label="Name of its own branch"
            value={ownBranchName}
            onChange={(e) => setOwnBranchName(e.target.value)}
            placeholder={name || "For example Daarul-Hadeeth"}
            maxLength={100}
            error={fields["ownBranch.name"]}
          />
        )}
        {fields.branchIds && (
          <p role="alert" className="text-sm text-danger-fg">
            {fields.branchIds}
          </p>
        )}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-1.5 block text-xs font-semibold tracking-wide text-fg-2 uppercase">Names of its levels, top first</legend>
        <p className="text-sm text-fg-muted">For example Section, Class, Category, or Juz, Group. You can change these later.</p>
        {labels.map((label, index) => (
          <div key={index} className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <TextField label={`Level ${index + 1}`} value={label} onChange={(e) => setLabel(index, e.target.value)} maxLength={40} />
            </div>
            {labels.length > 1 && (
              <Button
                variant="ghost"
                aria-label={`Remove level ${index + 1}`}
                onClick={() => setLabels(labels.filter((_, i) => i !== index))}
              >
                Remove
              </Button>
            )}
          </div>
        ))}
        {labels.length < MAX_LEVELS && (
          <Button variant="secondary" onClick={() => setLabels([...labels, ""])}>
            Add a level
          </Button>
        )}
        {fields.levelLabels && (
          <p role="alert" className="text-sm text-danger-fg">
            {fields.levelLabels}
          </p>
        )}
      </fieldset>

      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          Create program
        </Button>
      </div>
    </form>
  );
}
