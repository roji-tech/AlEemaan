"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { SelectField } from "@/components/ui/SelectField";
import { getJson, sendJson } from "@/components/auth/postJson";
import { DEFAULT_PORTAL_ACCESS, portalAccessProblems, type Access, type Capability, type PortalAccess, type PracticeLevel } from "@/lib/portal/access";

// What a pupil and a guardian may do in the portal, one branch at a time (task 0040). Superadmin only, on the Settings page. The server decides; this screen only asks for the
// whole value and shows what the server says.

const AREAS: { key: Capability; label: string; hint?: string }[] = [
  { key: "overview", label: "Overview", hint: "Attendance and announcements." },
  { key: "results", label: "Academic results and report cards" },
  { key: "invoices", label: "Fees and invoices", hint: "Also hides the fee totals from the overview and results." },
  { key: "materials", label: "Coursework and learning materials", hint: "Reading only." },
  { key: "submitWork", label: "Hand in assignments" },
  { key: "takeQuizzes", label: "Take quizzes" },
  { key: "siblings", label: "Other children who share the guardian's contact" },
];
const ACTORS = [
  { key: "pupil", label: "Pupil" },
  { key: "guardian", label: "Guardian" },
] as const;
const PRACTICE_OPTIONS: { value: PracticeLevel; label: string }[] = [
  { value: "NONE", label: "Nothing" },
  { value: "SUMMARY", label: "A summary only" },
  { value: "FULL", label: "Full practice" },
];

type Branch = { id: string; name: string };
type HistoryRow = { id: string; at: string; by: string; widening: boolean };
type Loaded = { access: PortalAccess; history: HistoryRow[]; ceiling?: PracticeLevel };
const RANK: PracticeLevel[] = ["NONE", "SUMMARY", "FULL"];

const clone = (value: PortalAccess): PortalAccess => JSON.parse(JSON.stringify(value));
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

