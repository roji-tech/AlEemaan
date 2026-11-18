"use client";

import { useState, type FormEvent } from "react";
import { useNotice } from "@/components/ui/Toaster";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Collection, Item, ItemInitials } from "@/components/ui/Collection";
import { Dialog } from "@/components/ui/Dialog";
import { sendJson } from "@/components/auth/postJson";
import { Pager } from "@/components/ui/Pager";
import { useNotice } from "@/components/ui/Toaster";
import { useCollectionView } from "@/components/ui/useCollectionView";
import { usePagedList } from "@/components/ui/usePagedList";
import { ViewToggle } from "@/components/ui/ViewToggle";
import { pageAfterResize, sizeAfterViewChange, type ViewMode } from "@/components/ui/collection-model";
import { initialsOf } from "@/components/shell/nav";
import { say } from "@/components/academics/common";
import { ROLE_LABELS } from "@/lib/roles";
import type { Role } from "@prisma/client";

// Email-address changes waiting for a decision (task 0088). The list is already narrowed by the server to the people this administrator may
// decide for: members of their branches (a superadmin: everyone, including administrators). The API refuses anything else.
// Drawn by the shared list/grid kit (task 0089): a row each by default, cards if the person chooses, remembered in this browser.

type EmailChange = {
  id: string;
  newEmail: string;
  createdAt: string;
  person: { id: string; name: string | null; email: string | null };
  needs: "ADMIN" | "SUPERADMIN";
  roles: Role[];
};

export function EmailChangesPanel() {
  // List or grid, and how many to a page: remembered in this browser (task 0089). The server pages this list, so the size goes to it as the `limit`.
  const layout = useCollectionView("approvals-email-changes", { defaultView: "list" });
  const list = usePagedList<EmailChange>({ endpoint: "/api/v1/email-change-requests", key: "requests", limit: layout.size });
  const { items, error } = list;
  const [notice, setNotice] = useNotice();
  const [deciding, setDeciding] = useState<{ item: EmailChange; decision: "approve" | "deny" } | null>(null);

  const who = (i: EmailChange) => i.person.name ?? i.person.email ?? "someone";
  const total = list.meta?.total ?? items?.length ?? 0;

  // The page the list is on belongs to usePagedList, which needs the size first, so the view hook cannot be handed the page up front. A change of view or size keeps the first item the
  // person was looking at on screen by the same rules the hook uses (collection-model), applied here.
  const changeView = (view: ViewMode) => {
    list.setPage(pageAfterResize(list.page, layout.size, sizeAfterViewChange(layout.view, layout.size, view)));
    layout.setView(view);
  };
  const changeSize = (size: number) => {
    list.setPage(pageAfterResize(list.page, layout.size, size));
    layout.setSize(size);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-muted">
        A person&apos;s email address is how they sign in and recover their account, so a change waits here. Approving sends a link to the
        new address; nothing changes until that link is opened. An administrator&apos;s own request needs a superadmin.
      </p>
      <div aria-live="polite" className="empty:hidden">
        {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}
      </div>
      {items !== null && items.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-fg-muted" aria-live="polite">
            {total} {total === 1 ? "email change" : "email changes"} waiting
          </p>
          <ViewToggle view={layout.view} onChange={changeView} />
        </div>
      )}
      <Collection
        label="Email changes"
        view={layout.view}
        state={items === null ? "loading" : items.length === 0 ? "empty" : "ready"}
        emptyText="No email changes are waiting for you."
      >
        {(items ?? []).map((i) => (
          <Item
            key={i.id}
            leading={<ItemInitials text={initialsOf(i.person.name, i.person.email)} />}
            title={who(i)}
            subtitle={`${i.roles.length > 0 ? i.roles.map((r) => ROLE_LABELS[r]).join(", ") : "No branch"} · asked on ${new Date(i.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`}
            actions={[
              {
                id: "approve",
                label: "Approve",
                ariaLabel: `Approve the email change for ${who(i)}`,
                onClick: () => setDeciding({ item: i, decision: "approve" }),
              },
              {
                id: "deny",
                label: "Deny",
                ariaLabel: `Deny the email change for ${who(i)}`,
                variant: "ghost",
                onClick: () => setDeciding({ item: i, decision: "deny" }),
              },
            ]}
          >
            <p className="break-words text-fg">
              <span className="text-fg-muted">From</span> {i.person.email ?? "no address"} <span className="text-fg-muted">to</span>{" "}
              <strong className="font-semibold">{i.newEmail}</strong>
            </p>
          </Item>
        ))}
      </Collection>
      {list.meta && (
        <Pager
          page={list.page}
          pages={list.meta.pages}
          onPage={list.setPage}
          label="Pages of email changes"
          total={list.meta.total}
          size={layout.size}
          sizes={layout.sizes}
          onSize={changeSize}
        />
      )}
      <DecideDialog
        key={deciding ? `${deciding.item.id}-${deciding.decision}` : "none"}
        deciding={deciding}
        who={deciding ? who(deciding.item) : ""}
        onClose={() => setDeciding(null)}
        onDone={async (text) => {
          setDeciding(null);
          setNotice({ variant: "success", text });
          list.reload();
        }}
      />
    </div>
  );
}

function DecideDialog({
  deciding,
  who,
  onClose,
  onDone,
}: {
  deciding: { item: EmailChange; decision: "approve" | "deny" } | null;
  who: string;
  onClose: () => void;
  onDone: (text: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!deciding || pending) return;
    setPending(true);
    setProblem(null);
    const r = await sendJson(`/api/v1/email-change-requests/${deciding.item.id}`, "POST", {
      decision: deciding.decision,
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    });
    setPending(false);
    if (r.ok) {
      await onDone(
        deciding.decision === "approve"
          ? `Approved. A confirmation link is on its way to the new address for ${who}.`
          : `Denied. ${who} has been told their address was not changed.`,
      );
      return;
    }
    if (r.status === 404) {
      await onDone("That request was already decided, or is no longer yours to decide.");
      return;
    }
    setProblem(say(r, "That didn't work."));
  }
  const approve = deciding?.decision === "approve";
  return (
    <Dialog
      open={deciding !== null}
      onClose={onClose}
      title={approve ? "Approve this email change" : "Deny this email change"}
      description={deciding ? `${who} wants to use ${deciding.item.newEmail}.` : undefined}
    >
      {deciding && (
        <form onSubmit={submit} noValidate className="space-y-4">
          <p className="text-sm text-fg-muted">
            {approve
              ? "We'll send a confirmation link to the new address, and tell their current address. Only approve it if you are sure it is really them."
              : "Their current address stays as it is, and they are told it was declined."}
          </p>
          <div>
            <label htmlFor="email-change-reason" className="mb-1.5 block text-xs font-semibold tracking-wide text-fg-2 uppercase">
              Your note (optional, recorded with the decision)
            </label>
            <textarea
              id="email-change-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              className="w-full rounded-xl border border-line bg-field p-3 text-sm text-fg focus-visible:outline-2 focus-visible:outline-ring"
            />
          </div>
          {problem && <Alert variant="error">{problem}</Alert>}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" loading={pending} variant={approve ? "primary" : "danger"}>
              {approve ? "Approve" : "Deny"}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
