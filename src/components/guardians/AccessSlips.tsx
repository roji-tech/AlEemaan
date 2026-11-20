"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// Printable access slips (task 0113 D7, D8): a pupil half and a guardian half, so the school can hand each to its own person. Drawn twice: on screen in the dialog that made the codes, and
// into a print-only sheet at the end of <body> (`data-slip-sheet`): while that sheet exists, printing prints it alone (globals.css). The codes exist only in this page's memory: they are
// shown once and never stored.

export type SignIn = { pupil: string | null; guardian: string | null; school: string | null };
export type AccessSlip = {
  studentId: string;
  name: string;
  admissionNo: string;
  className: string | null;
  branchName: string;
  pupilCode?: string;
  guardianName?: string;
  guardianCode?: string;
  family?: string[];
  guardianNote?: string;
};
export type GuardianSlip = {
  guardianName: string;
  code: string;
  children: { name: string; admissionNo: string; className: string | null; branchName: string }[];
};

const where = (address: string | null, school: string | null) => address ?? school ?? "the school's website";

function PupilHalf({ slip, signIn }: { slip: AccessSlip; signIn: SignIn }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold tracking-wide text-fg-muted uppercase">For the pupil</p>
      <p className="font-semibold text-fg">{slip.name}</p>
      <p className="text-sm text-fg-muted">
        Admission number <span className="font-mono text-fg">{slip.admissionNo}</span>
        {slip.className ? ` · ${slip.className}` : ""} · {slip.branchName}
      </p>
      <p className="text-sm">
        Pupil code <span className="font-mono text-lg font-bold tracking-wider text-fg">{slip.pupilCode}</span>
      </p>
      <p className="text-xs text-fg-muted">Sign in at {where(signIn.pupil, signIn.school)} with the admission number and this code.</p>
    </div>
  );
}

function GuardianHalf({ slip, signIn }: { slip: AccessSlip; signIn: SignIn }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold tracking-wide text-fg-muted uppercase">
        For the guardian{slip.guardianName ? `: ${slip.guardianName}` : ""}
      </p>
      {slip.guardianCode ? (
        <p className="text-sm">
          Guardian code <span className="font-mono text-lg font-bold tracking-wider text-fg">{slip.guardianCode}</span>
        </p>
      ) : null}
      {slip.guardianNote && <p className="text-sm text-fg">{slip.guardianNote}</p>}
      {slip.family && slip.family.length > 0 && (
        <p className="text-xs text-fg-muted">The same code also opens: {slip.family.join(", ")}.</p>
      )}
      <p className="text-xs text-fg-muted">
        Sign in at {where(signIn.guardian, signIn.school)} with {slip.name}&apos;s admission number ({slip.admissionNo}), or any of your
        children&apos;s, and the guardian code.
      </p>
    </div>
  );
}

/// One pupil's slip: the halves that were made (a class sheet of pupil codes only has no guardian half).
export function SlipCard({ slip, signIn }: { slip: AccessSlip; signIn: SignIn }) {
  const guardian = Boolean(slip.guardianCode || slip.guardianNote);
  return (
    <li className="break-inside-avoid rounded-xl border border-dashed border-line-strong p-4">
      <div className={`grid gap-4 ${slip.pupilCode && guardian ? "sm:grid-cols-2 print:grid-cols-2" : ""}`}>
        {slip.pupilCode && <PupilHalf slip={slip} signIn={signIn} />}
        {guardian && <GuardianHalf slip={slip} signIn={signIn} />}
      </div>
    </li>
  );
}

/// A guardian's own slip (Users > Guardians, or a pupil's Access codes): one code, every child it opens.
export function GuardianSlipCard({ slip, signIn }: { slip: GuardianSlip; signIn: SignIn }) {
  return (
    <li className="break-inside-avoid rounded-xl border border-dashed border-line-strong p-4">
      <p className="text-xs font-semibold tracking-wide text-fg-muted uppercase">For the guardian</p>
      <p className="font-semibold text-fg">{slip.guardianName}</p>
      <p className="text-sm">
        Guardian code <span className="font-mono text-lg font-bold tracking-wider text-fg">{slip.code}</span>
      </p>
      {slip.children.length > 0 ? (
        <ul className="mt-1 text-sm text-fg-muted">
          {slip.children.map((c) => (
            <li key={c.admissionNo}>
              {c.name}: admission number <span className="font-mono text-fg">{c.admissionNo}</span>
              {c.className ? ` · ${c.className}` : ""} · {c.branchName}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fg-muted">No child is linked to this guardian yet, so the code opens nothing until one is.</p>
      )}
      <p className="mt-1 text-xs text-fg-muted">
        Sign in at {where(signIn.guardian, signIn.school)} with any of these admission numbers and this code.
      </p>
    </li>
  );
}

/// The print-only copy, at the end of <body> while it is mounted.
export function SlipSheet({ children }: { children: React.ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the portal target exists only in the browser, after mount
    setHost(document.body);
  }, []);
  if (!host) return null;
  return createPortal(
    <div data-slip-sheet className="hidden bg-white p-2 text-black print:block">
      <ul className="space-y-3">{children}</ul>
    </div>,
    host,
  );
}
