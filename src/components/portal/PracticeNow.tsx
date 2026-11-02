"use client";

import { useState } from "react";
import { PracticeFinished } from "@/components/portal/PracticeFinished";
import { PracticeSession, type StartedSession } from "@/components/portal/PracticeSession";
import { PracticeSetup } from "@/components/portal/PracticeSetup";
import type { FinishedSession } from "@/components/portal/practiceModel";

// "Practise now": the setup, then the session, then its result, each taking the whole section. Presentation only.

type View = { kind: "setup" } | { kind: "session"; started: StartedSession } | { kind: "result"; result: FinishedSession };

export function PracticeNow({ studentId }: { studentId: string }) {
  const [view, setView] = useState<View>({ kind: "setup" });
  if (view.kind === "session") {
    return <PracticeSession studentId={studentId} started={view.started} onFinished={(result) => setView({ kind: "result", result })} />;
  }
  if (view.kind === "result") {
    return <PracticeFinished studentId={studentId} result={view.result} onAgain={() => setView({ kind: "setup" })} />;
  }
  return <PracticeSetup studentId={studentId} onStarted={(started) => setView({ kind: "session", started })} />;
}
