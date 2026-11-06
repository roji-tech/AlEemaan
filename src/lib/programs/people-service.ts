import { Prisma, ParticipantKind, ProgramPlaceStatus, StandingState, StandingSubject, type Gender } from "@prisma/client";
import { prisma } from "@/lib/db";
import { branchAdminMaySuspend, maySuspendSwitch } from "@/lib/standing/settings-service";
import { asDate, namesOf, today, writeEvent, type HistoryEntry } from "@/lib/standing/common";
import { standingAfter, suspensionEndProblem, type StandingAction } from "@/lib/standing/rules";
import { assignedGroupIds, viewerOf, type ProgramViewer } from "./access";
import { change, done, refuse, writeAudit, NOT_FOUND, type Result } from "./common";
import { branchesTakingPart } from "./settings-service";
import { groupPath, toIsoDate } from "./rules";
import {
  MAX_CLASS_ADD,
  MAX_PARTICIPANTS,
  PAGE_SIZE,
  groupAndInner,
  isLinkedKind,
  mayBeSamePerson,
  mayChangeStanding,
  mayManagePerson,
  placeState,
  type PlaceState,
} from "./people-rules";

// Programs, slice P2: the people of a program (task 0043, section 9). Every change goes through the same `change()` guard as the structure (the program's row lock, the
// school's switch, the audit); a person is never hard-deleted (withdrawing ends the place). The state of a place is READ from the school's own records every time.

const PERSON_NOT_FOUND = "That person was not found.";
const GROUP_NOT_FOUND = "That group was not found.";

type Tx = Prisma.TransactionClient;

const include = {
  student: {
    select: {
      firstName: true,
      lastName: true,
      admissionNo: true,
      dateOfBirth: true,
      guardianName: true,
      guardianPhone: true,
      archivedAt: true,
      standing: true,
      standingUntil: true,
    },
  },
  staffRecord: {
    select: {
      firstName: true,
      lastName: true,
      phone: true,
      userId: true,
      archivedAt: true,
      standing: true,
      standingUntil: true,
      membership: { select: { deactivatedAt: true, standing: true, standingUntil: true } },
    },
  },
} satisfies Prisma.ProgramParticipantInclude;
type Row = Prisma.ProgramParticipantGetPayload<{ include: typeof include }>;

