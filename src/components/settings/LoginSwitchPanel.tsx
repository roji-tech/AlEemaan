"use client";

import { useRef, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { sendJson } from "@/components/auth/postJson";
import { say } from "@/components/academics/common";
import { describeChange, type BranchChange, type BranchLoginRow, type BranchSwitches } from "@/lib/auth/login-switch-rules";

// Student and parent sign-in, per branch (task 0091): a row for every branch the person may switch, each with two switches (students, parents), off until turned on. An administrator is shown only
// their own branches (one row when they have one); a superadmin is shown every branch and, with `canBulk`, can select several (or all) and turn a switch on or off for them in one go.
//
// A switch applies when it is pressed (one request, one branch), like the other switches on the Settings page; it is not saved with a separate button, so what the screen shows is always what is
// stored. The server decides who may change what and answers with what it changed; this panel only asks and tells the person that answer, in a live region. Turning a switch off signs the
// branch's students (or parents) out on their next click, but deletes nothing: turning it on again lets them straight back in with the session they had.

type Props = { initial: BranchLoginRow[]; canBulk: boolean };
type Body = { branchIds: string[]; studentLoginEnabled?: boolean; parentLoginEnabled?: boolean };

const BULK: { label: string; key: keyof BranchSwitches; value: boolean }[] = [
  { label: "Turn on student sign-in", key: "studentLoginEnabled", value: true },
  { label: "Turn off student sign-in", key: "studentLoginEnabled", value: false },
  { label: "Turn on parent sign-in", key: "parentLoginEnabled", value: true },
  { label: "Turn off parent sign-in", key: "parentLoginEnabled", value: false },
];

export function LoginSwitchPanel({ initial, canBulk }: Props) {
  const [rows, setRows] = useState<BranchLoginRow[]>(initial);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // A second press before the first has answered must not send a second request (state is not updated until the next render).
  const inFlight = useRef(false);

  async function apply(body: Body) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setDone(null);
    setProblem(null);
    const reply = await sendJson("/api/v1/settings/login-switches", "PATCH", body);
    inFlight.current = false;
    setBusy(false);
    if (!reply.ok || !reply.data) {
      setProblem(`${say(reply, "That didn't work.")} Nothing was changed.`);
      return;
    }
    const returned = reply.data.branches as unknown as BranchLoginRow[];
    const changes = reply.data.changes as unknown as BranchChange[];
    setRows((current) => current.map((row) => returned.find((branch) => branch.id === row.id) ?? row));
    setDone(describeChange(changes));
  }

  const toggleSelected = (id: string, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <Card className="max-w-3xl space-y-5" aria-busy={busy}>
      <div>
        <h2 className="text-lg font-bold text-fg">Student and parent sign-in</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Both are off for a branch until you turn them on, so its students and parents stay out until the branch is ready for them. A
          student or parent can sign in, and stay signed in, only through a branch where it is on for them; if you turn it off, they are
          signed out on their next click, and turning it on again lets them straight back in. Staff accounts are never affected. This is
          only about accounts that sign in with an email address and a password; the result portal that uses a student&apos;s admission
          number is not affected. Every change is recorded.
        </p>
      </div>

      {/* A live region that is always in the page, so that what is put in it is announced: what changed, and where. */}
      <div role="status" aria-live="polite" aria-atomic="true" className="empty:hidden">
        {done && (
          <Alert variant="success" announce={false}>
            {done}
          </Alert>
        )}
      </div>
      {problem && <Alert variant="error">{problem}</Alert>}

      {rows.length === 0 ? (
        <p className="text-sm text-fg-muted">There is no branch you can change.</p>
      ) : (
        <>
          {canBulk && (
            <div className="space-y-3 rounded-xl border border-line bg-field p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-fg">Change several branches at once</h3>
                  <p className="text-sm text-fg-muted">
                    {selected.size} of {rows.length} selected
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => setSelected(new Set(rows.map((row) => row.id)))}>
                    Select all
                  </Button>
                  <Button variant="ghost" onClick={() => setSelected(new Set())}>
                    Clear
                  </Button>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {BULK.map((action) => (
                  <Button
                    key={action.label}
                    variant="secondary"
                    disabled={selected.size === 0}
                    onClick={() =>
                      void apply({ branchIds: rows.filter((row) => selected.has(row.id)).map((row) => row.id), [action.key]: action.value })
                    }
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <ul className="space-y-3" aria-label="Branches">
            {rows.map((row) => (
              <li key={row.id} className="rounded-xl border border-line p-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div className="flex min-w-0 items-center gap-2">
                    {canBulk && (
                      <CheckboxField
                        label={<span className="sr-only">{`Select ${row.name} for a change to several branches`}</span>}
                        checked={selected.has(row.id)}
                        onChange={(event) => toggleSelected(row.id, event.target.checked)}
                        className="shrink-0"
                      />
                    )}
                    <h3 className="min-w-0 text-base font-semibold break-words text-fg">{row.name}</h3>
                  </div>
                  <div className="flex flex-wrap gap-x-6">
                    <CheckboxField
                      name={`student-${row.id}`}
                      label={
                        <>
                          Students can sign in<span className="sr-only">{` to ${row.name}`}</span>
                        </>
                      }
                      checked={row.studentLoginEnabled}
                      onChange={(event) => void apply({ branchIds: [row.id], studentLoginEnabled: event.target.checked })}
                    />
                    <CheckboxField
                      name={`parent-${row.id}`}
                      label={
                        <>
                          Parents can sign in<span className="sr-only">{` to ${row.name}`}</span>
                        </>
                      }
                      checked={row.parentLoginEnabled}
                      onChange={(event) => void apply({ branchIds: [row.id], parentLoginEnabled: event.target.checked })}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
