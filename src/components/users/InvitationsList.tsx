"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Collection, Item, ItemTile, type ItemFact } from "@/components/ui/Collection";
import { Dialog } from "@/components/ui/Dialog";
import { MailIcon } from "@/components/ui/icons";
import { Pager, paginate } from "@/components/ui/Pager";
import { SelectField, type SelectOption } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { useCollectionView } from "@/components/ui/useCollectionView";
import { ViewToggle } from "@/components/ui/ViewToggle";
import { Pill } from "@/components/academics/StaffDetails";
import { ROLE_LABELS } from "@/lib/roles";
import { expiryText, type Invitation, type RoleName } from "./model";
import { InvitationHistory } from "./InvitationHistory";

/// The school's OPEN invitations: who was invited, as what, by whom, and how long the link has left, as rows or as cards (the list/grid kit, task 0089; the choice and the page size are
/// remembered under "users-invitations"). Resend gives a fresh link (the old one stops working); Revoke ends it. Each button names the address, so a screen-reader user hears which row
/// they are on. `invitations` is null until the first answer; the kit draws "Loading invitations…" and the empty text. All of them (up to 100) are held in the browser, so the pages
/// are cut here.
///
/// Task 0101 D2: a DRAFT (saved, not sent: no link, nothing e-mailed) is listed here with a Draft badge, and has Send, Edit (its address or role) and Delete instead of Resend and Revoke;
/// "Send all drafts" sends every one of them. Drafts are listed first.
export function InvitationsList({
  invitations,
  busyId,
  onResend,
  onRevoke,
  onSendDraft,
  onSendAllDrafts,
  onEditDraft,
  roleOptions,
}: {
  invitations: Invitation[] | null;
  busyId: string | null;
  onResend: (invitation: Invitation) => void;
  onRevoke: (invitation: Invitation) => void;
  onSendDraft: (invitation: Invitation) => void;
  onSendAllDrafts: () => void;
  /// Changes a draft; resolves to an error sentence, or null when it was saved.
  onEditDraft: (invitation: Invitation, patch: { email?: string; role?: string }) => Promise<string | null>;
  roleOptions: SelectOption[];
}) {
  const [page, setPage] = useState(1);
  // Task 0117: the invitations that are no longer open (accepted, revoked, run out), one toggle away.
  const [history, setHistory] = useState(false);
  const [editing, setEditing] = useState<Invitation | null>(null);
  const layout = useCollectionView("users-invitations", { defaultView: "list", page, onPage: setPage });
  // Drafts first: they are the ones waiting for a decision.
  const all = [...(invitations ?? [])].sort((a, b) => Number(b.status === "draft") - Number(a.status === "draft"));
  const drafts = all.filter((i) => i.status === "draft").length;
  // The page is kept inside what exists: after the last invitation of the last page is revoked the reader lands on the new last page, not on a page that is gone.
  const shown = paginate(all, page, layout.size);

  const toggle = (
    <Button variant="ghost" onClick={() => setHistory((v) => !v)} aria-pressed={history}>
      {history ? "Back to waiting invitations" : "Show history (accepted, revoked, run out)"}
    </Button>
  );
  if (history) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">{toggle}</div>
        <InvitationHistory />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {drafts > 0 && (
          <Button
            variant="secondary"
            loading={busyId === "all-drafts"}
            disabled={busyId !== null && busyId !== "all-drafts"}
            onClick={onSendAllDrafts}
          >
            Send all drafts ({drafts})
          </Button>
        )}
        {toggle}
      </div>
      {all.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-fg-muted" aria-live="polite">
            {all.length} {all.length === 1 ? "invitation" : "invitations"} waiting
            {drafts > 0 ? `, ${drafts} ${drafts === 1 ? "draft" : "drafts"} not sent yet` : ""}
          </p>
          <ViewToggle view={layout.view} onChange={layout.setView} />
        </div>
      )}
      <Collection
        label="Pending invitations"
        view={layout.view}
        state={invitations === null ? "loading" : all.length === 0 ? "empty" : "ready"}
        loadingText="Loading invitations…"
        emptyText="No invitations are waiting. People you invite appear here until they accept."
      >
        {shown.rows.map((invitation) => {
          const draft = invitation.status === "draft";
          const expired = invitation.status === "expired";
          const busy = busyId === invitation.id;
          const facts: ItemFact[] = [{ label: "Role", value: ROLE_LABELS[invitation.role] }];
          if (invitation.branchName) facts.push({ label: "Branch", value: invitation.branchName });
          return (
            <Item
              key={invitation.id}
              leading={
                <ItemTile>
                  <MailIcon className="h-5 w-5" />
                </ItemTile>
              }
              title={<span className="break-all">{invitation.email}</span>}
              subtitle={invitation.invitedByName ? `${draft ? "saved" : "invited"} by ${invitation.invitedByName}` : undefined}
              badges={draft ? <Pill tone="warn">Draft</Pill> : undefined}
              name={invitation.email}
              facts={facts}
              actions={
                draft
                  ? [
                      {
                        id: "send",
                        label: "Send",
                        ariaLabel: `Send the draft invitation to ${invitation.email}`,
                        variant: "secondary",
                        loading: busy,
                        disabled: busyId !== null && !busy,
                        onClick: () => onSendDraft(invitation),
                      },
                      {
                        id: "edit",
                        label: "Edit",
                        ariaLabel: `Edit the draft invitation to ${invitation.email}`,
                        variant: "secondary",
                        disabled: busyId !== null,
                        onClick: () => setEditing(invitation),
                      },
                      {
                        id: "revoke",
                        label: "Delete",
                        ariaLabel: `Delete the draft invitation to ${invitation.email}`,
                        variant: "danger",
                        disabled: busyId !== null,
                        onClick: () => onRevoke(invitation),
                      },
                    ]
                  : [
                      {
                        id: "resend",
                        label: expired ? "Send again" : "Resend",
                        ariaLabel: `Resend the invitation to ${invitation.email}`,
                        variant: "secondary",
                        loading: busy,
                        disabled: busyId !== null && !busy,
                        onClick: () => onResend(invitation),
                      },
                      {
                        id: "revoke",
                        label: "Revoke",
                        ariaLabel: `Revoke the invitation to ${invitation.email}`,
                        variant: "danger",
                        disabled: busyId !== null,
                        onClick: () => onRevoke(invitation),
                      },
                    ]
              }
            >
              <p className={expired ? "font-medium text-danger-text" : "text-fg-muted"}>{expiryText(invitation.expiresAt)}</p>
            </Item>
          );
        })}
      </Collection>
      <Pager
        page={shown.page}
        pages={shown.pages}
        onPage={setPage}
        label="Pages of invitations"
        total={all.length}
        size={layout.size}
        sizes={layout.sizes}
        onSize={layout.setSize}
      />
      <EditDraftDialog
        key={editing?.id ?? "no-draft-edit"}
        draft={editing}
        roleOptions={roleOptions}
        onClose={() => setEditing(null)}
        onSave={async (patch) => {
          const problem = await onEditDraft(editing!, patch);
          if (!problem) setEditing(null);
          return problem;
        }}
      />
    </div>
  );
}

