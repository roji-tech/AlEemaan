"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TextField } from "@/components/ui/TextField";
import { BuildingIcon, PlusIcon } from "@/components/ui/icons";
import { memberLabel } from "@/lib/branches/labels";

export type BranchRow = { id: string; name: string; members: number };

const NAME_MAX = 100; // mirrors the API's `createBranchSchema`

/// The branches list and its "New branch" form. Creating goes through the same, already-tested
/// `POST /api/v1/branches` everything else uses (admin-only, CSRF-checked, audit-logged, unique
/// names); this component only presents it, and every outcome — created, duplicate, invalid,
/// signed out, refused, server error, offline — has its own honest message.
export function BranchesView({ branches }: { branches: BranchRow[] }) {
  const router = useRouter();
  const formId = useId();

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);
  const newButtonRef = useRef<HTMLButtonElement>(null);

  // After a rejected name the caret goes back into the field — but the input is `disabled` while the
  // request is in flight, and focus() on a disabled input silently does nothing (the same trap the
  // sign-in form fell into). So the handler only *asks*; this effect runs after the re-render that
  // re-enabled the input.
  const [focusRequests, setFocusRequests] = useState(0);
  useEffect(() => {
    if (focusRequests > 0) nameRef.current?.focus();
  }, [focusRequests]);

  function openForm() {
    setNotice(null);
    setCreating(true);
    nameRef.current?.focus(); // already open → put the caret back in the field
  }

  function closeForm() {
    setCreating(false);
    setName("");
    setNameError(null);
    setFormError(null);
    // The "New branch" button is never disabled, so — unlike the form's own controls, which are
    // disabled while a request is in flight — it can take focus right now, before the form unmounts.
    newButtonRef.current?.focus();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const trimmed = name.trim();
    setNameError(null);
    setFormError(null);
    if (!trimmed) {
      setNameError("Enter a branch name.");
      nameRef.current?.focus();
      return;
    }

    setPending(true);
    try {
      const res = await fetch("/api/v1/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ name: trimmed }),
      });

      if (res.status === 401) {
        router.replace("/login"); // the session ended while the form was open
        router.refresh();
        return;
      }

      const body = await res.json().catch(() => null);

      if (res.status === 201) {
        setNotice(`“${body?.data?.branch?.name ?? trimmed}” was created.`);
        closeForm();
        router.refresh(); // re-runs the server component: the new branch appears in the list
        return;
      }
      if (res.status === 409) {
        setNameError("A branch with this name already exists.");
        setFocusRequests((n) => n + 1);
        return;
      }
      if (res.status === 400) {
        setNameError(body?.error?.message ?? "That name isn't valid.");
        setFocusRequests((n) => n + 1);
        return;
      }
      if (res.status === 403) {
        setFormError("You don't have permission to create branches.");
        return;
      }
      setFormError("We couldn't create the branch. Please try again in a moment.");
    } catch {
      setFormError("Can't reach the server. Check your internet connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Branches"
        description="Every branch a student, staff member or class belongs to."
        actions={
          <Button
            ref={newButtonRef}
            aria-expanded={creating}
            aria-controls={creating ? formId : undefined}
            onClick={openForm}
          >
            <PlusIcon className="h-4 w-4" />
            New branch
          </Button>
        }
      />

      {notice && <Alert variant="success">{notice}</Alert>}

      {creating && (
        <Card>
          <form id={formId} method="post" onSubmit={handleSubmit} noValidate className="space-y-4">
            <h2 className="text-lg font-semibold text-fg">New branch</h2>
            <TextField
              ref={nameRef}
              label="Branch name"
              name="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(null);
              }}
              error={nameError}
              placeholder="e.g. Secondary — Boys"
              maxLength={NAME_MAX}
              autoComplete="off"
              autoFocus
              disabled={pending}
            />
            {formError && <Alert variant="error">{formError}</Alert>}
            <div className="flex flex-wrap gap-3">
              <Button type="submit" loading={pending}>
                {pending ? "Creating…" : "Create"}
              </Button>
              <Button variant="ghost" onClick={closeForm} disabled={pending}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {branches.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong p-10 text-center">
          <span
            aria-hidden="true"
            className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-tint text-brand-fg"
          >
            <BuildingIcon className="h-6 w-6" />
          </span>
          <p className="mt-4 font-semibold text-fg">No branches yet</p>
          <p className="mt-1 text-sm text-fg-muted">Use “New branch” above to add the first one.</p>
        </div>
      ) : (
        <ul aria-label="Branches" className="space-y-3">
          {branches.map((branch) => (
            <li
              key={branch.id}
              className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-4 shadow-card"
            >
              <span
                aria-hidden="true"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand-fg"
              >
                <BuildingIcon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold text-fg">{branch.name}</p>
                <p className="mt-0.5 text-sm text-fg-muted">{memberLabel(branch.members)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
