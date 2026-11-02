"use client";

import { useState } from "react";
import { PracticeFinished } from "@/components/portal/PracticeFinished";
import { PracticeSession, type StartedSession } from "@/components/portal/PracticeSession";
import { PracticeSetup } from "@/components/portal/PracticeSetup";
import type { FinishedSession } from "@/components/portal/practiceModel";

// "Practise now": the setup, then the session, then its result, each taking the whole section. A session left open and carried on from the history starts at the session. Presentation only.

type View = { kind: "setup" } | { kind: "session"; started: StartedSession } | { kind: "result"; result: FinishedSession };

export function PracticeNow({ studentId, resume }: { studentId: string; resume?: StartedSession | null }) {
  const [view, setView] = useState<View>(resume ? { kind: "session", started: resume } : { kind: "setup" });
  if (view.kind === "session") {
    return <PracticeSession studentId={studentId} started={view.started} onFinished={(result) => setView({ kind: "result", result })} />;
  }
  if (view.kind === "result") {
    return <PracticeFinished studentId={studentId} result={view.result} onAgain={() => setView({ kind: "setup" })} />;
  }
  return <PracticeSetup studentId={studentId} onStarted={(started) => setView({ kind: "session", started })} />;
}