const nameOf = (row: Row): string =>
  row.student
    ? `${row.student.firstName} ${row.student.lastName}`
    : row.staffRecord
      ? `${row.staffRecord.firstName} ${row.staffRecord.lastName}`
      : `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim();

export const stateOf = (row: Row, day: string): PlaceState =>
  placeState(
    {
      kind: row.kind,
      status: row.status,
      standing: row.standing,
      standingUntil: row.standingUntil,
      student: row.student,
      staff: row.staffRecord ? { ...row.staffRecord, membership: row.staffRecord.membership ?? null } : null,
    },
    day,
  );

export type Person = {
  id: string;
  kind: ParticipantKind;
  name: string;
  /// A pupil's admission number (so the list can tell two namesakes apart).
  admissionNo: string | null;
  dateOfBirth: string | null;
  phone: string | null;
  email: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  branchId: string;
  branchName: string;
  groupId: string;
  groupPath: string;
  status: ProgramPlaceStatus;
  state: PlaceState;
  standing: StandingState;
  standingUntil: string | null;
  joinedOn: string;
  endedOn: string | null;
  endedReason: string | null;
  linked: boolean;
  /// What the caller may do about this person's standing (a courtesy for the buttons; the routes check again): only a person typed in has a standing of their own here.
  can: { suspend: boolean; remove: boolean };
};

type Context = {
  groups: { id: string; parentId: string | null; name: string; archivedAt: Date | null }[];
  branches: Map<string, string>;
  day: string;
  viewer: ProgramViewer;
  actorUserId: string;
  /// Per branch: may administrators there suspend (the school's switch and the branch's)?
  maySuspend: Map<string, boolean>;
};

async function contextOf(viewer: ProgramViewer, actorUserId: string, programId: string): Promise<Context> {
  const [groups, links] = await Promise.all([
    prisma.programGroup.findMany({ where: { programId }, select: { id: true, parentId: true, name: true, archivedAt: true } }),
    prisma.programBranch.findMany({ where: { programId }, select: { branch: { select: { id: true, name: true } } } }),
  ]);
  const branches = new Map(links.map((link) => [link.branch.id, link.branch.name]));
  return { groups, branches, day: today(), viewer, actorUserId, maySuspend: await maySuspendSwitch.onFor([...branches.keys()]) };
}

function toPerson(row: Row, context: Context): Person {
  const iso = (date: Date | null) => (date ? toIsoDate(date) : null);
  const student = row.student;
  const record = row.staffRecord;
  return {
    id: row.id,
    kind: row.kind,
    name: nameOf(row),
    admissionNo: student?.admissionNo ?? null,
    dateOfBirth: iso(student?.dateOfBirth ?? row.dateOfBirth),
    phone: record?.phone ?? row.phone ?? null,
    email: row.email,
    guardianName: student?.guardianName ?? row.guardianName,
    guardianPhone: student?.guardianPhone ?? row.guardianPhone,
    branchId: row.branchId,
    branchName: context.branches.get(row.branchId) ?? "",
    groupId: row.groupId,
    groupPath: groupPath(context.groups, row.groupId),
    status: row.status,
    state: stateOf(row, context.day),
    standing: row.standing,
    standingUntil: iso(row.standingUntil),
    joinedOn: toIsoDate(row.joinedOn),
    endedOn: iso(row.endedOn),
    endedReason: row.endedReason,
    linked: isLinkedKind(row.kind),
    can: {
      suspend:
        !isLinkedKind(row.kind) &&
        mayChangeStanding(context.viewer, "SUSPEND", row.branchId, context.maySuspend.get(row.branchId) ?? true, context.actorUserId) ===
          null,
      remove:
        !isLinkedKind(row.kind) &&
        mayChangeStanding(context.viewer, "EXPEL", row.branchId, context.maySuspend.get(row.branchId) ?? true, context.actorUserId) ===
          null,
    },
  };
}

/// What a viewer can reach: everyone for a super admin and a program admin, and for a branch administrator only the people through their own branches.
/// What the viewer may see: everyone for a super admin, a program admin and a supervisor; the people through their own branches for a branch administrator; the people in their
/// assigned groups (and the groups inside them) for a teacher or a recorder. ALWAYS combined with the other conditions by AND (never spread next to them: a filter on the same key
/// would replace it and show someone else's people).
async function reachOf(viewer: ProgramViewer, programId: string): Promise<Prisma.ProgramParticipantWhereInput> {
  if (viewer.level === "BRANCH") return { branchId: { in: viewer.branchIds } };
  if (viewer.level === "STAFF" && !viewer.supervisor) return { groupId: { in: await assignedGroupIds(viewer.userId, programId) } };
  return {};
}

/// What attendance needs to know about a place on a given day (slice P3): who, where, and the state of the place read from the school's own records NOW (the roll ignores it for a past day).
export type RollPerson = {
  id: string;
  name: string;
  kind: ParticipantKind;
  branchId: string;
  groupId: string;
  status: ProgramPlaceStatus;
  joinedOn: Date;
  endedOn: Date | null;
  state: PlaceState;
};

/// The places matching `where` for a roll or a report, name-sorted. `where` already carries the program and whatever the viewer may reach; at most MAX_PARTICIPANTS rows.
export async function rollPeople(where: Prisma.ProgramParticipantWhereInput, day: string): Promise<RollPerson[]> {
  const rows = await prisma.programParticipant.findMany({ where, include, take: MAX_PARTICIPANTS });
  return rows
    .map((row) => ({
      id: row.id,
      name: nameOf(row),
      kind: row.kind,
      branchId: row.branchId,
      groupId: row.groupId,
      status: row.status,
      joinedOn: row.joinedOn,
      endedOn: row.endedOn,
      state: stateOf(row, day),
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/// What billing needs of a place (slice P4): who, where, the state now, and the contact details on the record (a pupil's guardian, a member of staff's or a typed-in person's phone).
export type BillingPerson = RollPerson & { ownPhone: string | null; guardianName: string | null; guardianPhone: string | null };

export async function billingPeople(where: Prisma.ProgramParticipantWhereInput, day: string): Promise<BillingPerson[]> {
  const rows = await prisma.programParticipant.findMany({ where, include, take: MAX_PARTICIPANTS });
  return rows
    .map((row) => ({
      id: row.id,
      name: nameOf(row),
      kind: row.kind,
      branchId: row.branchId,
      groupId: row.groupId,
      status: row.status,
      joinedOn: row.joinedOn,
      endedOn: row.endedOn,
      state: stateOf(row, day),
      ownPhone: row.staffRecord?.phone ?? row.phone ?? null,
      guardianName: row.student?.guardianName ?? row.guardianName ?? null,
      guardianPhone: row.student?.guardianPhone ?? row.guardianPhone ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/// A search text as text: `%` and `_` are not wildcards here (Prisma does not escape them for `contains`).
const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Reading

export type ListQuery = { q?: string; groupId?: string; branchId?: string; kind?: ParticipantKind; state?: PlaceState; page: number };
export type PeoplePage = { people: Person[]; total: number; page: number; pageSize: number; hasNext: boolean };

/// The people of a program the viewer may see, newest joiners first (a name sort across a pupil's record, a staff record and a typed-in person cannot be paged in the database; the
/// search box finds a name). A `state` filter is read from the school's records, so it is applied after the rows are loaded (never more than MAX_PARTICIPANTS of them).
export async function listPeople(actorUserId: string, programId: string, query: ListQuery): Promise<Result<PeoplePage>> {
  const viewer = await viewerOf(actorUserId, programId);
  if (!viewer) return refuse(404, "NOT_FOUND", NOT_FOUND);
  const context = await contextOf(viewer, actorUserId, programId);
  const groupIds = query.groupId ? groupAndInner(context.groups, query.groupId) : null;
  const q = query.q?.trim();
  const like = q ? { contains: escapeLike(q), mode: "insensitive" as const } : null;
  const where: Prisma.ProgramParticipantWhereInput = {
    programId,
    AND: [
      await reachOf(viewer, programId),
      ...(groupIds ? [{ groupId: { in: groupIds } }] : []),
      ...(query.branchId ? [{ branchId: query.branchId }] : []),
      ...(query.kind ? [{ kind: query.kind }] : []),
      ...(like
        ? [
            {
              OR: [
                { firstName: like },
                { lastName: like },
                { student: { OR: [{ firstName: like }, { lastName: like }, { admissionNo: like }] } },
                { staffRecord: { OR: [{ firstName: like }, { lastName: like }] } },
              ],
            },
          ]
        : []),
    ],
  };
  const orderBy: Prisma.ProgramParticipantOrderByWithRelationInput[] = [{ joinedOn: "desc" }, { id: "asc" }];
  const skip = (query.page - 1) * PAGE_SIZE;
  if (query.state) {
    const rows = await prisma.programParticipant.findMany({ where, include, orderBy, take: MAX_PARTICIPANTS });
    const matching = rows.filter((row) => stateOf(row, context.day) === query.state);
    const people = matching.slice(skip, skip + PAGE_SIZE).map((row) => toPerson(row, context));
    return done({ people, total: matching.length, page: query.page, pageSize: PAGE_SIZE, hasNext: skip + PAGE_SIZE < matching.length });
  }
  const [rows, total] = await Promise.all([
    prisma.programParticipant.findMany({ where, include, orderBy, skip, take: PAGE_SIZE }),
    prisma.programParticipant.count({ where }),
  ]);
  return done({
    people: rows.map((row) => toPerson(row, context)),
    total,
    page: query.page,
    pageSize: PAGE_SIZE,
    hasNext: skip + PAGE_SIZE < total,
  });
}

/// How many people are in each group (the group and everything inside it): only the places that are still open, and only the people the viewer may see. Used by the program's
/// page (the Structure tab shows the head count of each group) and by the guards that stop a group or a branch with people in it from being archived or unlinked.
export async function peopleByGroup(
  viewer: ProgramViewer,
  programId: string,
  groups: { id: string; parentId: string | null; name: string }[],
): Promise<Record<string, number>> {
  const rows = await prisma.programParticipant.groupBy({
    by: ["groupId"],
    where: { programId, status: ProgramPlaceStatus.ACTIVE, AND: [await reachOf(viewer, programId)] },
    _count: { _all: true },
  });
  const own = new Map(rows.map((row) => [row.groupId, row._count._all]));
  const counts: Record<string, number> = {};
  for (const group of groups) counts[group.id] = groupAndInner(groups, group.id).reduce((sum, id) => sum + (own.get(id) ?? 0), 0);
  return counts;
}

export async function getPerson(
  actorUserId: string,
  programId: string,
  personId: string,
): Promise<Result<{ person: Person; history: HistoryRow[] }>> {
  const viewer = await viewerOf(actorUserId, programId);
  if (!viewer) return refuse(404, "NOT_FOUND", NOT_FOUND);
  const row = await prisma.programParticipant.findFirst({
    where: { id: personId, programId, AND: [await reachOf(viewer, programId)] },
    include,
  });
  if (!row) return refuse(404, "NOT_FOUND", PERSON_NOT_FOUND);
  const context = await contextOf(viewer, actorUserId, programId);
  return done({ person: toPerson(row, context), history: await historyOf(personId, programId) });
}

export type HistoryRow = { id: string; action: string; at: string; by: string; reason: string | null; detail: unknown };

/// Everything done to one person's place, newest first: the program's audit rows that name them.
async function historyOf(personId: string, programId: string): Promise<HistoryRow[]> {
  const rows = await prisma.programAudit.findMany({
    where: { programId, targetType: "Participant", targetId: personId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
  });
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(rows.map((row) => row.actorUserId))] } },
    select: { id: true, name: true, email: true },
  });
  const names = new Map(users.map((user) => [user.id, user.name ?? user.email ?? "Someone"]));
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    at: row.createdAt.toISOString(),
    by: names.get(row.actorUserId) ?? "Someone",
    reason: row.reason,
    detail: row.afterValue,
  }));
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Adding

export type Candidate = { id: string; name: string; detail: string; branchId: string; branchName: string; note: string | null };

/// Pupils or members of staff the viewer may add: live records in a branch the program runs in that the viewer may manage, found by name or admission number, who are not in the
/// program already. At most 25 at a time.
export async function candidates(
  actorUserId: string,
  programId: string,
  query: { kind: "STUDENT" | "STAFF"; q: string },
): Promise<Result<Candidate[]>> {
  const viewer = await viewerOf(actorUserId, programId);
  if (!viewer) return refuse(404, "NOT_FOUND", NOT_FOUND);
  const links = await prisma.programBranch.findMany({ where: { programId }, select: { branch: { select: { id: true, name: true } } } });
  const reach = links.map((link) => link.branch).filter((branch) => mayManagePerson(viewer, branch.id));
  const ids = reach.map((branch) => branch.id);
  const names = new Map(reach.map((branch) => [branch.id, branch.name]));
  const q = query.q.trim();
  if (ids.length === 0 || q.length < 2) return done([]);
  const present = await prisma.programParticipant.findMany({
    where: { programId, kind: query.kind },
    select: { studentId: true, staffRecordId: true, status: true },
  });
  const taken = new Map(present.map((row) => [row.studentId ?? row.staffRecordId, row.status]));
  if (query.kind === "STUDENT") {
    const students = await prisma.studentRecord.findMany({
      where: {
        branchId: { in: ids },
        archivedAt: null,
        OR: [
          { firstName: { contains: escapeLike(q), mode: "insensitive" } },
          { lastName: { contains: escapeLike(q), mode: "insensitive" } },
          { admissionNo: { contains: escapeLike(q), mode: "insensitive" } },
        ],
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 25,
      select: { id: true, firstName: true, lastName: true, admissionNo: true, branchId: true, standing: true },
    });
    return done(
      students.map((s) => ({
        id: s.id,
        name: `${s.firstName} ${s.lastName}`,
        detail: s.admissionNo,
        branchId: s.branchId,
        branchName: names.get(s.branchId) ?? "",
        note: taken.has(s.id)
          ? taken.get(s.id) === ProgramPlaceStatus.ACTIVE
            ? "Already in this program"
            : "Has left this program: re-enrol them"
          : s.standing === "EXPELLED"
            ? "Expelled"
            : null,
      })),
    );
  }
  const staff = await prisma.staffRecord.findMany({
    where: {
      branchId: { in: ids },
      archivedAt: null,
      OR: [{ firstName: { contains: escapeLike(q), mode: "insensitive" } }, { lastName: { contains: escapeLike(q), mode: "insensitive" } }],
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 25,
    select: { id: true, firstName: true, lastName: true, designation: true, branchId: true },
  });
  return done(
    staff.map((s) => ({
      id: s.id,
      name: `${s.firstName} ${s.lastName}`,
      detail: s.designation ?? "Staff",
      branchId: s.branchId,
      branchName: names.get(s.branchId) ?? "",
      note: taken.has(s.id)
        ? taken.get(s.id) === ProgramPlaceStatus.ACTIVE
          ? "Already in this program"
          : "Has left this program: re-enrol them"
        : null,
    })),
  );
}

export type ClassOption = { id: string; label: string; branchId: string; branchName: string; pupils: number };

/// The school's classes the caller may add from: the live class arms of the branches the program runs in that the caller may manage, with how many pupils are in each now.
export async function classOptions(actorUserId: string, programId: string): Promise<Result<ClassOption[]>> {
  const viewer = await viewerOf(actorUserId, programId);
  if (!viewer) return refuse(404, "NOT_FOUND", NOT_FOUND);
  const links = await prisma.programBranch.findMany({ where: { programId }, select: { branch: { select: { id: true, name: true } } } });
  const reach = links.map((link) => link.branch).filter((branch) => mayManagePerson(viewer, branch.id));
  const names = new Map(reach.map((branch) => [branch.id, branch.name]));
  if (reach.length === 0) return done([]);
  const arms = await prisma.classArm.findMany({
    where: { branchId: { in: reach.map((branch) => branch.id) }, archivedAt: null },
    orderBy: [{ branchId: "asc" }, { classGroup: { name: "asc" } }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      branchId: true,
      classGroup: { select: { name: true } },
      _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
    },
  });
  return done(
    arms.map((arm) => ({
      id: arm.id,
      label: `${arm.classGroup.name} ${arm.name}`,
      branchId: arm.branchId,
      branchName: names.get(arm.branchId) ?? "",
      pupils: arm._count.enrollments,
    })),
  );
}

export type StandaloneInput = {
  kind: "GUARDIAN" | "ADULT" | "CHILD";
  firstName: string;
  lastName: string;
  gender?: Gender | null;
  dateOfBirth?: string | null;
  phone?: string | null;
  email?: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  branchId: string;
};
export type AddInput =
  | { kind: "STUDENT"; studentId: string; groupId: string }
  | { kind: "STAFF"; staffRecordId: string; groupId: string }
  | ({ groupId: string; confirmNamesake?: boolean } & StandaloneInput);

async function liveGroup(tx: Tx, programId: string, groupId: string) {
  const group = await tx.programGroup.findFirst({ where: { id: groupId, programId, archivedAt: null }, select: { id: true } });
  return group;
}

async function checkRoom(tx: Tx, programId: string, adding: number): Promise<boolean> {
  return (await tx.programParticipant.count({ where: { programId } })) + adding <= MAX_PARTICIPANTS;
}

async function branchAllowed(tx: Tx, programId: string, branchId: string, viewer: ProgramViewer): Promise<Result<true>> {
  const link = await tx.programBranch.findUnique({ where: { programId_branchId: { programId, branchId } }, select: { branchId: true } });
  // A branch the program does not run in, and a branch the viewer does not manage, are the same answer.
  if (!link || !mayManagePerson(viewer, branchId)) return refuse(404, "NOT_FOUND", "That branch was not found.");
  if ((await branchesTakingPart([branchId])).get(branchId) === false)
    return refuse(409, "BRANCH_PROGRAMS_OFF", "That branch has switched programs off.");
  return done(true);
}

/// Adds one person: a pupil or a member of staff by LINKING their record (their branch is the record's), or a person typed in (adult, guardian, child) through a branch the program
/// runs in. One place per person: a pupil already in the program is refused, and one who has left is told to be re-enrolled. A namesake of a typed-in person is refused unless the
/// administrator confirms, and the confirmation is audited.
export async function addPerson(actorUserId: string, programId: string, input: AddInput): Promise<Result<{ id: string }>> {
  return change(actorUserId, programId, "people", async ({ tx, program, viewer }) => {
    if (!(await liveGroup(tx, program.id, input.groupId))) return refuse(404, "NOT_FOUND", GROUP_NOT_FOUND);
    if (!(await checkRoom(tx, program.id, 1))) return refuse(409, "TOO_MANY", `A program can have at most ${MAX_PARTICIPANTS} people.`);
    const joinedOn = asDate(today());
    const base = { programId: program.id, groupId: input.groupId, joinedOn, createdByUserId: actorUserId };
    let data: Prisma.ProgramParticipantUncheckedCreateInput;
    let label: string;
    let namesakeConfirmed = false;

    if (input.kind === "STUDENT") {
      const student = await tx.studentRecord.findUnique({
        where: { id: input.studentId },
        select: { id: true, branchId: true, firstName: true, lastName: true, archivedAt: true },
      });
      if (!student || student.archivedAt) return refuse(404, "NOT_FOUND", "That student was not found.");
      const allowed = await branchAllowed(tx, program.id, student.branchId, viewer);
      if (!allowed.ok) return allowed;
      const existing = await tx.programParticipant.findUnique({
        where: { programId_studentId: { programId: program.id, studentId: student.id } },
        select: { status: true },
      });
      if (existing)
        return refuse(
          409,
          existing.status === "ACTIVE" ? "ALREADY_IN" : "LEFT_ALREADY",
          existing.status === "ACTIVE" ? "They are already in this program." : "They have left this program. Re-enrol them instead.",
        );
      data = { ...base, kind: ParticipantKind.STUDENT, studentId: student.id, branchId: student.branchId };
      label = `${student.firstName} ${student.lastName}`;
    } else if (input.kind === "STAFF") {
      const record = await tx.staffRecord.findUnique({
        where: { id: input.staffRecordId },
        select: { id: true, branchId: true, firstName: true, lastName: true, archivedAt: true },
      });
      if (!record || record.archivedAt) return refuse(404, "NOT_FOUND", "That member of staff was not found.");
      const allowed = await branchAllowed(tx, program.id, record.branchId, viewer);
      if (!allowed.ok) return allowed;
      const existing = await tx.programParticipant.findUnique({
        where: { programId_staffRecordId: { programId: program.id, staffRecordId: record.id } },
        select: { status: true },
      });
      if (existing)
        return refuse(
          409,
          existing.status === "ACTIVE" ? "ALREADY_IN" : "LEFT_ALREADY",
          existing.status === "ACTIVE" ? "They are already in this program." : "They have left this program. Re-enrol them instead.",
        );
      data = { ...base, kind: ParticipantKind.STAFF, staffRecordId: record.id, branchId: record.branchId };
      label = `${record.firstName} ${record.lastName}`;
    } else {
      const allowed = await branchAllowed(tx, program.id, input.branchId, viewer);
      if (!allowed.ok) return allowed;
      const others = await tx.programParticipant.findMany({
        where: { programId: program.id, studentId: null, staffRecordId: null, status: { not: ProgramPlaceStatus.WITHDRAWN } },
        select: { id: true, firstName: true, lastName: true, dateOfBirth: true, phone: true, guardianPhone: true },
      });
      const me = {
        firstName: input.firstName,
        lastName: input.lastName,
        dateOfBirth: input.dateOfBirth ?? null,
        phone: input.phone ?? input.guardianPhone ?? null,
      };
      const twin = others.find((other) =>
        mayBeSamePerson(me, {
          firstName: other.firstName ?? "",
          lastName: other.lastName ?? "",
          dateOfBirth: other.dateOfBirth ? toIsoDate(other.dateOfBirth) : null,
          phone: other.phone ?? other.guardianPhone,
        }),
      );
      if (twin && !input.confirmNamesake) {
        return refuse(
          409,
          "POSSIBLE_DUPLICATE",
          `Someone called ${twin.firstName} ${twin.lastName} with the same birth date or phone number is already in this program. Confirm if this is a different person.`,
          [{ path: "body.confirmNamesake", message: "Confirm that this is a different person." }],
        );
      }
      namesakeConfirmed = Boolean(twin);
      data = {
        ...base,
        kind: input.kind,
        branchId: input.branchId,
        firstName: input.firstName,
        lastName: input.lastName,
        gender: input.gender ?? null,
        dateOfBirth: input.dateOfBirth ? asDate(input.dateOfBirth) : null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        guardianName: input.guardianName ?? null,
        guardianPhone: input.guardianPhone ?? null,
      };
      label = `${input.firstName} ${input.lastName}`;
    }
    const created = await tx.programParticipant.create({ data, select: { id: true } });
    await writeAudit(tx, {
      programId: program.id,
      actorUserId,
      action: "PERSON_ADDED",
      targetType: "Participant",
      targetId: created.id,
      after: { name: label, kind: data.kind, groupId: input.groupId, branchId: data.branchId, namesakeConfirmed },
    });
    return done({ id: created.id });
  });
}

export type ClassPlan = {
  arm: { id: string; name: string; className: string; branchId: string };
  willAdd: { studentId: string; name: string; note: string | null }[];
  skipped: { name: string; reason: "ALREADY_IN" | "LEFT_ALREADY" | "ARCHIVED" | "EXPELLED" }[];
};

/// A whole class of pupils at once. Without `confirm` it only SAYS who would be added and who would be skipped (already in, has left, archived, expelled); with it, one audited step
/// adds them all or none.
export async function addClass(
  actorUserId: string,
  programId: string,
  input: { classArmId: string; groupId: string; confirm: boolean },
): Promise<Result<ClassPlan & { added: number }>> {
  return change(actorUserId, programId, "people", async ({ tx, program, viewer }) => {
    if (!(await liveGroup(tx, program.id, input.groupId))) return refuse(404, "NOT_FOUND", GROUP_NOT_FOUND);
    const arm = await tx.classArm.findUnique({
      where: { id: input.classArmId },
      select: { id: true, name: true, branchId: true, archivedAt: true, classGroup: { select: { name: true } } },
    });
    if (!arm || arm.archivedAt) return refuse(404, "NOT_FOUND", "That class was not found.");
    const allowed = await branchAllowed(tx, program.id, arm.branchId, viewer);
    if (!allowed.ok) return allowed;
    const enrolments = await tx.studentEnrollment.findMany({
      where: { classArmId: arm.id, status: "ACTIVE" },
      select: { student: { select: { id: true, firstName: true, lastName: true, archivedAt: true, standing: true } } },
    });
    if (enrolments.length > MAX_CLASS_ADD)
      return refuse(409, "TOO_MANY", `A class of more than ${MAX_CLASS_ADD} pupils can't be added in one step.`);
    const existing = new Map(
      (
        await tx.programParticipant.findMany({
          where: { programId: program.id, studentId: { in: enrolments.map((e) => e.student.id) } },
          select: { studentId: true, status: true },
        })
      ).map((row) => [row.studentId, row.status]),
    );
    const plan: ClassPlan = {
      arm: { id: arm.id, name: arm.name, className: arm.classGroup.name, branchId: arm.branchId },
      willAdd: [],
      skipped: [],
    };
    for (const { student } of enrolments) {
      const name = `${student.firstName} ${student.lastName}`;
      const was = existing.get(student.id);
      if (was) plan.skipped.push({ name, reason: was === "ACTIVE" ? "ALREADY_IN" : "LEFT_ALREADY" });
      else if (student.archivedAt) plan.skipped.push({ name, reason: "ARCHIVED" });
      else if (student.standing === "EXPELLED") plan.skipped.push({ name, reason: "EXPELLED" });
      else plan.willAdd.push({ studentId: student.id, name, note: student.standing === "SUSPENDED" ? "Suspended" : null });
    }
    if (!input.confirm) return done({ ...plan, added: 0 });
    if (!(await checkRoom(tx, program.id, plan.willAdd.length)))
      return refuse(409, "TOO_MANY", `A program can have at most ${MAX_PARTICIPANTS} people.`);
    if (plan.willAdd.length > 0) {
      await tx.programParticipant.createMany({
        data: plan.willAdd.map((entry) => ({
          programId: program.id,
          kind: ParticipantKind.STUDENT,
          studentId: entry.studentId,
          branchId: arm.branchId,
          groupId: input.groupId,
          joinedOn: asDate(today()),
          createdByUserId: actorUserId,
        })),
      });
    }
    await writeAudit(tx, {
      programId: program.id,
      actorUserId,
      action: "CLASS_ADDED",
      targetType: "Program",
      targetId: program.id,
      after: {
        arm: `${arm.classGroup.name} ${arm.name}`,
        groupId: input.groupId,
        added: plan.willAdd.length,
        skipped: plan.skipped.length,
      },
    });
    return done({ ...plan, added: plan.willAdd.length });
  });
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Changing a person

