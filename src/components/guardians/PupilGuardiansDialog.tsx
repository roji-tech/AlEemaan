"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { TONE } from "@/components/ui/tone";
import { GENERIC_ERROR, getJson, problemFor, sendJson } from "@/components/auth/postJson";
import {
  RELATIONSHIP_OPTIONS,
  blockedText,
  codeText,
  relationshipLabel,
  type GuardianMatch,
  type PupilGuardian,
  type Relationship,
} from "./model";

// A pupil's guardians (task 0113 D9), from the pupil's Actions list: every guardian of the child with the relationship and the main contact, Allowed or Blocked; make one the main contact,
// change the relationship, block (with a reason) or unblock, unlink; add a guardian found by whole phone or e-mail among those the administrator may see, or a new one. The API decides
// every answer; this draws it.

function Chip({ tone, children }: { tone: keyof typeof TONE; children: React.ReactNode }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${TONE[tone].chip}`}>{children}</span>
  );
}

const REL_CHOICES = [{ value: "", label: "Not said" }, ...RELATIONSHIP_OPTIONS];

export function PupilGuardiansDialog({
  pupil,
  onClose,
  onChanged,
}: {
  pupil: { id: string; name: string } | null;
  onClose: () => void;
  onChanged: (text: string) => void;
}) {
  const [guardians, setGuardians] = useState<PupilGuardian[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<{ id: string; reason: string; problem?: string } | null>(null);
  // Adding: find by phone or e-mail first; then link a match, or make a new guardian.
  const [contact, setContact] = useState("");
  const [matches, setMatches] = useState<GuardianMatch[] | null>(null);
  const [relationship, setRelationship] = useState("");
  const [fresh, setFresh] = useState<{ name: string; phone: string; email: string } | null>(null);
  const [freshProblems, setFreshProblems] = useState<Record<string, string | undefined>>({});

  const load = useCallback(async (id: string) => {
    const reply = await getJson(`/api/v1/students/${id}/guardians`);
    if (reply.ok) {
      setGuardians(reply.data!.guardians as PupilGuardian[]);
      setError(null);
    } else setError(reply.message ?? GENERIC_ERROR);
  }, []);

  useEffect(() => {
    if (!pupil) return;
    /* eslint-disable react-hooks/set-state-in-effect -- a newly opened pupil starts from a clean dialog */
    setGuardians(null);
    setError(null);
    setBlocking(null);
    setContact("");
    setMatches(null);
    setFresh(null);
    setRelationship("");
    /* eslint-enable react-hooks/set-state-in-effect */
    void load(pupil.id);
  }, [pupil, load]);

  if (!pupil)
    return (
      <Dialog open={false} onClose={onClose} title="Guardians">
        {null}
      </Dialog>
    );

  const linkPath = (guardianId: string) => `/api/v1/guardians/${guardianId}/children/${pupil.id}`;

  async function change(g: PupilGuardian, body: Record<string, unknown>, text: string) {
    setBusy(g.guardianId);
    const reply = await sendJson(linkPath(g.guardianId), "PATCH", body);
    setBusy(null);
    if (!reply.ok) return setError(reply.message ?? GENERIC_ERROR);
    await load(pupil!.id);
    onChanged(text);
  }

  async function unlink(g: PupilGuardian) {
    setBusy(g.guardianId);
    const reply = await sendJson(linkPath(g.guardianId), "DELETE");
    setBusy(null);
    if (!reply.ok) return setError(reply.message ?? GENERIC_ERROR);
    await load(pupil!.id);
    onChanged(`${g.name} is no longer a guardian of ${pupil!.name}.`);
  }

  async function block(event: FormEvent) {
    event.preventDefault();
    if (!blocking) return;
    const g = guardians?.find((x) => x.guardianId === blocking.id);
    if (!g) return;
    if (blocking.reason.trim().length < 3) return setBlocking({ ...blocking, problem: "Say why this guardian is blocked." });
    setBusy(g.guardianId);
    const reply = await sendJson(linkPath(g.guardianId), "PATCH", { blocked: true, reason: blocking.reason.trim() });
    setBusy(null);
    if (!reply.ok) return setBlocking({ ...blocking, problem: problemFor(reply, "reason") ?? reply.message ?? GENERIC_ERROR });
    setBlocking(null);
    await load(pupil!.id);
    onChanged(`${g.name} is blocked from ${pupil!.name}.`);
  }

  async function find(event: FormEvent) {
    event.preventDefault();
    if (contact.trim().length < 3) return;
    setBusy("find");
    const reply = await getJson(`/api/v1/guardians/match?contact=${encodeURIComponent(contact.trim())}`);
    setBusy(null);
    if (!reply.ok) return setError(reply.message ?? GENERIC_ERROR);
    const found = reply.data!.guardians as GuardianMatch[];
    setMatches(found);
    // Nothing found: start a new guardian with what was typed.
    if (found.length === 0)
      setFresh({ name: "", phone: contact.includes("@") ? "" : contact.trim(), email: contact.includes("@") ? contact.trim() : "" });
  }

  async function link(body: Record<string, unknown>, who: string) {
    setBusy("link");
    const reply = await sendJson(`/api/v1/students/${pupil!.id}/guardians`, "POST", {
      ...body,
      relationship: (relationship || null) as Relationship | null,
    });
    setBusy(null);
    if (!reply.ok) {
      setFreshProblems({ name: problemFor(reply, "name"), phone: problemFor(reply, "phone"), email: problemFor(reply, "email") });
      return setError(reply.message ?? GENERIC_ERROR);
    }
    setGuardians(reply.data!.guardians as PupilGuardian[]);
    setContact("");
    setMatches(null);
    setFresh(null);
    setRelationship("");
    setError(null);
    onChanged(`${who} is now a guardian of ${pupil!.name}.`);
  }

  return (
    <Dialog open onClose={onClose} title={`Guardians of ${pupil.name}`} wide>
      <div className="space-y-6">
        {error && <Alert variant="error">{error}</Alert>}
        <section aria-labelledby="pupil-guardians" className="space-y-2">
          <h3 id="pupil-guardians" className="text-sm font-semibold text-fg">
            Guardians
          </h3>
          {guardians === null ? (
            <p className="text-sm text-fg-muted">Loading…</p>
          ) : guardians.length === 0 ? (
            <p className="text-sm text-fg-muted">No guardian yet. Add one below.</p>
          ) : (
            <ul aria-label={`Guardians of ${pupil.name}`} className="divide-y divide-line">
              {guardians.map((g) => (
                <li key={g.guardianId} className="space-y-2 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold wrap-break-word text-fg">{g.name}</p>
                      <p className="text-sm break-all text-fg-muted">
                        {[g.phone, g.email].filter(Boolean).join(" · ") || "No phone or email"}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {relationshipLabel(g.relationship) && <Chip tone="neutral">{relationshipLabel(g.relationship)}</Chip>}
                        {g.isMain && <Chip tone="brand">Main contact</Chip>}
                        {g.blocked ? <Chip tone="danger">Blocked</Chip> : <Chip tone="ok">Allowed</Chip>}
                        <Chip tone={g.codeAt ? "ok" : "warn"}>{codeText(g.codeAt)}</Chip>
                        {g.otherChildren > 0 && (
                          <Chip tone="neutral">
                            {g.otherChildren} other {g.otherChildren === 1 ? "child" : "children"}
                          </Chip>
                        )}
                      </div>
                      {g.blocked && <p className="mt-1 text-xs text-fg-muted">{blockedText(g.blocked)}</p>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {!g.isMain && (
                        <Button
                          variant="secondary"
                          disabled={busy !== null}
                          onClick={() => void change(g, { isMain: true }, `${g.name} is now the main contact for ${pupil.name}.`)}
                        >
                          Make main contact
                        </Button>
                      )}
                      {g.blocked ? (
                        <Button
                          variant="secondary"
                          loading={busy === g.guardianId}
                          onClick={() => void change(g, { blocked: false }, `${g.name} can reach ${pupil.name} again.`)}
                          aria-label={`Unblock ${g.name}`}
                        >
                          Unblock
                        </Button>
                      ) : (
                        <Button
                          variant="danger"
                          disabled={busy !== null}
                          onClick={() => setBlocking({ id: g.guardianId, reason: "" })}
                          aria-label={`Block ${g.name}`}
                        >
                          Block
                        </Button>
                      )}
                      <Button variant="ghost" disabled={busy !== null} onClick={() => void unlink(g)} aria-label={`Unlink ${g.name}`}>
                        Unlink
                      </Button>
                    </div>
                  </div>
                  <SelectField
                    label={`Relationship of ${g.name}`}
                    value={g.relationship ?? ""}
                    onChange={(e) =>
                      void change(g, { relationship: e.target.value || null }, `${g.name}'s relationship to ${pupil.name} is saved.`)
                    }
                    options={REL_CHOICES}
                    disabled={busy !== null}
                  />
                  {blocking?.id === g.guardianId && (
                    <form
                      onSubmit={(e) => void block(e)}
                      className="space-y-2 rounded-xl border border-line bg-surface-2 p-3"
                      aria-label={`Block ${g.name}`}
                    >
                      <TextAreaField
                        label={`Why is ${g.name} blocked from ${pupil.name}?`}
                        value={blocking.reason}
                        onChange={(e) => setBlocking({ ...blocking, reason: e.target.value, problem: undefined })}
                        maxLength={500}
                        rows={2}
                        error={blocking.problem}
                        hint="They will not be able to sign in with this child, will not see them, and will not get messages about them. Their open sign-in ends."
                      />
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button variant="ghost" onClick={() => setBlocking(null)} disabled={busy !== null}>
                          Cancel
                        </Button>
                        <Button type="submit" variant="danger" loading={busy === g.guardianId}>
                          Block
                        </Button>
                      </div>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="add-guardian" className="space-y-3 rounded-2xl border border-line p-4">
          <h3 id="add-guardian" className="text-sm font-semibold text-fg">
            Add a guardian
          </h3>
          <form onSubmit={(e) => void find(e)} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <TextField
                label="Phone number or email"
                value={contact}
                onChange={(e) => (setContact(e.target.value), setMatches(null), setFresh(null))}
                maxLength={254}
                autoComplete="off"
                hint="The whole number or address: a guardian you can already see is offered, so they are not typed twice."
              />
            </div>
            <Button type="submit" variant="secondary" loading={busy === "find"} disabled={contact.trim().length < 3}>
              Find
            </Button>
          </form>
          <SelectField
            label="Relationship to the pupil"
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
            options={REL_CHOICES}
          />
          {matches && matches.length > 0 && (
            <ul aria-label="Guardians found" className="space-y-2">
              {matches.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-fg">{m.name}</p>
                    <p className="text-xs text-fg-muted">
                      {m.children.length > 0 ? `Guardian of ${m.children.join(", ")}` : "No child in your branches yet"}
                      {m.otherBranches > 0 ? `, and ${m.otherBranches} more elsewhere` : ""}
                    </p>
                  </div>
                  <Button loading={busy === "link"} onClick={() => void link({ guardianId: m.id }, m.name)} aria-label={`Link ${m.name}`}>
                    Link
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {matches && !fresh && (
            <Button
              variant="ghost"
              onClick={() =>
                setFresh({
                  name: "",
                  phone: contact.includes("@") ? "" : contact.trim(),
                  email: contact.includes("@") ? contact.trim() : "",
                })
              }
            >
              {matches.length > 0 ? "None of these: add a new guardian" : "Add a new guardian"}
            </Button>
          )}
          {fresh && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void link(
                  { name: fresh.name.trim(), phone: fresh.phone.trim() || null, email: fresh.email.trim() || null },
                  fresh.name.trim(),
                );
              }}
              className="space-y-3"
              aria-label="New guardian"
            >
              {matches && matches.length === 0 && (
                <p className="text-sm text-fg-muted">No guardian you can see has this number or address. Add them:</p>
              )}
              <TextField
                label="Guardian's name"
                value={fresh.name}
                onChange={(e) => setFresh({ ...fresh, name: e.target.value })}
                maxLength={100}
                error={freshProblems.name}
              />
              <TextField
                label="Guardian's phone"
                inputMode="tel"
                value={fresh.phone}
                onChange={(e) => setFresh({ ...fresh, phone: e.target.value })}
                maxLength={40}
                error={freshProblems.phone}
              />
              <TextField
                label="Guardian's email"
                inputMode="email"
                value={fresh.email}
                onChange={(e) => setFresh({ ...fresh, email: e.target.value })}
                maxLength={254}
                error={freshProblems.email}
              />
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="ghost" onClick={() => setFresh(null)} disabled={busy === "link"}>
                  Cancel
                </Button>
                <Button type="submit" loading={busy === "link"}>
                  Add guardian
                </Button>
              </div>
            </form>
          )}
        </section>
        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
