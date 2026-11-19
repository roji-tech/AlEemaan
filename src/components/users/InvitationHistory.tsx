"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Collection, Item, ItemTile, type ItemFact } from "@/components/ui/Collection";
import { MailIcon } from "@/components/ui/icons";
import { Pager, paginate } from "@/components/ui/Pager";
import { getJson } from "@/components/auth/postJson";
import { say } from "@/components/academics/common";
import { ROLE_LABELS } from "@/lib/roles";
import { historyState, historyText, type HistoricInvitation } from "./model-history";

/// The invitations that are no longer open (task 0117, the maintainer, 2026-11-20: "can we keep the record of revoked invites"): accepted, revoked (by whom, when, why) and run out.
/// Read from `GET /api/v1/invitations/history` when it is opened; the API scopes it like the open list.
export function InvitationHistory() {
  const [rows, setRows] = useState<HistoricInvitation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);

  useEffect(() => {
    let live = true;
    void getJson("/api/v1/invitations/history?limit=100").then((reply) => {
      if (!live) return;
      if (reply.ok) setRows(reply.data!.invitations as HistoricInvitation[]);
      else setError(say(reply, "The history could not be loaded."));
    });
    return () => {
      live = false;
    };
  }, []);

  const all = rows ?? [];
  const shown = paginate(all, page, size);
  return (
    <div className="space-y-4">
      {error && <Alert variant="error">{error}</Alert>}
      <p className="text-sm text-fg-muted" aria-live="polite">
        {rows === null ? " " : `${all.length} ${all.length === 1 ? "invitation" : "invitations"} accepted, revoked or run out`}
      </p>
      <Collection
        label="Invitation history"
        view="list"
        state={rows === null ? "loading" : all.length === 0 ? "empty" : "ready"}
        loadingText="Loading the history…"
        emptyText="Nothing yet. Invitations that are accepted, revoked or run out are kept here."
      >
        {shown.rows.map((invitation) => {
          const state = historyState(invitation);
          const facts: ItemFact[] = [
            { label: "Status", value: state === "accepted" ? "Accepted" : state === "revoked" ? "Revoked" : "Ran out" },
            { label: "Role", value: ROLE_LABELS[invitation.role] },
          ];
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
            >
              <p className={state === "revoked" ? "font-medium text-danger-text" : "text-fg-muted"}>{historyText(invitation)}</p>
            </Item>
          );
        })}
      </Collection>
      <Pager
        page={shown.page}
        pages={shown.pages}
        onPage={setPage}
        label="Pages of invitation history"
        total={all.length}
        size={size}
        sizes={[10, 25, 50]}
        onSize={setSize}
      />
    </div>
  );
}