async function placeOf(tx: Tx, programId: string, personId: string, viewer: ProgramViewer) {
  const row = await tx.programParticipant.findFirst({
    where: { id: personId, programId, AND: [await reachOf(viewer, programId)] },
    include,
  });
  return row;
}

export type EditInput = {
  firstName?: string;
  lastName?: string;
  gender?: Gender | null;
  dateOfBirth?: string | null;
  phone?: string | null;
  email?: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
};

/// Edits the details of a person who was typed in. A pupil's or a member of staff's details are the school's record and are changed there.
export async function editPerson(
  actorUserId: string,
  programId: string,
  personId: string,
  input: EditInput,
): Promise<Result<{ id: string }>> {
  return change(actorUserId, programId, "people", async ({ tx, program, viewer }) => {
    const row = await placeOf(tx, program.id, personId, viewer);
    if (!row) return refuse(404, "NOT_FOUND", PERSON_NOT_FOUND);
    if (isLinkedKind(row.kind)) return refuse(409, "LINKED", "This person's details are the school's record. Change them there.");
    const next = {
      firstName: input.firstName ?? row.firstName,
      lastName: input.lastName ?? row.lastName,
      gender: input.gender === undefined ? row.gender : input.gender,
      dateOfBirth: input.dateOfBirth === undefined ? row.dateOfBirth : input.dateOfBirth ? asDate(input.dateOfBirth) : null,
      phone: input.phone === undefined ? row.phone : input.phone,
      email: input.email === undefined ? row.email : input.email,
      guardianName: input.guardianName === undefined ? row.guardianName : input.guardianName,
      guardianPhone: input.guardianPhone === undefined ? row.guardianPhone : input.guardianPhone,
    };
    if (row.kind === "CHILD" && (!next.dateOfBirth || !next.guardianName?.trim() || !next.guardianPhone?.trim()))
      return refuse(400, "VALIDATION", "A child needs a date of birth, a guardian's name and a guardian's phone.", [
        { path: "body", message: "A child needs a date of birth, a guardian's name and a guardian's phone." },
      ]);
    await tx.programParticipant.update({ where: { id: row.id }, data: next });
    await writeAudit(tx, {
      programId: program.id,
      actorUserId,
      action: "PERSON_EDITED",
      targetType: "Participant",
      targetId: row.id,
      before: { name: nameOf(row) },
      after: { name: `${next.firstName} ${next.lastName}`, fields: Object.keys(input) },
    });
    return done({ id: row.id });
  });
}