export function PortalAccessPanel({ branches }: { branches: Branch[] }) {
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [saved, setSaved] = useState<PortalAccess | null>(null);
  const [draft, setDraft] = useState<PortalAccess | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [ceiling, setCeiling] = useState<PracticeLevel>("FULL");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const summary = useRef<HTMLDivElement>(null);

  const apply = (loaded: Loaded) => {
    setSaved(loaded.access);
    setDraft(clone(loaded.access));
    setHistory(loaded.history);
    if (loaded.ceiling) setCeiling(loaded.ceiling);
  };

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setLoadError(null);
    setMessage(null);
    const reply = await getJson(`/api/v1/settings/portal-access?branchId=${encodeURIComponent(id)}`);
    setLoading(false);
    if (!reply.ok || !reply.data) {
      setLoadError(reply.message || "We couldn't load this branch's portal access.");
      return;
    }
    apply({
      access: reply.data.access as PortalAccess,
      history: reply.data.history as HistoryRow[],
      ceiling: reply.data.guardianPracticeCeiling as PracticeLevel | undefined,
    });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading the branch's value on a branch change is exactly what this effect is for
    if (branchId) void load(branchId);
  }, [branchId, load]);

  const dirty = saved !== null && draft !== null && JSON.stringify(saved) !== JSON.stringify(draft);

  const set = (actor: "pupil" | "guardian", change: Partial<Access>) => {
    setMessage(null);
    setDraft((current) => (current ? { ...current, [actor]: { ...current[actor], ...change } } : current));
  };

  const save = async () => {
    if (!draft) return;
    const problem = portalAccessProblems(draft)[0];
    if (problem) {
      setMessage({ kind: "error", text: problem.message });
      return;
    }
    setSaving(true);
    setMessage(null);
    const reply = await sendJson("/api/v1/settings/portal-access", "PATCH", { branchId, access: draft });
    setSaving(false);
    if (!reply.ok || !reply.data) {
      setMessage({ kind: "error", text: reply.message || "Nothing was changed. Please try again." });
      return;
    }
    apply({ access: reply.data.access as PortalAccess, history: reply.data.history as HistoryRow[] });
    setMessage({ kind: "success", text: reply.data.changed ? "Saved. It applies to every portal sign-in from now on." : "Nothing was different, so nothing was changed." });
    summary.current?.focus();
  };

  if (branches.length === 0) {
    return (
      <Card className="max-w-3xl">
        <p className="text-sm text-fg-muted">There is no branch yet, so there is no portal to set up.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="max-w-3xl space-y-5">
        <div>
          <h2 className="text-lg font-bold text-fg">Portal access</h2>
          <p className="mt-1 text-sm text-fg-muted">
            A pupil signs in to the portal with their date of birth; a guardian with their phone number or e-mail address, or from the link they were sent. Choose what each may do.
            It is set for one branch at a time and applies at once, also to people who are already signed in.
          </p>
        </div>

        <div className="w-full sm:w-72">
          <SelectField label="Branch" value={branchId} onChange={(e) => setBranchId(e.target.value)} options={branches.map((b) => ({ value: b.id, label: b.name }))} />
        </div>

        {loading && (
          <p role="status" className="text-sm text-fg-muted">
            Loading portal access…
          </p>
        )}
        {loadError && (
          <div className="space-y-3">
            <Alert variant="error">{loadError}</Alert>
            <Button variant="secondary" onClick={() => void load(branchId)}>
              Try again
            </Button>
          </div>
        )}

        {draft && !loading && !loadError && (
          <>
            <div ref={summary} tabIndex={-1} className="focus:outline-none">
              {message && <Alert variant={message.kind === "success" ? "success" : "error"}>{message.text}</Alert>}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[22rem] border-collapse text-left text-sm">
                <caption className="sr-only">What each person may do in the portal of this branch</caption>
                <thead>
                  <tr className="border-b border-line text-xs font-semibold tracking-wide text-fg-2 uppercase">
                    <th scope="col" className="py-2 pr-3">
                      Area
                    </th>
                    {ACTORS.map((actor) => (
                      <th key={actor.key} scope="col" className="px-3 py-2 text-center">
                        {actor.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {AREAS.map((area) => (
                    <tr key={area.key} className="border-b border-line align-middle">
                      <th scope="row" className="py-2 pr-3 font-medium text-fg">
                        {area.label}
                        {area.hint && <span className="block text-xs font-normal text-fg-muted">{area.hint}</span>}
                      </th>
                      {ACTORS.map((actor) => (
                        <td key={actor.key} className="px-3 py-1">
                          <div className="flex justify-center">
                            <CheckboxField
                              checked={draft[actor.key][area.key]}
                              onChange={(e) => set(actor.key, { [area.key]: e.target.checked })}
                              label={<span className="sr-only">{`${actor.label}: ${area.label}`}</span>}
                              className="min-h-11"
                            />
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="align-middle">
                    <th scope="row" className="py-2 pr-3 font-medium text-fg">
                      Question practice
                      <span className="block text-xs font-normal text-fg-muted">What a guardian gets is the lower of this and the school-wide ceiling set in the question bank settings (now: {PRACTICE_OPTIONS.find((o) => o.value === ceiling)?.label.toLowerCase()}).</span>
                    </th>
                    {ACTORS.map((actor) => (
                      <td key={actor.key} className="px-3 py-2">
                        <SelectField
                          label={`${actor.label}: question practice`}
                          hideLabel
                          value={draft[actor.key].practice}
                          onChange={(e) => set(actor.key, { practice: e.target.value as PracticeLevel })}
                          options={PRACTICE_OPTIONS}
                        />
                        {actor.key === "guardian" && RANK.indexOf(draft.guardian.practice) > RANK.indexOf(ceiling) && (
                          <p className="mt-1 text-xs text-fg-muted">The school-wide ceiling lowers this: guardians here get {PRACTICE_OPTIONS.find((o) => o.value === ceiling)?.label.toLowerCase()}.</p>
                        )}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button onClick={() => void save()} loading={saving} disabled={!dirty}>
                Save changes
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setMessage(null);
                  setDraft(clone(DEFAULT_PORTAL_ACCESS));
                }}
                disabled={saving}
              >
                Use the recommended settings
              </Button>
              {dirty && (
                <Button variant="ghost" onClick={() => setDraft(saved ? clone(saved) : draft)} disabled={saving}>
                  Discard changes
                </Button>
              )}
            </div>
          </>
        )}
      </Card>

      {draft && !loading && !loadError && (
        <Card className="max-w-3xl space-y-3">
          <h3 className="text-base font-bold text-fg">Recent changes</h3>
          {history.length === 0 ? (
            <p className="text-sm text-fg-muted">Nothing has been changed for this branch. The recommended settings apply.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {history.map((row) => (
                <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                  <span className="text-fg">
                    {row.by}
                    {row.widening && <span className="ml-2 rounded-md bg-warn-bg px-2 py-0.5 text-xs font-semibold text-warn-fg">Gave more access</span>}
                  </span>
                  <time dateTime={row.at} className="text-fg-muted">
                    {when(row.at)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
