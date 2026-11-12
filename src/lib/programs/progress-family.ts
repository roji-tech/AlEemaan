import { prisma } from "@/lib/db";
import { asDate, today } from "@/lib/standing/common";
import { done, refuse, type Result } from "./common";
import { featureStateOf, type FeatureState } from "./feature-switch";
import { rollPeople } from "./people-service";
import { periodSummaries, weekStartOf, addDays, familyDetail, type Summary, type Values } from "./progress-rules";
import { type TemplateSchema } from "./progress-templates";
import { progressStateOf, templateOf } from "./progress-service";
import { progressGuardianStored, progressStudentStored } from "./settings-service";
import { groupPath, toIsoDate } from "./rules";

// Progress records, slice R3 (task 0044, section 8.9): what a pupil and a guardian see through the portal. The portal gate has already said who is asking and which pupil they may
// reach; this module applies the progress switches (school, branch, program - for the pupil's view or the guardian's view) and then shows ONLY the published (verified) copy of an
// entry. A guardian sees the summary unless the program allows the full entries. Nothing here writes except the "seen" mark.

export type Actor = "PUPIL" | "GUARDIAN";
const WINDOW_DAYS = 120;
const MAX_ENTRIES = 600;

export const studentViewStateOf = (programId: string, flag: boolean): Promise<FeatureState> =>
  featureStateOf(progressStudentStored, programId, flag);
export const guardianViewStateOf = (programId: string, flag: boolean): Promise<FeatureState> =>
  featureStateOf(progressGuardianStored, programId, flag);

export type FamilyEntry = { id: string; trackKey: string; entryDate: string; values: Values; verifiedAt: string | null };
export type FamilyProgram = {
  programId: string;
  programName: string;
  participantId: string;
  groupName: string;
  placeState: string;
  detail: "SUMMARY" | "FULL";
  today: string;
  template: {
    name: { en: string; ar: string };
    ratings: TemplateSchema["ratings"];
    tracks: TemplateSchema["tracks"];
    profile: TemplateSchema["profile"];
    weekStart: number;
    /// Days the calculated Hijri date is moved for this program.
    hijriAdjust: number;
  };
  profile: Record<string, string> | null;
  summary: { weeks: Summary[]; month: Summary };
  entries: FamilyEntry[] | null;
  /// The weeks this actor has marked as seen (the Monday or Saturday the week starts on).
  seen: string[];
};
export type FamilyOverview = { actor: Actor; programs: FamilyProgram[] };

/// The places this pupil has in programs whose progress records they may see right now, for this actor. The switches are read on every request.
async function seats(studentId: string, actor: Actor) {
  const rows = await prisma.programParticipant.findMany({
    where: { studentId, program: { progressEnabled: true, progressTemplate: { not: null } } },
    include: {
      program: true,
    },
  });
  const out: { row: (typeof rows)[number]; template: NonNullable<Awaited<ReturnType<typeof templateOf>>> }[] = [];
  for (const row of rows) {
    const program = row.program;
    const flag = actor === "PUPIL" ? program.progressStudentView : program.progressGuardianView;
    const [state, view] = await Promise.all([
      progressStateOf(program.id, program.progressEnabled),
      actor === "PUPIL" ? studentViewStateOf(program.id, flag) : guardianViewStateOf(program.id, flag),
    ]);
    if (!state.on || !state.onBranchIds.has(row.branchId)) continue;
    if (!view.on || !view.onBranchIds.has(row.branchId)) continue;
    const template = await templateOf(prisma, program);
    if (!template) continue;
    out.push({ row, template });
  }
  return out;
}

export async function familyProgress(studentId: string, actor: Actor): Promise<FamilyOverview> {
  const day = today();
  const programs: FamilyProgram[] = [];
  for (const { row, template } of await seats(studentId, actor)) {
    const program = row.program;
    const detail = familyDetail(actor, program.progressGuardianDetail);
    const record = await prisma.progressRecord.findUnique({ where: { participantId: row.id } });
    const from = addDays(day, -WINDOW_DAYS);
    const published = record
      ? await prisma.progressEntry.findMany({
          where: { recordId: record.id, publishedAt: { not: null }, entryDate: { gte: asDate(from), lte: asDate(day) } },
          orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
          take: MAX_ENTRIES,
        })
      : [];
    const notes =
      record && detail === "FULL"
        ? await prisma.progressEntry.findMany({
            where: {
              recordId: record.id,
              publishedAt: { not: null },
              trackKey: { in: template.schema.tracks.filter((t) => t.kind === "notes").map((t) => t.key) },
            },
            orderBy: { createdAt: "desc" },
            take: 100,
          })
        : [];
    const all = [...published, ...notes.filter((n) => !published.some((p) => p.id === n.id))];
    const rows = all.map((entry) => ({
      id: entry.id,
      trackKey: entry.trackKey,
      entryDate: toIsoDate(entry.entryDate),
      values: entry.publishedValues as Values,
      verifiedAt: entry.verifiedAt?.toISOString() ?? null,
    }));
    const groups = await prisma.programGroup.findMany({
      where: { programId: program.id },
      select: { id: true, parentId: true, name: true },
    });
    const seen = record
      ? await prisma.progressSeen.findMany({ where: { recordId: record.id, actor }, orderBy: { weekStart: "desc" }, take: 16 })
      : [];
    programs.push({
      programId: program.id,
      programName: program.name,
      participantId: row.id,
      groupName: groupPath(groups, row.groupId),
      placeState: (await rollPeople({ id: row.id, programId: program.id }, day))[0]?.state ?? "ENDED_BY_SCHOOL",
      detail,
      today: day,
      template: {
        name: template.schema.name,
        ratings: template.schema.ratings,
        tracks: template.schema.tracks,
        profile: template.schema.profile,
        weekStart: template.schema.weekStart,
        hijriAdjust: program.progressHijriAdjust,
      },
      profile: detail === "FULL" && record ? (record.profile as Record<string, string>) : null,
      summary: periodSummaries(rows, template.schema, day),
      entries: detail === "FULL" ? rows : null,
      seen: seen.map((s) => toIsoDate(s.weekStart)),
    });
  }
  return { actor, programs };
}

/// "Seen": the pupil or a guardian pressed the button for a week. A record of that and nothing else. The same gate as reading; a week in the future is refused.
export async function markSeen(
  studentId: string,
  actor: Actor,
  input: { programId: string; weekStart: string },
): Promise<Result<{ weekStart: string }>> {
  const seat = (await seats(studentId, actor)).find((s) => s.row.programId === input.programId);
  if (!seat) return refuse(404, "NOT_FOUND", "There is no progress record to mark as seen.");
  const record = await prisma.progressRecord.findUnique({ where: { participantId: seat.row.id }, select: { id: true } });
  if (!record) return refuse(404, "NOT_FOUND", "There is no progress record to mark as seen.");
  const start = weekStartOf(input.weekStart, seat.template.schema.weekStart);
  if (start > today())
    return refuse(400, "VALIDATION", "That week hasn't started yet.", [
      { path: "body.weekStart", message: "That week hasn't started yet." },
    ]);
  await prisma.progressSeen.upsert({
    where: { recordId_actor_weekStart: { recordId: record.id, actor, weekStart: asDate(start) } },
    create: { programId: seat.row.programId, recordId: record.id, actor, weekStart: asDate(start) },
    update: { seenAt: new Date() },
  });
  return done({ weekStart: start });
}