/// Moves a person to another live group of the same program. Their branch does not change.
export async function movePerson(
  actorUserId: string,
  programId: string,
  personId: string,
  groupId: string,
): Promise<Result<{ id: string }>> {
  return change(actorUserId, programId, "people", async ({ tx, program, viewer }) => {
    const row = await placeOf(tx, program.id, personId, viewer);
    if (!row) return refuse(404, "NOT_FOUND", PERSON_NOT_FOUND);
    if (row.status !== ProgramPlaceStatus.ACTIVE)
      return refuse(409, "NOT_ACTIVE", "Only a place that is still open can be moved. Re-enrol them first.");
    if (row.groupId === groupId) return done({ id: row.id });
    if (!(await liveGroup(tx, program.id, groupId))) return refuse(404, "NOT_FOUND", GROUP_NOT_FOUND);
    await tx.programParticipant.update({ where: { id: row.id }, data: { groupId } });
    await writeAudit(tx, {
      programId: program.id,
      actorUserId,
      action: "PERSON_MOVED",
      targetType: "Participant",
      targetId: row.id,
      before: { groupId: row.groupId },
      after: { name: nameOf(row), groupId },
    });
    return done({ id: row.id });
  });
}

/// Withdraws a person (their place ends today; nothing is deleted) or re-enrols one who left (into the group they were in, or another live one).
export async function setPlace(
  actorUserId: string,
  programId: string,
  personId: string,
  input: { action: "WITHDRAW" | "REENROL"; reason: string; groupId?: string },
): Promise<Result<{ id: string; status: ProgramPlaceStatus }>> {
  return change<{ id: string; status: ProgramPlaceStatus }>(actorUserId, programId, "people", async ({ tx, program, viewer }) => {
    const row = await placeOf(tx, program.id, personId, viewer);
    if (!row) return refuse(404, "NOT_FOUND", PERSON_NOT_FOUND);
    if (input.action === "WITHDRAW") {
      if (row.status !== ProgramPlaceStatus.ACTIVE) return refuse(409, "NOT_APPLICABLE", "That doesn't apply: their place is not open.");
      await tx.programParticipant.update({
        where: { id: row.id },
        data: { status: ProgramPlaceStatus.WITHDRAWN, endedOn: asDate(today()), endedReason: input.reason },
      });
      await writeAudit(tx, {
        programId: program.id,
        actorUserId,
        action: "PERSON_WITHDRAWN",
        targetType: "Participant",
        targetId: row.id,
        before: { status: row.status },
        after: { name: nameOf(row) },
        reason: input.reason,
      });
      return done({ id: row.id, status: ProgramPlaceStatus.WITHDRAWN });
    }
    if (row.status !== ProgramPlaceStatus.WITHDRAWN) return refuse(409, "NOT_APPLICABLE", "That doesn't apply: they have not left.");
    const groupId = input.groupId ?? row.groupId;
    if (!(await liveGroup(tx, program.id, groupId)))
      return refuse(409, "GROUP_ARCHIVED", "Their group is archived. Choose a group to put them in.", [
        { path: "body.groupId", message: "Choose a live group." },
      ]);
    if (!(await checkRoom(tx, program.id, 0))) return refuse(409, "TOO_MANY", `A program can have at most ${MAX_PARTICIPANTS} people.`);
    if ((await branchesTakingPart([row.branchId])).get(row.branchId) === false)
      return refuse(409, "BRANCH_PROGRAMS_OFF", "That branch has switched programs off.");
    await tx.programParticipant.update({
      where: { id: row.id },
      data: { status: ProgramPlaceStatus.ACTIVE, endedOn: null, endedReason: null, groupId },
    });
    await writeAudit(tx, {
      programId: program.id,
      actorUserId,
      action: "PERSON_REENROLLED",
      targetType: "Participant",
      targetId: row.id,
      before: { status: row.status, groupId: row.groupId },
      after: { name: nameOf(row), groupId },
      reason: input.reason,
    });
    return done({ id: row.id, status: ProgramPlaceStatus.ACTIVE });
  });
}

