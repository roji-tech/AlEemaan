"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { getJson, sendJson } from "@/components/auth/postJson";
import { say, type Notice } from "@/components/academics/common";
import type { SwitchesView } from "@/lib/settings/ceiling-switch";

// A yes/no setting under the ceiling rule (tasks 0040, 0043, 0045), as a Settings tab: the school's value is the ceiling and each branch can only turn it off. One screen for every
// such switch; what differs is the endpoint and the words. A super admin sets the school's value; the same API lets a branch administrator narrow their own branch. The server
// decides; this screen only asks and shows what it says.

export type SwitchCopy = {
  endpoint: string;
  title: string;
  intro: string;
  /// The school's state as a headline, and the sentences after turning it off or on.
  schoolOn: string;
  schoolOff: string;
  schoolDoneOn: string;
  schoolDoneOff: string;
  /// A branch's state after its name: "takes part", "off, set by the school", ...
  branchOn: string;
  branchOffBySchool: string;
  branchOffByBranch: string;
  turnOffBranchLabel: (branchName: string) => string;
  turnOnBranchLabel: (branchName: string) => string;
  branchDoneOff: (branchName: string) => string;
  branchDoneOn: (branchName: string) => string;
  /// Distinguishes the ids of two panels (a test selects by the school-state id).
  idPrefix: string;
};

export function SwitchSettingsPanel({ copy }: { copy: SwitchCopy }) {
  const [view, setView] = useState<SwitchesView | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const reply = await getJson(copy.endpoint, signal);
      if (signal?.aborted) return;
      if (!reply.ok) return setFailed(say(reply, "The setting couldn't be loaded."));
      setFailed(null);
      setView(reply.data as unknown as SwitchesView);
    },
    [copy.endpoint],
  );

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load once on arrival
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function set(key: string, body: Record<string, unknown>, done: string) {
    setBusy(key);
    const reply = await sendJson(copy.endpoint, "PATCH", body);
    setBusy(null);
    setNotice(reply.ok ? { variant: "success", text: done } : { variant: "error", text: say(reply, "That didn't work.") });
    if (reply.ok) setView(reply.data as unknown as SwitchesView);
  }

  if (failed) return <Alert variant="error">{failed}</Alert>;
  if (!view) return <p className="text-sm text-fg-muted">Loading…</p>;
  const schoolOn = view.school.effective;
  const stateId = `${copy.idPrefix}-school-state`;

  return (
    <div className="space-y-5">
      {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
      <Card className="space-y-3">
        <h2 className="text-lg font-semibold text-fg">{copy.title}</h2>
        <p className="text-sm text-fg-muted">{copy.intro}</p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-fg" id={stateId}>
            {schoolOn ? copy.schoolOn : copy.schoolOff}
          </p>
          {view.canEditSchool && (
            <Button
              variant="secondary"
              aria-describedby={stateId}
              loading={busy === "school"}
              onClick={() => void set("school", { scope: "GLOBAL", enabled: !schoolOn }, schoolOn ? copy.schoolDoneOff : copy.schoolDoneOn)}
            >
              {schoolOn ? "Turn off for the school" : "Turn on for the school"}
            </Button>
          )}
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-lg font-semibold text-fg">Branches</h2>
        <ul className="space-y-2">
          {view.branches.map((branch) => {
            const decidedBySchool = !schoolOn;
            return (
              <li
                key={branch.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-3 py-2 text-sm"
              >
                <span className="min-w-0 text-fg">
                  <span className="font-semibold">{branch.name}</span>
                  <span className="text-fg-muted">
                    {" "}
                    · {branch.effective ? copy.branchOn : decidedBySchool ? copy.branchOffBySchool : copy.branchOffByBranch}
                  </span>
                </span>
                {branch.canEdit && !decidedBySchool && (
                  <Button
                    variant="ghost"
                    aria-label={branch.effective ? copy.turnOffBranchLabel(branch.name) : copy.turnOnBranchLabel(branch.name)}
                    loading={busy === branch.id}
                    onClick={() =>
                      void set(
                        branch.id,
                        { scope: "BRANCH", branchId: branch.id, enabled: branch.effective ? false : null },
                        branch.effective ? copy.branchDoneOff(branch.name) : copy.branchDoneOn(branch.name),
                      )
                    }
                  >
                    {branch.effective ? "Turn off" : "Turn back on"}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
