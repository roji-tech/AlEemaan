"use client";

import { useState } from "react";
import { Collection, Item, ItemTile, type ItemFact } from "@/components/ui/Collection";
import { MailIcon } from "@/components/ui/icons";
import { Pager, paginate } from "@/components/ui/Pager";
import { useCollectionView } from "@/components/ui/useCollectionView";
import { ViewToggle } from "@/components/ui/ViewToggle";
import { ROLE_LABELS } from "@/lib/roles";
import { expiryText, type Invitation } from "./model";
import { InvitationHistory } from "./InvitationHistory";
import { Button } from "@/components/ui/Button";

/// The school's OPEN invitations: who was invited, as what, by whom, and how long the link has left, as rows or as cards (the list/grid kit, task 0089; the choice and the page size are
/// remembered under "users-invitations"). Resend gives a fresh link (the old one stops working); Revoke ends it. Each button names the address, so a screen-reader user hears which row
/// they are on. `invitations` is null until the first answer; the kit draws "Loading invitations…" and the empty text. All of them (up to 100) are held in the browser, so the pages
/// are cut here.
export function InvitationsList({
  invitations,
  busyId,
  onResend,
  onRevoke,
}: {
  invitations: Invitation[] | null;
  busyId: string | null;
  onResend: (invitation: Invitation) => void;
  onRevoke: (invitation: Invitation) => void;
}) {
  const [page, setPage] = useState(1);
  // Task 0117: the invitations that are no longer open (accepted, revoked, run out), one toggle away.
  const [history, setHistory] = useState(false);
  const layout = useCollectionView("users-invitations", { defaultView: "list", page, onPage: setPage });
  const all = invitations ?? [];
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
      <div className="flex justify-end">{toggle}</div>
      {all.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-fg-muted" aria-live="polite">
            {all.length} {all.length === 1 ? "invitation" : "invitations"} waiting
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
              subtitle={invitation.invitedByName ? `invited by ${invitation.invitedByName}` : undefined}
              name={invitation.email}
              facts={facts}
              actions={[
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
              ]}
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
    </div>
  );
}
