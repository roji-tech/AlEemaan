"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { useNotice } from "@/components/ui/Toaster";
import { getJson, problemFor, sendJson, type Reply } from "@/components/auth/postJson";
import { say } from "@/components/academics/common";
import {
  PROFILE_FIELDS,
  PROFILE_LABELS,
  cardPreview,
  mergeProfile,
  setValue,
  type ProfileField,
  type ProfileValues,
} from "@/lib/settings/branch-profile-rules";
import { useBranchSelection } from "@/components/ui/useBranchSelection";

// School details per branch (task 0115, task 0101 D4): the principal, phone, motto, address, e-mail and website one branch prints. A field left empty uses the school's; a field with a
// value is the branch's own, and "Use the school's" takes it back. Presentation only: the API decides who may read and change which branch, and checks every field again.

type Draft = Record<ProfileField, string>;
type Loaded = { school: ProfileValues; branch: ProfileValues };

const toDraft = (values: ProfileValues): Draft => Object.fromEntries(PROFILE_FIELDS.map((f) => [f, values[f] ?? ""])) as Draft;
const INPUT_TYPE: Partial<Record<ProfileField, "email" | "url">> = { email: "email", website: "url" };
const MAX: Record<ProfileField, number> = { principal: 120, phone: 40, motto: 200, address: 300, email: 254, website: 2048 };
const INFO: Partial<Record<ProfileField, "settings.principal" | "settings.motto">> = {
  principal: "settings.principal",
  motto: "settings.motto",
};

/// One branch's details: loads them, edits them, saves only what changed. Give it a `key` of the branch id so a different branch starts clean.
export function BranchProfileEditor({ branchId, branchName }: { branchId: string; branchName: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<Reply | null>(null);
  const [notice, setNotice] = useNotice();
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    const reply = await getJson(`/api/v1/settings/branch-profile?branchId=${encodeURIComponent(branchId)}`);
    if (!reply.ok) return setError(say(reply, "Couldn't load these details."));
    setError(null);
    const data = reply.data as unknown as Loaded;
    setLoaded({ school: data.school, branch: data.branch });
    setDraft(toDraft(data.branch));
  }, [branchId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading on mount is exactly what this effect is for
    void load();
  }, [load]);

  if (!loaded || !draft) {
    return error ? (
      <Alert variant="error">{error}</Alert>
    ) : (
      <p className="text-sm text-fg-muted" aria-busy="true">
        Loading…
      </p>
    );
  }

  const changed = PROFILE_FIELDS.filter((f) => (setValue(draft[f]) ?? "") !== (loaded.branch[f] ?? ""));
  const shown = mergeProfile(loaded.school, Object.fromEntries(PROFILE_FIELDS.map((f) => [f, draft[f]])));

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || changed.length === 0 || !draft) return;
    setPending(true);
    setNotice(null);
    setProblems(null);
    const reply = await sendJson("/api/v1/settings/branch-profile", "PATCH", {
      branchId,
      ...Object.fromEntries(changed.map((f) => [f, setValue(draft[f])])),
    });
    setPending(false);
    if (!reply.ok) {
      setProblems(reply);
      return setNotice({ variant: "error", text: say(reply, "That didn't work.") });
    }
    const data = reply.data as unknown as Loaded;
    setLoaded({ school: data.school, branch: data.branch });
    setDraft(toDraft(data.branch));
    setNotice({ variant: "success", text: `Saved. ${branchName}'s report cards now show these details.` });
  }

  const field = (f: ProfileField) => {
    const empty = draft[f].trim() === "";
    return (
      <div key={f}>
        <TextField
          label={PROFILE_LABELS[f]}
          info={INFO[f]}
          type={INPUT_TYPE[f] ?? "text"}
          value={draft[f]}
          maxLength={MAX[f]}
          onChange={(e) => setDraft({ ...draft, [f]: e.target.value })}
          hint={empty ? `Using the school's: ${loaded.school[f] ?? "nothing is set"}` : undefined}
          error={problems ? problemFor(problems, f) : undefined}
        />
        {!empty && (
          <Button
            type="button"
            variant="ghost"
            className="mt-1"
            aria-label={`Use the school's ${PROFILE_LABELS[f]}`}
            onClick={() => setDraft({ ...draft, [f]: "" })}
          >
            Use the school&apos;s
          </Button>
        )}
      </div>
    );
  };

  return (
    <form onSubmit={save} className="space-y-4" noValidate aria-label={`Details for ${branchName}`}>
      <div aria-live="polite" className="empty:hidden">
        {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {field("principal")}
        {field("phone")}
      </div>
      {field("motto")}
      {field("address")}
      <div className="grid gap-4 sm:grid-cols-2">
        {field("email")}
        {field("website")}
      </div>
      <p className="text-sm text-fg-muted">
        Report cards for <strong className="font-semibold text-fg">{branchName}</strong> will show: {cardPreview(shown.values)}.
      </p>
      <Button type="submit" loading={pending} disabled={changed.length === 0}>
        {pending ? "Saving…" : "Save details"}
      </Button>
    </form>
  );
}

/// The card for an administrator's page (Approvals > Report cards, next to the branch's layout): the branches they administer to choose from, then the editor.
export function BranchProfilePanel({ branches }: { branches: { id: string; name: string }[] }) {
  const [branchId, setBranchId] = useBranchSelection(branches);
  const branch = branches.find((b) => b.id === branchId) ?? branches[0];
  if (!branch) return null;
  return (
    <Card className="max-w-3xl space-y-4" aria-labelledby="branch-profile-heading">
      <div>
        <h2 id="branch-profile-heading" className="text-lg font-bold text-fg">
          Details printed on {branch.name}&apos;s report cards
        </h2>
        <p className="mt-1 text-sm text-fg-muted">
          The principal, motto, address and phone in the card&apos;s header. Leave a field empty to use the school&apos;s.
        </p>
      </div>
      {branches.length > 1 && (
        <SelectField
          label="Show details for"
          value={branch.id}
          onChange={(e) => setBranchId(e.target.value)}
          options={branches.map((b) => ({ value: b.id, label: b.name }))}
        />
      )}
      <BranchProfileEditor key={branch.id} branchId={branch.id} branchName={branch.name} />
    </Card>
  );
}
