"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { getJson, sendJson } from "@/components/auth/postJson";
import { say, type BranchChoice, type Notice } from "@/components/academics/common";
import { SchemeForm, type SchemeBody, type SchemeInitial } from "@/components/academics/SchemeForm";

// The levels above a branch's own default scheme: the school-wide default (a superadmin sets it) and a scheme for one class group (an administrator of the branch).
// Marks use the most specific scheme that applies: a teacher's own for the subject, then the class group's, then the branch default, then the school-wide one.

type Scheme = { id: string; name: string; totalMax: number; examMax: number; components: { name: string; maxScore: number }[] };
type GlobalRow = { scopeId: string; isDefault: boolean; scheme: Scheme & { locked: boolean; archived: boolean } };
type Group = { id: string; name: string };
type Editing = { kind: "global" } | { kind: "group"; group: Group; scheme: Scheme | null } | null;

const describe = (s: Scheme) => `${s.components.map((c) => `${c.name} ${c.maxScore}`).join(" + ")} + Exam ${s.examMax} = ${s.totalMax}`;
const toInitial = (s: Scheme | null): SchemeInitial | null => (s ? { name: s.name, examMax: s.examMax, components: s.components } : null);

export function SchemeLevelsPanel({ branches, isSuperAdmin }: { branches: BranchChoice[]; isSuperAdmin: boolean }) {
  const adminBranches = branches.filter((b) => b.canEdit);
  const [branchId, setBranchId] = useState((adminBranches[0] ?? branches[0]).id);
  const branch = branches.find((b) => b.id === branchId) ?? branches[0];
  const [globals, setGlobals] = useState<GlobalRow[]>([]);
  const [groups, setGroups] = useState<(Group & { scheme: Scheme | null })[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [editing, setEditing] = useState<Editing>(null);

  const load = useCallback(async () => {
    const [g, c] = await Promise.all([
      isSuperAdmin ? getJson("/api/v1/academics/schemes/global") : Promise.resolve(null),
      getJson(`/api/v1/academics/class-groups?branchId=${encodeURIComponent(branchId)}`),
    ]);
    if (g?.ok) setGlobals((g.data!.schemes as GlobalRow[]).filter((x) => !x.scheme.archived));
    if (!c.ok) return setError(say(c, "Couldn't load the classes."));
    setError(null);
    const list = c.data!.classGroups as Group[];
    const schemes = await Promise.all(list.map((x) => getJson(`/api/v1/academics/schemes/class-group/${x.id}`)));
    setGroups(list.map((x, i) => ({ id: x.id, name: x.name, scheme: schemes[i].ok ? (schemes[i].data!.scheme as Scheme) : null })));
  }, [branchId, isSuperAdmin]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading on a branch change is exactly what this effect is for
    void load();
  }, [load]);

  const done = async (text: string) => {
    setEditing(null);
    setNotice({ variant: "success", text });
    await load();
  };
  const submit = (body: SchemeBody) => {
    if (editing?.kind === "global") return sendJson("/api/v1/academics/schemes/global", "POST", body);
    if (editing?.kind === "group") {
      const path = `/api/v1/academics/schemes/class-group/${editing.group.id}`;
      return editing.scheme ? sendJson(path, "PATCH", body) : sendJson(path, "POST", body);
    }
    return Promise.resolve({ ok: false, status: 0 });
  };

  return (
    <section aria-labelledby="levels-heading" className="space-y-6">
      <div>
        <h2 id="levels-heading" className="text-lg font-semibold tracking-tight text-fg">
          Scheme levels
        </h2>
        <p className="mt-1 text-sm text-fg-muted">
          Marks use the most specific scheme that applies: a teacher&apos;s own for the subject, then the class&apos;s, then the branch
          default above, then the school-wide one.
        </p>
      </div>
      <div aria-live="polite" className="empty:hidden">
        {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}
      </div>
      {isSuperAdmin && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold text-fg">School-wide default</h3>
            <Button onClick={() => setEditing({ kind: "global" })}>New school-wide scheme</Button>
          </div>
          {globals.length === 0 ? (
            <p className="mt-2 rounded-2xl border border-dashed border-line-strong p-5 text-center text-sm text-fg-muted">
              No school-wide scheme yet.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-surface">
              {globals.map((g) => (
                <li key={g.scopeId} className="p-4">
                  <p className="font-semibold text-fg">
                    {g.scheme.name} {g.isDefault && <span className="ml-2 text-xs text-ok-fg">Default</span>}
                  </p>
                  <p className="text-sm text-fg-muted">{describe(g.scheme)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div>
        <h3 className="font-semibold text-fg">A scheme for one class</h3>
        {branches.length > 1 && (
          <div className="mt-2 max-w-sm">
            <label htmlFor="levels-branch" className="mb-1.5 block text-xs font-semibold tracking-wide text-fg-2 uppercase">
              Branch
            </label>
            <select
              id="levels-branch"
              value={branchId}
              onChange={(e) => {
                setGroups(null);
                setBranchId(e.target.value);
              }}
              className="min-h-11 w-full rounded-xl border border-line bg-field px-4 text-sm text-fg"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {groups === null ? (
          <p className="mt-2 text-sm text-fg-muted" aria-busy="true">
            Loading…
          </p>
        ) : groups.length === 0 ? (
          <p className="mt-2 rounded-2xl border border-dashed border-line-strong p-5 text-center text-sm text-fg-muted">
            No classes in {branch.name} yet.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-surface">
            {groups.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-semibold text-fg">{g.name}</p>
                  <p className="text-sm text-fg-muted">
                    {g.scheme ? `${g.scheme.name}: ${describe(g.scheme)}` : "Uses the branch default"}
                  </p>
                </div>
                {branch.canEdit && (
                  <Button
                    variant="secondary"
                    onClick={() => setEditing({ kind: "group", group: g, scheme: g.scheme })}
                    aria-label={`${g.scheme ? "Change" : "Set"} the scheme for ${g.name}`}
                  >
                    {g.scheme ? "Change" : "Set a scheme"}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <SchemeForm
        key={editing?.kind === "group" ? `g-${editing.group.id}` : editing?.kind === "global" ? "global" : "none"}
        open={editing !== null}
        title={
          editing?.kind === "global" ? "New school-wide scheme" : editing?.kind === "group" ? `Scheme for ${editing.group.name}` : "Scheme"
        }
        description={
          editing?.kind === "group"
            ? `Applies to every subject of ${editing.group.name} in ${branch.name} that has no scheme of its own.`
            : undefined
        }
        initial={editing?.kind === "group" ? toInitial(editing.scheme) : null}
        askDefault={editing?.kind === "global"}
        onClose={() => setEditing(null)}
        onSubmit={submit}
        onDone={done}
      />
    </section>
  );
}
