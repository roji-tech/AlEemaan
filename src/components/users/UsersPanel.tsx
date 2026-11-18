"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useNotice } from "@/components/ui/Toaster";
import { flushSync } from "react-dom";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Tabs, panelId, tabId } from "@/components/ui/Tabs";
import { Collection } from "@/components/ui/Collection";
import { ListToolbar } from "@/components/ui/ListToolbar";
import { Pager } from "@/components/ui/Pager";
import { SelectField } from "@/components/ui/SelectField";
import { useCollectionView } from "@/components/ui/useCollectionView";
import { ViewToggle } from "@/components/ui/ViewToggle";
import { PlusIcon } from "@/components/ui/icons";
import { NETWORK_ERROR, RATE_LIMITED, SESSION_ENDED, getJson, sendJson } from "@/components/auth/postJson";
import { ROLE_LABELS } from "@/lib/roles";
import { DeactivateDialog } from "./DeactivateDialog";
import { StandingDialog, type StandingAsk } from "@/components/standing/StandingDialog";
import { StandingHistoryDialog } from "@/components/standing/StandingHistoryDialog";
import { type StandingCan } from "@/components/standing/model";
import { MemberItem } from "./MemberItem";
import { EditMemberDialog } from "./EditMemberDialog";
import { InvitationsList } from "./InvitationsList";
import { BulkInviteDialog } from "./BulkInviteDialog";
import { InviteDialog } from "./InviteDialog";
import { SuperAdminDialog } from "./SuperAdminDialog";
import { ROLE_OPTIONS, displayName, roleOptionsFor, type BranchOption, type Invitation, type Member, type PageMeta } from "./model";

// The kit's Item keeps its actions at z-10, in a card at the left of the footer. An Actions list opened there would sit under the next item's own actions and, from `md`, run off the
// card's left edge (it opens leftwards from the button). Until Item handles it, the item that holds an open list is raised and a card's footer is right-aligned (reported to the kit's owner).
const MENU_ROOM = "[&_li:has([aria-expanded=true])]:z-20 [&_li>div.border-t]:justify-end";

const failureText = (status: number, message?: string) =>
  status === 401
    ? SESSION_ENDED
    : status === 429
      ? RATE_LIMITED
      : status === 0
        ? NETWORK_ERROR
        : (message ?? "That didn't work. Please try again in a moment.");