/// Suspends, lifts, expels or reinstates a person who was typed in (design 9.5). A pupil's or a member of staff's standing is the school's: it is read from their record, and is
/// changed on the Students or Users page, so two screens can never disagree.
export async function changePersonStanding(
  actorUserId: string,
  programId: string,
  personId: string,
  action: Exclude<StandingAction, "TERMINATE">,
  input: { reason: string; until: string | null },
): Promise<Result<{ standing: string; until: string | null }>> {
  return change(actorUserId, programId, "people", async ({ tx, program, viewer }) => {
    const row = await placeOf(tx, program.id, personId, viewer);
    if (!row) return refuse(404, "NOT_FOUND", PERSON_NOT_FOUND);
    if (isLinkedKind(row.kind))
      return refuse(409, "LINKED", row.kind === "STUDENT" ? "Change this on the Students page." : "Change this on the Users page.");
    const refusal = mayChangeStanding(viewer, action, row.branchId, await branchAdminMaySuspend(row.branchId), actorUserId);
    if (refusal === "NOT_YOURS") return refuse(404, "NOT_FOUND", PERSON_NOT_FOUND);
    if (refusal) return refuse(403, "FORBIDDEN", "You don't have permission to do that.");
    const until = action === "SUSPEND" ? input.until : null;
    if (action === "SUSPEND") {
      const problem = suspensionEndProblem(until, today());
      if (problem) return refuse(400, "VALIDATION", problem, [{ path: "body.until", message: problem }]);
    }
    const stored = row.standing === "SUSPENDED" && row.standingUntil && toIsoDate(row.standingUntil) < today() ? "ACTIVE" : row.standing;
    const next = standingAfter(action, "STUDENT", stored) as StandingState | null;
    if (!next) return refuse(409, "NOT_APPLICABLE", "That doesn't apply: nothing is in the state this needs.");
    await tx.programParticipant.update({
      where: { id: row.id },
      data: { standing: next, standingUntil: next === "SUSPENDED" && until ? asDate(until) : null },
    });
    await writeEvent(
      tx,
      {
        subject: StandingSubject.PARTICIPANT,
        participantId: row.id,
        branchId: row.branchId,
        action,
        reason: input.reason,
        endsOn: until,
        decidedByUserId: actorUserId,
      },
      {
        targetType: "ProgramParticipant",
        targetId: row.id,
        before: { standing: row.standing, until: row.standingUntil ? toIsoDate(row.standingUntil) : null },
        after: { standing: next, until },
      },
    );
    await writeAudit(tx, {
      programId: program.id,
      actorUserId,
      action: `PERSON_${action}`,
      targetType: "Participant",
      targetId: row.id,
      before: { standing: row.standing },
      after: { name: nameOf(row), standing: next, until },
      reason: input.reason,
    });
    return done({ standing: next, until });
  });
}

