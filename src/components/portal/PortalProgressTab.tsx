"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { dayText } from "@/components/programs/model";
import { ratingText, rowParts, surahName } from "@/components/programs/progress-model";
import type { FamilyOverview, FamilyProgram } from "@/lib/programs/progress-family";
import type { Summary } from "@/lib/programs/progress-rules";

// The Progress tab in the portal (task 0044, slice R3). Read only, and showing ONLY what has been verified: a pupil sees their own entries; a guardian sees the summary, or every entry when the
// program allows it. "Seen" stands in for a signature and is required for nothing. Presentation only: the API applies the switches and decides what is sent at all.

export function PortalProgressTab({
  studentId,
  data,
  actor,
  onChanged,
}: {
  studentId: string;
  data: FamilyOverview;
  actor: string;
  onChanged: () => void;
}) {
  return (
    <div className="space-y-6">
      {data.programs.map((program) => (
        <ProgramCard key={program.participantId} studentId={studentId} program={program} actor={actor} onChanged={onChanged} />
      ))}
    </div>
  );
}

function SummaryBlock({ summary, program, title }: { summary: Summary; program: FamilyProgram; title: string }) {
  const empty = summary.daysRecorded === 0 && summary.latest.length === 0;
  return (
    <div className="space-y-1 rounded-xl border border-line px-3 py-3 text-sm">
      <p className="font-semibold text-fg">{title}</p>
      {empty ? (
        <p className="text-fg-muted">Nothing verified yet.</p>
      ) : (
        <>
          <p className="text-fg-muted">
            {summary.daysRecorded} {summary.daysRecorded === 1 ? "day" : "days"} recorded
          </p>
          {summary.tracks.map((track) =>
            track.days === 0 ? null : (
              <p key={track.trackKey} className="break-words text-fg">
                <span className="font-medium">{track.label.en}:</span> {track.days} {track.days === 1 ? "day" : "days"}
                {track.ayat !== null ? `, ${track.ayat} ayat` : ""}
                {track.from && track.to
                  ? `, from ${surahName(track.from.surah)} ${track.from.ayah} to ${surahName(track.to.surah)} ${track.to.ayah}`
                  : ""}
                {track.average !== null ? `, average rating ${track.average} of 5` : ""}
              </p>
            ),
          )}
          {summary.latest.map((latest) => (
            <p key={latest.trackKey} className="break-words text-fg">
              <span className="font-medium">{latest.label.en}</span> ({dayText(latest.date)})
              {latest.grade !== null ? `: ${ratingText(program.template, latest.grade)}` : ""}
              {latest.note ? ` · ${latest.note}` : ""}
            </p>
          ))}
        </>
      )}
    </div>
  );
}

function ProgramCard({
  studentId,
  program,
  actor,
  onChanged,
}: {
  studentId: string;
  program: FamilyProgram;
  actor: string;
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const seen = new Set(program.seen);
  const weeks = program.summary.weeks.filter((w) => w.daysRecorded > 0 || w.latest.length > 0).slice(0, 4);

  async function markSeen(weekStart: string) {
    setBusy(weekStart);
    setError(null);
    try {
      const res = await fetch(`/api/v1/portal/students/${encodeURIComponent(studentId)}/progress/seen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ programId: program.programId, weekStart }),
      });
      if (!res.ok) setError("That didn't save. Please try again.");
      else onChanged();
    } catch {
      setError("Can't reach the server. Check your internet connection and try again.");
    }
    setBusy(null);
  }

  return (
    <section aria-label={`Progress in ${program.programName}`} className="space-y-4 rounded-2xl border border-line bg-surface p-4">
      <div>
        <h2 className="break-words text-lg font-semibold text-fg">{program.programName}</h2>
        <p className="break-words text-sm text-fg-muted">
          {program.groupName} · {program.template.name.en}
        </p>
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      <SummaryBlock summary={program.summary.month} program={program} title="This month so far" />
      {weeks.length > 0 && (
        <ul className="space-y-2" aria-label="Weeks">
          {weeks.map((week) => (
            <li key={week.from} className="space-y-2">
              <SummaryBlock summary={week} program={program} title={`Week of ${dayText(week.from)}`} />
              <div className="flex justify-end">
                {seen.has(week.from) ? (
                  <span className="text-xs text-fg-muted">You marked this week as seen.</span>
                ) : (
                  <Button
                    variant="secondary"
                    loading={busy === week.from}
                    aria-label={`Mark the week of ${dayText(week.from)} as seen`}
                    onClick={() => void markSeen(week.from)}
                  >
                    Mark as seen
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {program.detail === "SUMMARY" && actor === "GUARDIAN" && (
        <p className="text-xs text-fg-muted">This is a summary of what the teacher has recorded and the school has verified.</p>
      )}
      {program.detail === "FULL" && program.entries && (
        <div className="space-y-4">
          {program.profile && Object.keys(program.profile).length > 0 && (
            <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2" aria-label="Profile">
              {program.template.profile.flatMap((field) => {
                const value = program.profile?.[field.key];
                if (!value) return [];
                const text = field.options?.find((o) => o.value === value)?.en ?? value;
                return [
                  <div key={field.key}>
                    <dt className="text-xs text-fg-muted">{field.label.en}</dt>
                    <dd className="text-fg">{text}</dd>
                  </div>,
                ];
              })}
            </dl>
          )}
          {program.template.tracks.map((track) => {
            const rows = program.entries!.filter((entry) => entry.trackKey === track.key);
            if (rows.length === 0) return null;
            return (
              <section key={track.key} aria-label={`${track.label.en} entries`} className="space-y-2">
                <h3 className="text-base font-semibold text-fg">{track.label.en}</h3>
                <ul className="space-y-2">
                  {rows.map((entry) => (
                    <li key={entry.id} className="rounded-xl border border-line px-3 py-2 text-sm">
                      <p className="font-medium text-fg">{dayText(entry.entryDate)}</p>
                      <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                        {rowParts(track, entry.values, program.template).map((part) => (
                          <div key={part.label}>
                            <dt className="text-xs text-fg-muted">{part.label}</dt>
                            <dd className="break-words whitespace-pre-line text-fg">{part.text}</dd>
                          </div>
                        ))}
                      </dl>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
