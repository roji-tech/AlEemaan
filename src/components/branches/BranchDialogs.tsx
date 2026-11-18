"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { TextField } from "@/components/ui/TextField";
import type { Holding } from "@/lib/branches/holdings";

export type BranchRef = { id: string; name: string };
const NAME_MAX = 100; // mirrors the API

type Detail = { holdings: Holding[]; onlyBranch: boolean; canDelete: boolean };

const sentence = (items: Holding[]) => items.map((h) => `${h.count} ${h.label}`).join(", ");

/// One place where the answers of PATCH and DELETE become words, so the list and the single-branch page say the same thing.
async function readError(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null);
  return body?.error?.message ?? fallback;
}

/// Rename a branch. The code is shown and never edited: invoice numbers carry it.
export function BranchRenameDialog({
  branch,
  code,
  open,
  onClose,
  onSaved,
}: {
  branch: BranchRef;
  code?: string;
  open: boolean;
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Rename branch" description="The name is what people see on lists, reports and invoices.">
      {open && <RenameForm branch={branch} code={code} onClose={onClose} onSaved={onSaved} />}
    </Dialog>
  );
}

function RenameForm({
  branch,
  code,
  onClose,
  onSaved,
}: {
  branch: BranchRef;
  code?: string;
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const [name, setName] = useState(branch.name);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const trimmed = name.trim();
    if (!trimmed) return setError("Enter a branch name.");
    if (trimmed === branch.name) return onClose();
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/branches/${encodeURIComponent(branch.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ name: trimmed }),
      });
      if (res.ok) return onSaved(trimmed);
      if (res.status === 409) return setError("A branch with this name already exists.");
      if (res.status === 404) return setError("This branch no longer exists. Reload the page.");
      setError(await readError(res, "We couldn't save the name. Please try again in a moment."));
    } catch {
      setError("Can't reach the server. Check your internet connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <TextField
        label="Branch name"
        name="name"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setError(null);
        }}
        error={error}
        maxLength={NAME_MAX}
        autoComplete="off"
        disabled={pending}
      />
      {code && (
        <p className="text-sm text-fg-muted">
          Code <span className="font-semibold text-fg">{code}</span> stays as it is: it is part of every invoice number already issued.
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={pending}>
          {pending ? "Saving…" : "Save name"}
        </Button>
        <Button variant="ghost" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/// Delete a branch: the server says what it holds; people and history stop the deletion, set-up (classes, subjects, settings, invitations) is listed and goes with it, and the
/// branch's exact name is typed back before the button works.
export function BranchDeleteDialog({
  branch,
  open,
  onClose,
  onDeleted,
}: {
  branch: BranchRef;
  open: boolean;
  onClose: () => void;
  onDeleted: (name: string) => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Delete branch" description={<>This cannot be undone.</>}>
      {open && <DeleteBody branch={branch} onClose={onClose} onDeleted={onDeleted} />}
    </Dialog>
  );
}

function DeleteBody({ branch, onClose, onDeleted }: { branch: BranchRef; onClose: () => void; onDeleted: (name: string) => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/v1/branches/${encodeURIComponent(branch.id)}`, { credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) throw new Error(await readError(res, "We couldn't look up what this branch holds."));
        return (await res.json()).data as Detail;
      })
      .then((data) => live && setDetail(data))
      .catch((e: Error) => live && setLoadError(e.message || "Can't reach the server. Check your internet connection and try again."));
    return () => {
      live = false;
    };
  }, [branch.id]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending || typed.trim() !== branch.name) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/branches/${encodeURIComponent(branch.id)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ confirmName: typed.trim() }),
      });
      if (res.ok) return onDeleted(branch.name);
      setError(await readError(res, "We couldn't delete the branch. Please try again in a moment."));
    } catch {
      setError("Can't reach the server. Check your internet connection and try again.");
    } finally {
      setPending(false);
    }
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <Alert variant="error">{loadError}</Alert>
        <Button variant="ghost" onClick={onClose} data-initial-focus>
          Close
        </Button>
      </div>
    );
  }
  if (!detail) return <p className="text-sm text-fg-muted">Checking what “{branch.name}” holds…</p>;

  const blocking = detail.holdings.filter((h) => h.blocks);
  const goesWithIt = detail.holdings.filter((h) => !h.blocks);

  if (detail.onlyBranch) {
    return (
      <div className="space-y-4">
        <Alert variant="warning">
          The school needs at least one branch, so “{branch.name}” cannot be deleted. Add another branch first.
        </Alert>
        <Button variant="ghost" onClick={onClose} data-initial-focus>
          Close
        </Button>
      </div>
    );
  }
  if (blocking.length > 0) {
    return (
      <div className="space-y-4">
        <Alert variant="warning">
          “{branch.name}” still holds {sentence(blocking)}. Move or remove them first; a branch with people or records in it is never
          deleted.
        </Alert>
        <Button variant="ghost" onClick={onClose} data-initial-focus>
          Close
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {goesWithIt.length > 0 ? (
        <Alert variant="warning">
          Deleting “{branch.name}” also removes its set-up: {sentence(goesWithIt)}.
        </Alert>
      ) : (
        <p className="text-sm text-fg-muted">“{branch.name}” holds nothing, so nothing else is removed.</p>
      )}
      <TextField
        label={`Type ${branch.name} to confirm`}
        name="confirmName"
        value={typed}
        onChange={(e) => {
          setTyped(e.target.value);
          setError(null);
        }}
        error={error}
        autoComplete="off"
        disabled={pending}
      />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="danger" loading={pending} disabled={typed.trim() !== branch.name}>
          {pending ? "Deleting…" : "Delete branch"}
        </Button>
        <Button variant="ghost" onClick={onClose} disabled={pending} data-initial-focus>
          Cancel
        </Button>
      </div>
    </form>
  );
}