/// The standing history of one person typed in (their place's own history is `getPerson`): newest first, in the same shape the students' and staff histories use, so one dialog
/// shows all three.
export async function personStandingHistory(
  actorUserId: string,
  programId: string,
  personId: string,
): Promise<Result<{ standing: string; until: string | null; events: HistoryEntry[] }>> {
  const viewer = await viewerOf(actorUserId, programId);
  if (!viewer) return refuse(404, "NOT_FOUND", NOT_FOUND);
  const row = await prisma.programParticipant.findFirst({
    where: { id: personId, programId, AND: [await reachOf(viewer, programId)] },
    select: { id: true, standing: true, standingUntil: true },
  });
  if (!row) return refuse(404, "NOT_FOUND", PERSON_NOT_FOUND);
  const events = await prisma.standingEvent.findMany({
    where: { participantId: row.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
  });
  const names = await namesOf(
    prisma,
    events.map((event) => event.decidedByUserId),
  );
  return done({
    standing: row.standing,
    until: row.standingUntil ? toIsoDate(row.standingUntil) : null,
    events: events.map((event) => ({
      id: event.id,
      action: event.action,
      scope: event.scope,
      reason: event.reason,
      startsOn: toIsoDate(event.startsOn),
      endsOn: event.endsOn ? toIsoDate(event.endsOn) : null,
      decidedBy: names.get(event.decidedByUserId) ?? "Someone",
      at: event.createdAt.toISOString(),
    })),
  });
}