/// Edit a draft invitation's address or role (task 0101 D2). Nothing is sent by saving.
function EditDraftDialog({
  draft,
  roleOptions,
  onClose,
  onSave,
}: {
  draft: Invitation | null;
  roleOptions: SelectOption[];
  onClose: () => void;
  onSave: (patch: { email?: string; role?: string }) => Promise<string | null>;
}) {
  const [email, setEmail] = useState(draft?.email ?? "");
  const [role, setRole] = useState<RoleName>(draft?.role ?? "TEACHING_STAFF");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!draft) return null;
  async function save() {
    const address = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return setError("Enter a valid email address.");
    const patch = { ...(address !== draft!.email ? { email: address } : {}), ...(role !== draft!.role ? { role } : {}) };
    if (Object.keys(patch).length === 0) return onClose();
    setBusy(true);
    setError(null);
    const problem = await onSave(patch);
    setBusy(false);
    if (problem) setError(problem);
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Edit the draft for ${draft.email}`}
      description={`Into ${draft.branchName}. Saving changes the draft only: nothing is sent until you send it.`}
    >
      <div className="mt-4 space-y-4">
        <TextField label="Email address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <SelectField label="Role" value={role} onChange={(e) => setRole(e.target.value as RoleName)} options={roleOptions} />
        {error && <Alert variant="error">{error}</Alert>}
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={() => void save()}>
            Save draft
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
