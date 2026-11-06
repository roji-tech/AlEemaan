"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { ArrowLeftIcon } from "@/components/ui/icons";
import { getJson, sendJson } from "@/components/auth/postJson";
import { say, type Notice } from "@/components/academics/common";
import { SectionTabs } from "@/components/forms/SectionTabs";
import { ProgramAssessmentsTab } from "@/components/programs/ProgramAssessmentsTab";
import { ProgramAttendanceTab } from "@/components/programs/ProgramAttendanceTab";
import { ProgramFeesTab } from "@/components/programs/ProgramFeesTab";
import { ProgramBadge } from "@/components/programs/ProgramBadge";
import { ProgramCompletionTab } from "@/components/programs/ProgramCompletionTab";
import { ProgramOverview } from "@/components/programs/ProgramOverview";
import { ProgramPeopleTab } from "@/components/programs/ProgramPeopleTab";
import { ProgramSettingsTab } from "@/components/programs/ProgramSettingsTab";
import { ProgramStaffTab } from "@/components/programs/ProgramStaffTab";
import { ProgramStructure } from "@/components/programs/ProgramStructure";
import { headlineText, type ProgramDetail } from "@/components/programs/model";

// One program: Overview, Structure, People and Staff, and from slice P3 Attendance (shown only while attendance is on and the person reaches a group) and Settings (the program's own
// attendance switch, for a super admin and a program admin). A tab that would say "soon" is a dead end, so a tab appears only when it does something.
// Presentation only: the API decides who sees the program and what each button may do (`can`), and checks again on every request.

type SectionId = "overview" | "structure" | "people" | "staff" | "attendance" | "assessments" | "fees" | "completion" | "settings";

function sectionsFor(program: ProgramDetail): { id: SectionId; label: string }[] {
  const sections: { id: SectionId; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "structure", label: "Structure" },
    { id: "people", label: "People" },
    { id: "staff", label: "Staff" },
  ];
  if (program.attendance.on && program.attendance.readGroupIds.length > 0) sections.push({ id: "attendance", label: "Attendance" });
  if (program.assessments.on && program.assessments.reach) sections.push({ id: "assessments", label: "Assessments" });
  if (program.fees.on && program.fees.reach) sections.push({ id: "fees", label: "Fees" });
  if (program.access === "SUPER" || program.access === "ADMIN") sections.push({ id: "completion", label: "Completion" });
  else if (program.access === "BRANCH") sections.push({ id: "completion", label: "Certificates" });
  if (program.access === "SUPER" || program.access === "ADMIN") sections.push({ id: "settings", label: "Settings" });
  return sections;
}

type Branch = { id: string; name: string };

export function ProgramPage({ id, allBranches }: { id: string; allBranches: Branch[] }) {
  const [program, setProgram] = useState<ProgramDetail | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [section, setSection] = useState<SectionId>("overview");
  const [archiving, setArchiving] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const reply = await getJson(`/api/v1/programs/${encodeURIComponent(id)}`, signal);
      if (signal?.aborted) return;
      if (!reply.ok) {
        setFailed(
          reply.status === 404 ? "This program was not found, or you have no place in it." : say(reply, "The program couldn't be loaded."),
        );
        return;
      }
      setFailed(null);
      setProgram(reply.data as unknown as ProgramDetail);
    },
    [id],
  );

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load once on arrival
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  /// Runs one change, shows what happened, and reloads the program so every tab shows the same thing.
  const run = useCallback(
    async (work: () => ReturnType<typeof sendJson>, done: string, fallback: string): Promise<boolean> => {
      setBusy(true);
      const reply = await work();
      setBusy(false);
      setNotice(reply.ok ? { variant: "success", text: done } : { variant: "error", text: say(reply, fallback) });
      if (reply.ok) await load();
      return reply.ok;
    },
    [load],
  );

  async function status(action: "activate" | "archive" | "restore") {
    const text = { activate: "The program is active.", archive: "The program is archived.", restore: "The program is back as a draft." }[
      action
    ];
    await run(() => sendJson(`/api/v1/programs/${encodeURIComponent(id)}/status`, "POST", { action }), text, "That didn't work.");
    setArchiving(false);
  }

  if (failed) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Alert variant="error">{failed}</Alert>
      </div>
    );
  }
  if (!program) return <p className="text-sm text-fg-muted">Loading…</p>;

  const sections = sectionsFor(program);
  // A tab can disappear while it is open (attendance switched off elsewhere): fall back to the first.
  const shown: SectionId = sections.some((candidate) => candidate.id === section) ? section : "overview";

  return (
    <div className="space-y-5">
      <BackLink />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight break-words text-fg sm:text-3xl">{program.name}</h1>
          <p className="mt-1.5 text-sm text-fg-muted">{headlineText(program)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ProgramBadge status={program.status} />
          {program.can.editDetails && program.status === "DRAFT" && (
            <Button loading={busy} onClick={() => void status("activate")}>
              Activate
            </Button>
          )}
          {program.can.editDetails && (
            <Button variant="secondary" onClick={() => setArchiving(true)}>
              Archive
            </Button>
          )}
          {program.can.restore && (
            <Button variant="secondary" loading={busy} onClick={() => void status("restore")}>
              Restore
            </Button>
          )}
        </div>
      </div>

      {program.switchedOff && <Alert variant="warning">Programs are switched off for the school, so this program can only be read.</Alert>}
      {program.status === "ARCHIVED" && (
        <Alert variant="info">
          This program is archived and can only be read.{program.can.restore ? " You can restore it." : " A super admin can restore it."}
        </Alert>
      )}
      {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}

      <SectionTabs label="Program sections" idPrefix="program-" sections={sections} active={shown} onChange={setSection}>
        <div className="pt-5">
          {shown === "overview" && <ProgramOverview program={program} allBranches={allBranches} run={run} />}
          {shown === "structure" && <ProgramStructure program={program} run={run} />}
          {shown === "people" && <ProgramPeopleTab program={program} run={run} />}
          {shown === "staff" && <ProgramStaffTab program={program} run={run} />}
          {shown === "attendance" && <ProgramAttendanceTab program={program} />}
          {shown === "assessments" && <ProgramAssessmentsTab program={program} />}
          {shown === "fees" && <ProgramFeesTab program={program} />}
          {shown === "completion" && <ProgramCompletionTab program={program} />}
          {shown === "settings" && <ProgramSettingsTab program={program} run={run} />}
        </div>
      </SectionTabs>

      <Dialog
        open={archiving}
        onClose={() => setArchiving(false)}
        title="Archive this program?"
        description="It becomes read only for everyone. Only a super admin can restore it."
      >
        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <Button variant="ghost" data-initial-focus onClick={() => setArchiving(false)}>
            Cancel
          </Button>
          <Button variant="danger" loading={busy} onClick={() => void status("archive")}>
            Archive program
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/programs"
      className="inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm font-semibold text-brand-fg hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <ArrowLeftIcon className="h-4 w-4" />
      All programs
    </Link>
  );
}

export type RunChange = (work: () => ReturnType<typeof sendJson>, done: string, fallback: string) => Promise<boolean>;