/// The Users page (plan §0.5.4): the school's people with filters and paging, the open invitations, and the four things an administrator does —
/// invite, change role/branch, deactivate, reactivate; a superadmin also makes or removes superadmins. A branch administrator sees and acts on
/// their own branches only and never touches an administrator or a superadmin — controls that would be refused are not drawn (a courtesy). Everything goes through the API (which enforces who may do what); this only shows the
/// answer. Results are announced in one polite live region, and focus is never left on a control that has just disappeared.
export function UsersPanel({
  branches,
  currentUserId,
  isSuperAdmin,
  hasMfa,
  standingCan = {},
}: {
  branches: BranchOption[];
  currentUserId: string;
  isSuperAdmin: boolean;
  /// The signed-in superadmin has two-step verification on, so a change that needs a fresh proof asks for a code and not the password.
  hasMfa: boolean;
  /// What this person may do about a member's standing in each branch (display only: the API decides).
  standingCan?: Record<string, StandingCan>;
}) {
  const [searchText, setSearchText] = useState("");
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("active");
  const [access, setAccess] = useState(""); // "" = anyone, "formResults" = only the people who may read form results
  const [branchId, setBranchId] = useState("");
  const [page, setPage] = useState(1);
  // List or grid, and how many to a page: remembered for this list (task 0089). The size is the request's `limit` (the API's cap is 50; every size the kit offers is 50 or less).
  const layout = useCollectionView("users-people", { defaultView: "list", page, onPage: setPage });
  const [tab, setTab] = useState<"people" | "invitations">("people");

  const [members, setMembers] = useState<Member[] | null>(null);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [invitations, setInvitations] = useState<Invitation[] | null>(null);

  const [notice, setNotice] = useNotice();
  const [inviting, setInviting] = useState(false);
  const [inviteKey, setInviteKey] = useState(0);
  const [bulk, setBulk] = useState<{ open: boolean; key: number }>({ open: false, key: 0 });
  const [editing, setEditing] = useState<Member | null>(null);
  const [deactivating, setDeactivating] = useState<Member | null>(null);
  const [standingAsk, setStandingAsk] = useState<StandingAsk | null>(null);
  const [historyOf, setHistoryOf] = useState<{ endpoint: string; name: string } | null>(null);
  const [superAdminFor, setSuperAdminFor] = useState<Member | null>(null);
  const [busyUser, setBusyUser] = useState<string | null>(null);
  const [busyInvitation, setBusyInvitation] = useState<string | null>(null);
  const summaryRef = useRef<HTMLParagraphElement>(null);

  // The search box waits for a pause in typing before it asks the server. Only when the text really changed: on mount (and on any
  // re-run with the same text) there is nothing to apply, and resetting the page then would undo a click on "Next" made within 300 ms.
  useEffect(() => {
    if (searchText.trim() === q) return;
    const timer = setTimeout(() => {
      setQ(searchText.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText, q]);

  // The two lists load through plain functions, so an action can AWAIT its own refresh (and, with `flush`, have the new lists in the DOM
  // when it resumes) instead of guessing with a timer how long the refresh takes.
  const loadMembers = useCallback(
    async (signal?: AbortSignal, flush = false) => {
      const params = new URLSearchParams({ status, page: String(page), limit: String(layout.size) });
      if (role) params.set("role", role);
      if (branchId) params.set("branchId", branchId);
      if (access === "formResults") params.set("readsFormResults", "true");
      if (q) params.set("q", q);
      const reply = await getJson(`/api/v1/members?${params}`, signal);
      if (signal?.aborted) return;
      const apply = () => {
        if (reply.ok) {
          setMembers(reply.data!.members as Member[]);
          setMeta(reply.meta as PageMeta);
          setLoadError(null);
        } else {
          setLoadError(failureText(reply.status, reply.message));
        }
      };
      if (flush) flushSync(apply);
      else apply();
    },
    [status, role, branchId, access, q, page, layout.size],
  );
  const loadInvitations = useCallback(async (signal?: AbortSignal, flush = false) => {
    const reply = await getJson(`/api/v1/invitations?limit=100`, signal);
    if (signal?.aborted || !reply.ok) return;
    const apply = () => setInvitations(reply.data!.invitations as Invitation[]);
    if (flush) flushSync(apply);
    else apply();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadMembers(controller.signal);
    return () => controller.abort();
  }, [loadMembers]);
  useEffect(() => {
    const controller = new AbortController();
    void loadInvitations(controller.signal);
    return () => controller.abort();
  }, [loadInvitations]);

  /// Reloads both lists and resolves when they are in the DOM.
  const refresh = useCallback(
    () => Promise.all([loadMembers(undefined, true), loadInvitations(undefined, true)]).then(() => undefined),
    [loadMembers, loadInvitations],
  );

  /// After a change that may have removed the control that had focus (a deactivated person's row, a revoked invitation, the closed dialog's
  /// opener): wait until the lists are refreshed — and in the DOM — and only then, if focus has fallen to <body>, park it on the page summary.
  /// No timer: whatever the machine's speed, the check happens after the thing it is checking for.
  async function afterChange() {
    await refresh();
    if (!document.activeElement || document.activeElement === document.body) summaryRef.current?.focus();
  }

  async function reactivate(member: Member) {
    setBusyUser(member.id);
    const reply = await sendJson(`/api/v1/members/${member.id}/reactivate`, "POST", {});
    setBusyUser(null);
    if (reply.ok) {
      setNotice({ variant: "success", text: `${displayName(member)} can sign in again.` });
      await afterChange();
    } else {
      setNotice({ variant: "error", text: failureText(reply.status, reply.message) });
    }
  }

  async function resend(invitation: Invitation) {
    setBusyInvitation(invitation.id);
    const reply = await sendJson(`/api/v1/invitations/${invitation.id}/resend`, "POST", {});
    setBusyInvitation(null);
    if (reply.ok) {
      setNotice({ variant: "success", text: `A new invitation was sent to ${invitation.email}. The earlier link no longer works.` });
      await refresh();
    } else if (reply.status === 404) {
      setNotice({ variant: "error", text: "That invitation is no longer open." });
      await refresh();
    } else {
      setNotice({ variant: "error", text: failureText(reply.status, reply.message) });
    }
  }

  async function revoke(invitation: Invitation) {
    setBusyInvitation(invitation.id);
    const reply = await sendJson(`/api/v1/invitations/${invitation.id}`, "DELETE");
    setBusyInvitation(null);
    if (reply.ok || reply.status === 404) {
      setNotice({ variant: "success", text: `The invitation to ${invitation.email} was revoked. Its link no longer works.` });
      await afterChange();
    } else {
      setNotice({ variant: "error", text: failureText(reply.status, reply.message) });
    }
  }

  const ask = (member: Member, kind: StandingAsk["kind"]) =>
    setStandingAsk({
      kind,
      subject: "staff",
      endpoint: `/api/v1/members/${member.id}/standing`,
      name: displayName(member),
      canSchoolWide: isSuperAdmin && !member.isSuperAdmin,
    });

  const filtered = Boolean(q || role || branchId || access || status !== "active");
  const clearFilters = () => {
    setSearchText("");
    setQ("");
    setRole("");
    setBranchId("");
    setAccess("");
    setStatus("active");
    setPage(1);
  };

  return (
    <div className="space-y-10">
      <div role="status" aria-live="polite" className="empty:hidden">
        {notice && notice.variant === "success" && (
          <Alert variant="success" announce={false}>
            {notice.text}
          </Alert>
        )}
      </div>
      {notice && notice.variant === "error" && <Alert variant="error">{notice.text}</Alert>}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 sm:flex-1">
          <Tabs
            label="Users sections"
            prefix="users"
            active={tab}
            onChange={setTab}
            tabs={[
              { id: "people", label: "People" },
              { id: "invitations", label: invitations === null ? "Pending invitations" : `Pending invitations (${invitations.length})` },
            ]}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setBulk((b) => ({ open: true, key: b.key + 1 }))}>
            Invite many
          </Button>
          <Button
            onClick={() => {
              setNotice(null);
              setInviteKey((k) => k + 1);
              setInviting(true);
            }}
          >
            <PlusIcon className="h-4 w-4" />
            Invite someone
          </Button>
        </div>
      </div>

      {tab === "people" && (
        <section
          role="tabpanel"
          id={panelId("users", "people")}
          aria-labelledby={tabId("users", "people")}
          className={`space-y-4 ${MENU_ROOM}`}
        >
          <ListToolbar
            searchValue={searchText}
            onSearch={setSearchText}
            searchPlaceholder="Search by name or email"
            activeCount={[role !== "", branchId !== "", access !== "", status !== "active"].filter(Boolean).length}
            onClear={clearFilters}
            trailing={<ViewToggle view={layout.view} onChange={layout.setView} />}
          >
            <SelectField
              label="Role"
              value={role}
              onChange={(e) => (setRole(e.target.value), setPage(1))}
              options={[{ value: "", label: "All roles" }, ...ROLE_OPTIONS]}
            />
            <SelectField
              label="Branch"
              value={branchId}
              onChange={(e) => (setBranchId(e.target.value), setPage(1))}
              options={[{ value: "", label: "All branches" }, ...branches.map((c) => ({ value: c.id, label: c.name }))]}
            />
            <SelectField
              label="Access"
              value={access}
              onChange={(e) => (setAccess(e.target.value), setPage(1))}
              options={[
                { value: "", label: "Anyone" },
                { value: "formResults", label: "Reads form results" },
              ]}
            />
            <SelectField
              label="Status"
              value={status}
              onChange={(e) => (setStatus(e.target.value), setPage(1))}
              options={[
                { value: "active", label: "Active" },
                { value: "deactivated", label: "Deactivated" },
                { value: "all", label: "Everyone" },
              ]}
            />
          </ListToolbar>

          <p ref={summaryRef} tabIndex={-1} className="text-sm text-fg-muted focus:outline-none" aria-live="polite">
            {meta ? `${meta.total} ${meta.total === 1 ? "person" : "people"}${filtered ? " match" : ""}` : " "}
          </p>

          {loadError ? (
            <Alert variant="error">
              <p>{loadError}</p>
              <Button variant="secondary" className="mt-3" onClick={() => void refresh()}>
                Try again
              </Button>
            </Alert>
          ) : (
            <Collection
              label="People"
              view={layout.view}
              state={members === null ? "loading" : members.length === 0 ? (filtered ? "nomatch" : "empty") : "ready"}
              loadingText="Loading people…"
              emptyText="No one has joined yet."
              noMatchText="No one matches these filters."
              onClear={clearFilters}
            >
              {(members ?? []).map((member) => (
                <MemberItem
                  key={member.id}
                  member={member}
                  self={member.userId === currentUserId}
                  // Only a superadmin touches an administrator or a superadmin (the API refuses a branch administrator who tries).
                  locked={!isSuperAdmin && (member.role === "ADMIN" || member.isSuperAdmin)}
                  can={standingCan[member.branchId] ?? { suspend: false, remove: false }}
                  isSuperAdmin={isSuperAdmin}
                  busy={busyUser === member.id}
                  onEdit={setEditing}
                  onDeactivate={setDeactivating}
                  onStanding={ask}
                  onSuperAdmin={setSuperAdminFor}
                  onReactivate={reactivate}
                  onHistory={(m) => setHistoryOf({ endpoint: `/api/v1/members/${m.id}/standing`, name: displayName(m) })}
                />
              ))}
            </Collection>
          )}

          {meta && (
            <Pager
              page={meta.page}
              pages={meta.pages}
              onPage={setPage}
              label="Pages of people"
              total={meta.total}
              size={layout.size}
              sizes={layout.sizes}
              onSize={layout.setSize}
            />
          )}
        </section>
      )}

      {tab === "invitations" && (
        <section role="tabpanel" id={panelId("users", "invitations")} aria-labelledby={tabId("users", "invitations")}>
          <InvitationsList invitations={invitations} busyId={busyInvitation} onResend={resend} onRevoke={revoke} />
        </section>
      )}

      <BulkInviteDialog
        key={`bulk-${bulk.key}`}
        open={bulk.open}
        onClose={() => setBulk((b) => ({ ...b, open: false }))}
        branches={branches}
        isSuperAdmin={isSuperAdmin}
        onSaved={async (count) => {
          setNotice({
            variant: "success",
            text: `${count} ${count === 1 ? "invitation" : "invitations"} created. The emails are on their way; each link works for 7 days.`,
          });
          await afterChange();
        }}
      />
      <InviteDialog
        key={inviteKey}
        open={inviting}
        onClose={() => setInviting(false)}
        branches={branches}
        roleOptions={roleOptionsFor(isSuperAdmin)}
        onInvited={(invitation) => {
          flushSync(() => setInviting(false)); // the dialog is closed (and focus handed back) before the lists are reloaded
          setNotice({ variant: "success", text: `Invitation sent to ${invitation.email}. The link works for 7 days.` });
          void afterChange();
        }}
      />
      <EditMemberDialog
        member={editing}
        onClose={() => setEditing(null)}
        branches={branches}
        roleOptions={roleOptionsFor(isSuperAdmin)}
        isSuperAdmin={isSuperAdmin}
        hasMfa={hasMfa}
        onSaved={(member, changed) => {
          flushSync(() => setEditing(null));
          setNotice({
            variant: "success",
            text: changed
              ? `Saved. ${displayName(member)} is now ${ROLE_LABELS[member.role]}${member.isSuperAdmin ? "" : ` at ${member.branchName}`}.`
              : "Nothing needed changing.",
          });
          void refresh();
        }}
      />
      <SuperAdminDialog
        member={superAdminFor}
        onClose={() => setSuperAdminFor(null)}
        onDone={(member, granted) => {
          flushSync(() => setSuperAdminFor(null));
          setNotice({
            variant: "success",
            text: granted ? `${displayName(member)} is now a superadmin.` : `${displayName(member)} is no longer a superadmin.`,
          });
          void afterChange();
        }}
      />
      <StandingDialog
        ask={standingAsk}
        onClose={() => setStandingAsk(null)}
        onDone={(text) => {
          flushSync(() => setStandingAsk(null));
          setNotice({ variant: "success", text });
          void afterChange();
        }}
      />
      <StandingHistoryDialog endpoint={historyOf?.endpoint ?? null} name={historyOf?.name ?? ""} onClose={() => setHistoryOf(null)} />
      <DeactivateDialog
        member={deactivating}
        onClose={() => setDeactivating(null)}
        onDone={(member, signedOut) => {
          flushSync(() => setDeactivating(null)); // the dialog is closed (and focus handed back) before the lists are reloaded
          setNotice({
            variant: "success",
            text: signedOut
              ? `${displayName(member)} was deactivated. They are signed out and lose access.`
              : `${displayName(member)} was deactivated in ${member.branchName}. They keep their other branches.`,
          });
          void afterChange();
        }}
      />
    </div>
  );
}
