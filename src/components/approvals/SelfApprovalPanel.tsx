"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import { getJson, sendJson } from "@/components/auth/postJson";
import { say, type BranchChoice, type Notice } from "@/components/academics/common";

// Who may approve their own marks (superadmin only). By default nobody but a superadmin can: an administrator who enters marks needs someone else to approve them.
// Granting an administrator this exception is a trade-off, said plainly here. A superadmin can also name a reviewer who is asked in their place; the administrator
// concerned is never shown who it is.

type Person = { userId: string; name: string | null; email: string | null };
type Grant = {
  id: string;
  adminUser: Person & { id: string };
  active: boolean;
  unseenReviewer: { id: string; name: string | null } | null;
};

export function SelfApprovalPanel({ branches }: { branches: BranchChoice[] }) {
  const [branchId, setBranchId] = useState(branches[0].id);
  const [admins, setAdmins] = useState<Person[] | null>(null);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [reviewer, setReviewer] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const load = useCallback(async () => {
    const [m, g] = await Promise.all([
      getJson(`/api/v1/members?role=ADMIN&branchId=${encodeURIComponent(branchId)}&limit=100`),
      getJson(`/api/v1/settings/self-approval?branchId=${encodeURIComponent(branchId)}`),
    ]);
    const bad = [m, g].find((r) => !r.ok);
    if (bad) return setError(say(bad, "Couldn't load this branch."));
    setError(null);
    setAdmins(m.data!.members as Person[]);
    setGrants(g.data!.grants as Grant[]);
  }, [branchId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading on a branch change is exactly what this effect is for
    void load();
  }, [load]);

  const grantOf = (userId: string) => grants.find((g) => g.adminUser.id === userId && g.active);
  async function grant(p: Person) {
    const r = await sendJson("/api/v1/settings/self-approval", "POST", {
      branchId,
      adminUserId: p.userId,
      unseenReviewerUserId: reviewer[p.userId] || null,
    });
    setNotice(
      r.ok
        ? { variant: "success", text: `${p.name ?? p.email} may now approve their own marks.` }
        : { variant: "error", text: say(r, "That didn't work.") },
    );
    await load();
  }
  async function revoke(p: Person) {
    const r = await sendJson("/api/v1/settings/self-approval", "DELETE", { branchId, adminUserId: p.userId });
    setNotice(
      r.ok
        ? { variant: "success", text: `${p.name ?? p.email} can no longer approve their own marks.` }
        : { variant: "error", text: say(r, "That didn't work.") },
    );
    await load();
  }

  return (
    <div className="space-y-6">
      <Alert variant="info">
        <p>
          <strong>The trade-off.</strong> Letting an administrator approve their own marks saves a step in a small branch, but nobody else
          checks those marks before parents see them. Every approval is still recorded against their name. You can name a reviewer who is
          asked in their place; they are never told who.
        </p>
      </Alert>
      {branches.length > 1 && (
        <SelectField
          label="Branch"
          value={branchId}
          onChange={(e) => {
            setAdmins(null);
            setBranchId(e.target.value);
          }}
          options={branches.map((b) => ({ value: b.id, label: b.name }))}
        />
      )}
      <div aria-live="polite" className="empty:hidden">
        {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}
      </div>
      {admins === null ? (
        <p className="text-sm text-fg-muted" aria-busy="true">
          Loading…
        </p>
      ) : admins.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-6 text-center text-sm text-fg-muted">
          This branch has no administrators.
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {admins.map((p) => {
            const g = grantOf(p.userId);
            const label = p.name ?? p.email ?? "Administrator";
            return (
              <li key={p.userId} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-semibold text-fg">{label}</p>
                  <p className="text-sm text-fg-muted">
                    {g
                      ? `May approve their own marks${g.unseenReviewer ? ` · reviewer: ${g.unseenReviewer.name ?? "chosen"}` : ""}`
                      : "Needs someone else to approve their marks"}
                  </p>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  {!g && admins.length > 1 && (
                    <SelectField
                      label={`Reviewer for ${label} (optional)`}
                      value={reviewer[p.userId] ?? ""}
                      onChange={(e) => setReviewer((all) => ({ ...all, [p.userId]: e.target.value }))}
                      options={[
                        { value: "", label: "No named reviewer" },
                        ...admins
                          .filter((a) => a.userId !== p.userId)
                          .map((a) => ({ value: a.userId, label: a.name ?? a.email ?? "Administrator" })),
                      ]}
                    />
                  )}
                  {g ? (
                    <Button variant="secondary" onClick={() => void revoke(p)} aria-label={`Withdraw ${label}'s permission`}>
                      Withdraw
                    </Button>
                  ) : (
                    <Button onClick={() => void grant(p)} aria-label={`Allow ${label} to approve their own marks`}>
                      Allow
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
