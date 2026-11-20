"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { GENERIC_ERROR, getJson, sendJson } from "@/components/auth/postJson";
import { GuardianSlipCard, SlipCard, SlipSheet, type AccessSlip, type GuardianSlip, type SignIn } from "./AccessSlips";
import { codeText } from "./model";

// A pupil's access codes (task 0113 D7; task 0094 D9: "the Students screen's Access code dialog shows both and regenerates each on its own"): the pupil code, and each guardian's code (one
// per guardian, for all their children). A new code is shown ONCE, with a slip to print; the old one stops at once and its owner's open sessions end. A guardian whose children are in a
// branch this administrator does not run has their code made by a superadmin (task 0113 D4).

type Status = {
  name: string;
  pupil: string | null;
  guardians: { guardianId: string; name: string; isMain: boolean; blocked: boolean; codeAt: string | null; canAct: boolean }[];
  branch: { name: string; studentOpen: boolean; parentOpen: boolean; legacy: boolean };
  signIn: SignIn;
};

export function AccessCodesDialog({
  pupil,
  onClose,
  onChanged,
}: {
  pupil: { id: string; name: string } | null;
  onClose: () => void;
  onChanged: (text: string) => void;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pupilSlip, setPupilSlip] = useState<AccessSlip | null>(null);
  const [guardianSlips, setGuardianSlips] = useState<GuardianSlip[]>([]);

  const load = useCallback(async (id: string) => {
    const reply = await getJson(`/api/v1/students/${id}/access-codes`);
    if (reply.ok) {
      setStatus(reply.data as Status);
      setError(null);
    } else setError(reply.message ?? GENERIC_ERROR);
  }, []);

  useEffect(() => {
    if (!pupil) return;
    /* eslint-disable react-hooks/set-state-in-effect -- a newly opened pupil starts from a clean dialog: codes from before are never shown again */
    setStatus(null);
    setPupilSlip(null);
    setGuardianSlips([]);
    setError(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    void load(pupil.id);
  }, [pupil, load]);

  async function newPupilCode() {
    if (!pupil) return;
    setBusy("pupil");
    const reply = await sendJson(`/api/v1/students/${pupil.id}/access-codes`, "POST", { which: "pupil" });
    setBusy(null);
    if (!reply.ok) return setError(reply.message ?? GENERIC_ERROR);
    setPupilSlip((reply.data as { slip: AccessSlip }).slip);
    await load(pupil.id);
    onChanged(`A new pupil code was made for ${pupil.name}. The earlier one no longer works.`);
  }

  async function newGuardianCode(g: Status["guardians"][number]) {
    if (!pupil) return;
    setBusy(g.guardianId);
    const reply = await sendJson(`/api/v1/guardians/${g.guardianId}/access-code`, "POST", {});
    setBusy(null);
    if (!reply.ok) return setError(reply.message ?? GENERIC_ERROR);
    const data = reply.data as { guardianName: string; code: string; children: GuardianSlip["children"] };
    setGuardianSlips((all) => [
      ...all.filter((s) => s.guardianName !== data.guardianName),
      { guardianName: data.guardianName, code: data.code, children: data.children },
    ]);
    await load(pupil.id);
    onChanged(`A new code was made for ${data.guardianName}. Their earlier code no longer works.`);
  }

  const signIn = status?.signIn ?? { pupil: null, guardian: null, school: null };
  const made = Boolean(pupilSlip) || guardianSlips.length > 0;

  return (
    <Dialog open={pupil !== null} onClose={onClose} title={pupil ? `Access codes of ${pupil.name}` : "Access codes"} wide>
      <div className="space-y-5">
        {error && <Alert variant="error">{error}</Alert>}
        {!status ? (
          !error && <p className="text-sm text-fg-muted">Loading…</p>
        ) : (
          <>
            {(!status.branch.studentOpen || !status.branch.parentOpen) && (
              <Alert variant="info">
                {!status.branch.studentOpen && !status.branch.parentOpen
                  ? `Pupil and guardian sign-in are switched off for ${status.branch.name}: the codes work once they are switched on.`
                  : !status.branch.studentOpen
                    ? `Pupil sign-in is switched off for ${status.branch.name}: the pupil code works once it is switched on.`
                    : `Guardian sign-in is switched off for ${status.branch.name}: guardian codes work once it is switched on.`}
              </Alert>
            )}
            <ul aria-label="Codes" className="divide-y divide-line rounded-2xl border border-line">
              <li className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div>
                  <p className="font-semibold text-fg">Pupil code</p>
                  <p className="text-sm text-fg-muted">{codeText(status.pupil)}</p>
                </div>
                <Button variant="secondary" loading={busy === "pupil"} onClick={() => void newPupilCode()}>
                  {status.pupil ? "New pupil code" : "Make pupil code"}
                </Button>
              </li>
              {status.guardians.map((g) => (
                <li key={g.guardianId} className="flex flex-wrap items-center justify-between gap-3 p-3">
                  <div>
                    <p className="font-semibold text-fg">
                      {g.name}
                      {g.isMain ? " (main contact)" : ""}
                    </p>
                    <p className="text-sm text-fg-muted">
                      {g.blocked ? "Blocked from this pupil" : codeText(g.codeAt)}
                      {!g.canAct ? ". Has children in a branch you do not run: a superadmin makes this code." : ""}
                    </p>
                  </div>
                  {g.canAct && !g.blocked && (
                    <Button
                      variant="secondary"
                      loading={busy === g.guardianId}
                      onClick={() => void newGuardianCode(g)}
                      aria-label={`${g.codeAt ? "New code" : "Make code"} for ${g.name}`}
                    >
                      {g.codeAt ? "New code" : "Make code"}
                    </Button>
                  )}
                </li>
              ))}
              {status.guardians.length === 0 && (
                <li className="p-3 text-sm text-fg-muted">No guardian yet: add one under Guardians in the pupil&apos;s Actions list.</li>
              )}
            </ul>
          </>
        )}
        {made && (
          <section aria-labelledby="new-codes" className="space-y-3">
            <h3 id="new-codes" className="text-sm font-semibold text-fg">
              New codes (shown once)
            </h3>
            <Alert variant="info">Print or copy them now: they are not kept, and closing this shows them no more.</Alert>
            <ul className="space-y-3">
              {pupilSlip && <SlipCard slip={pupilSlip} signIn={signIn} />}
              {guardianSlips.map((s) => (
                <GuardianSlipCard key={s.guardianName} slip={s} signIn={signIn} />
              ))}
            </ul>
            <Button variant="secondary" onClick={() => window.print()}>
              Print the slips
            </Button>
            <SlipSheet>
              {pupilSlip && <SlipCard slip={pupilSlip} signIn={signIn} />}
              {guardianSlips.map((s) => (
                <GuardianSlipCard key={s.guardianName} slip={s} signIn={signIn} />
              ))}
            </SlipSheet>
          </section>
        )}
        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
