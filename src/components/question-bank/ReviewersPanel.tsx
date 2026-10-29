"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { getJson, sendJson } from "@/components/auth/postJson";
import { say, type BranchChoice, type Notice } from "@/components/academics/common";

// Who may review question bank submissions. A branch administrator manages their own branch's reviewers; a superadmin also manages the "every branch" ones. A reviewer is
// active staff (never a pupil or a parent). Presentation only: the reviewers API decides who may do what and says why not.

type Reviewer = {
  id: string;
  userId: string;
  name: string | null;
  email: string | null;
  branchId: string | null;
  scope: "GENERAL" | "SUBJECT";
  subjectLabel: string | null;
  isExamApprover: boolean;
  inherited: boolean;
};
type Person = { userId: string; name: string | null; email: string | null };

const ALL = "__all__";
const STAFF_ROLES = ["ADMIN", "TEACHING_STAFF", "NON_TEACHING_STAFF"] as const;
const PEOPLE_PER_ROLE = 100;
const who = (p: { name: string | null; email: string | null }) => p.name?.trim() || p.email || "Someone";

export function ReviewersPanel({ branches, isSuperAdmin }: { branches: BranchChoice[]; isSuperAdmin: boolean }) {
  const editable = branches.filter((b) => b.canEdit);
  const [where, setWhere] = useState(editable[0]?.id ?? ALL);
  const [reviewers, setReviewers] = useState<Reviewer[] | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [capped, setCapped] = useState(false);
  const [search, setSearch] = useState("");
  const [chosen, setChosen] = useState<Person | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, setPending] = useState(false);
  const [removing, setRemoving] = useState<Reviewer | null>(null);

  const [personId, setPersonId] = useState("");
  const [covers, setCovers] = useState<"GENERAL" | "SUBJECT">("GENERAL");
  const [subject, setSubject] = useState("");
  const [examApprover, setExamApprover] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const branchName = (id: string | null) => (id === null ? "Every branch" : (branches.find((b) => b.id === id)?.name ?? "A branch"));
  const scopeQuery = where === ALL ? "" : `branchId=${encodeURIComponent(where)}`;

  // Loading lives in effects, with a guard: switching branch or typing quickly must not let an older response overwrite a newer one. `version` re-runs the reviewers after a change.
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let current = true;
    void (async () => {
      const reply = await getJson(`/api/v1/question-bank/reviewers${scopeQuery ? `?${scopeQuery}` : ""}`);
      if (!current) return;
      if (!reply.ok) return setError(say(reply, "Couldn't load the reviewers."));
      setError(null);
      setReviewers(reply.data!.reviewers as Reviewer[]);
    })();
    return () => {
      current = false;
    };
  }, [scopeQuery, version]);

  // The people to choose from: each staff role is read separately (the members list filters by one role) and capped at PEOPLE_PER_ROLE, so a large school finds someone by typing
  // a name or an address instead of scrolling. A short pause after typing avoids one request per key.
  useEffect(() => {
    let current = true;
    const text = search.trim();
    const timer = setTimeout(
      () => {
        void (async () => {
          const replies = await Promise.all(
            STAFF_ROLES.map((role) =>
              getJson(
                `/api/v1/members?role=${role}&limit=${PEOPLE_PER_ROLE}${scopeQuery ? `&${scopeQuery}` : ""}${text ? `&q=${encodeURIComponent(text)}` : ""}`,
              ),
            ),
          );
          if (!current) return;
          const bad = replies.find((r) => !r.ok);
          if (bad) return setError(say(bad, "Couldn't load the staff list."));
          const seen = new Map<string, Person>();
          for (const r of replies) for (const m of r.data!.members as Person[]) if (!seen.has(m.userId)) seen.set(m.userId, m);
          setPeople([...seen.values()].sort((a, b) => who(a).localeCompare(who(b))));
          setCapped(replies.some((r) => (r.data!.members as Person[]).length >= PEOPLE_PER_ROLE));
        })();
      },
      text ? 250 : 0,
    );
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [scopeQuery, search]);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setNotice(null);
    if (!personId) return setProblem("Choose a person.");
    if (covers === "SUBJECT" && !subject.trim()) return setProblem("Type the subject they review.");
    setProblem(null);
    setPending(true);
    const reply = await sendJson("/api/v1/question-bank/reviewers", "POST", {
      branchId: where === ALL ? null : where,
      userId: personId,
      scope: covers,
      ...(covers === "SUBJECT" ? { subjectLabel: subject.trim() } : {}),
      isExamApprover: examApprover,
    });
    setPending(false);
    if (!reply.ok) return setNotice({ variant: "error", text: say(reply, "That didn't work.") });
    const added = chosen ?? people.find((p) => p.userId === personId);
    setNotice({
      variant: "success",
      text: `${added ? who(added) : "They"} can now review ${covers === "SUBJECT" ? subject.trim() : "every subject"}.`,
    });
    setPersonId("");
    setChosen(null);
    setSubject("");
    setExamApprover(false);
    setVersion(version + 1);
  }

  async function confirmRemove() {
    if (!removing || pending) return;
    setPending(true);
    const reply = await sendJson(`/api/v1/question-bank/reviewers/${encodeURIComponent(removing.id)}`, "DELETE");
    setPending(false);
    const gone = removing;
    setRemoving(null);
    setNotice(
      reply.ok
        ? { variant: "success", text: `${who(gone)} is no longer a reviewer here.` }
        : { variant: "error", text: say(reply, "That didn't work.") },
    );
    setVersion(version + 1);
  }

  if (editable.length === 0 && !isSuperAdmin)
    return (
      <p role="alert" className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
        You do not administer a branch, so you cannot choose reviewers.
      </p>
    );

  // The person already chosen stays in the list even when a later search no longer matches them.
  const shown = chosen && !people.some((p) => p.userId === chosen.userId) ? [chosen, ...people] : people;
  const canRemove = (r: Reviewer) => (r.branchId === null ? isSuperAdmin : (branches.find((b) => b.id === r.branchId)?.canEdit ?? false));

  return (
    <div className="space-y-6">
      <Alert variant="info">
        <p>
          <strong>What a reviewer does.</strong> A reviewer approves, edits or rejects the questions teachers submit. One who covers every
          subject reviews them all; one who covers a subject reviews that subject. An exam approver also sees overlap warnings and decides
          when pupils may see a question.
        </p>
      </Alert>
      {(editable.length > 1 || isSuperAdmin) && (
        <SelectField
          label="Reviewers for"
          value={where}
          onChange={(e) => {
            setReviewers(null);
            setNotice(null);
            setProblem(null);
            setPersonId("");
            setChosen(null);
            setSearch("");
            setWhere(e.target.value);
          }}
          options={[
            ...(isSuperAdmin ? [{ value: ALL, label: "Every branch (all reviewers)" }] : []),
            ...editable.map((b) => ({ value: b.id, label: b.name })),
          ]}
        />
      )}
      <div aria-live="polite" className="empty:hidden">
        {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}
      </div>

      <section aria-labelledby="reviewers-heading" className="space-y-3">
        <h2 id="reviewers-heading" className="text-lg font-semibold text-fg">
          Current reviewers
        </h2>
        {reviewers === null ? (
          <p className="text-sm text-fg-muted" aria-busy="true">
            Loading…
          </p>
        ) : reviewers.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line-strong p-6 text-center text-sm text-fg-muted">
            No reviewers yet. Until you add one, a submitted question has nobody to review it.
          </p>
        ) : (
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {reviewers.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-fg">{who(r)}</p>
                  {r.name && r.email && <p className="truncate text-sm text-fg-muted">{r.email}</p>}
                  <p className="mt-1 text-sm text-fg-2">
                    {r.scope === "SUBJECT" ? `Reviews ${r.subjectLabel}` : "Reviews every subject"}
                    {r.isExamApprover && " · Exam approver"}
                    {" · "}
                    {r.branchId === null ? "Every branch" : where === ALL ? branchName(r.branchId) : "This branch"}
                  </p>
                </div>
                {canRemove(r) && !(r.inherited && !isSuperAdmin) ? (
                  <Button variant="secondary" onClick={() => setRemoving(r)}>
                    Remove<span className="sr-only"> {who(r)}</span>
                  </Button>
                ) : (
                  r.inherited && <p className="text-sm text-fg-muted">Set for every branch</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="add-reviewer-heading" className="space-y-3">
        <h2 id="add-reviewer-heading" className="text-lg font-semibold text-fg">
          Add a reviewer
        </h2>
        <form onSubmit={add} className="space-y-4 rounded-2xl border border-line bg-surface p-4" noValidate>
          <TextField
            label="Search staff"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            maxLength={64}
            hint={
              capped
                ? `Showing the first ${PEOPLE_PER_ROLE} of each kind of staff. Type part of a name or an address to narrow the list.`
                : "Type part of a name or an address to narrow the list."
            }
          />
          <SelectField
            label="Person"
            value={personId}
            onChange={(e) => {
              setPersonId(e.target.value);
              setChosen(people.find((p) => p.userId === e.target.value) ?? null);
            }}
            hint="Active staff only: administrators, teachers and other staff."
            error={problem === "Choose a person." ? problem : null}
            options={[
              {
                value: "",
                label: people.length === 0 && !chosen ? (search.trim() ? "Nobody matches" : "No staff to choose from") : "Choose a person",
              },
              ...shown.map((p) => ({
                value: p.userId,
                label: p.email ? `${who(p)} (${p.email})` : who(p),
              })),
            ]}
          />
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-fg">Covers</legend>
            <label className="flex items-center gap-2 text-sm text-fg">
              <input type="radio" name="covers" checked={covers === "GENERAL"} onChange={() => setCovers("GENERAL")} />
              Every subject
            </label>
            <label className="flex items-center gap-2 text-sm text-fg">
              <input type="radio" name="covers" checked={covers === "SUBJECT"} onChange={() => setCovers("SUBJECT")} />
              One subject
            </label>
          </fieldset>
          {covers === "SUBJECT" && (
            <TextField
              label="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={80}
              hint="For example Mathematics. Capital letters, spaces and hyphens do not matter when it is matched."
              error={problem === "Type the subject they review." ? problem : null}
            />
          )}
          <CheckboxField
            label="Exam approver (sees overlap warnings and decides when pupils may see a question)"
            checked={examApprover}
            onChange={(e) => setExamApprover(e.target.checked)}
          />
          <Button type="submit" loading={pending}>
            {pending ? "Adding…" : "Add reviewer"}
          </Button>
        </form>
      </section>

      <Dialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={removing ? `Remove ${who(removing)} as a reviewer?` : "Remove reviewer"}
      >
        {removing && (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-fg-2">
              They stop reviewing {removing.scope === "SUBJECT" ? removing.subjectLabel : "every subject"} straight away. Decisions they
              already made stay as they are, and you can add them again later.
            </p>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={() => setRemoving(null)} disabled={pending} data-initial-focus>
                Cancel
              </Button>
              <Button variant="danger" onClick={confirmRemove} loading={pending}>
                {pending ? "Removing…" : "Remove"}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
