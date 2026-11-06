import { randomBytes } from "node:crypto";
import { Prisma, ProgramPlaceStatus, ProgramStatus, type ProgramCertificateStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSchoolSettings } from "@/lib/settings/school-settings";
import { asDate, today } from "@/lib/standing/common";
import { canManage, viewerOf, type ProgramViewer } from "./access";
import { completionResults } from "./assessment-service";
import { meetsRule, type CompletionRule } from "./assessment-rules";
import { change, done, refuse, writeAudit, NOT_FOUND, type Result } from "./common";
import {
  MAX_ISSUE_BATCH,
  MIN_REASON_LENGTH,
  certificateSerial,
  fillWording,
  longDate,
  parseSignatories,
  placeCompletable,
  programCompletable,
  type Signatory,
} from "./completion-rules";
import { owingByPerson } from "./fees-service";
import type { PlaceState } from "./people-rules";
import { rollPeople, type RollPerson } from "./people-service";
import { groupPath, toIsoDate } from "./rules";

// Programs, slice P5: completing a place or a whole fixed-term program, and certificates (task 0043, section 12). Completing is an explicit action under the program's lock; nothing runs in
// the background. A certificate is a snapshot of the wording and the name at the moment it is issued; it is withdrawn, never deleted.

const PERSON_NOT_FOUND = "That person was not found.";
const CERT_NOT_FOUND = "That certificate was not found.";

type GroupNode = { id: string; parentId: string | null; name: string; archivedAt: Date | null };
const groupsOf = (client: Pick<Prisma.TransactionClient, "programGroup">, programId: string): Promise<GroupNode[]> =>
  client.programGroup.findMany({ where: { programId }, select: { id: true, parentId: true, name: true, archivedAt: true } });

export const ruleOf = (program: { completionMinAverage: Prisma.Decimal | null; completionRequirePassed: boolean }): CompletionRule => ({
  minAverage: program.completionMinAverage === null ? null : Number(program.completionMinAverage),
  requirePassed: program.completionRequirePassed,
});
const hasRule = (rule: CompletionRule) => rule.minAverage !== null || rule.requirePassed;

const manager = async (actorUserId: string, programId: string): Promise<Result<ProgramViewer>> => {
  const viewer = await viewerOf(actorUserId, programId);
  if (!viewer) return refuse(404, "NOT_FOUND", NOT_FOUND);
  return canManage(viewer) ? done(viewer) : refuse(403, "FORBIDDEN", "You don't have permission to do that.");
};

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// What can be completed

export type CompletionRow = {
  participantId: string;
  name: string;
  groupPath: string;
  state: PlaceState;
  status: ProgramPlaceStatus;
  completedOn: string | null;
  overrideReason: string | null;
  completable: { ok: boolean; why: string | null };
  meets: { ok: boolean; why: string[] };
  owes: number;
  certificate: { id: string; serialNo: string; status: ProgramCertificateStatus } | null;
};
export type CompletionView = {
  program: { kind: string; status: ProgramStatus; endsOn: string | null; completable: { ok: boolean; why: string | null } };
  rule: CompletionRule;
  noCertWhileOwing: boolean;
  rows: CompletionRow[];
};

async function evaluate(programId: string, people: RollPerson[], rule: CompletionRule) {
  const [results, owing] = await Promise.all([
    hasRule(rule)
      ? completionResults(
          programId,
          people.map((p) => ({ id: p.id, groupId: p.groupId })),
        )
      : Promise.resolve(new Map()),
    owingByPerson(programId),
  ]);
  return (person: RollPerson) => ({
    meets: hasRule(rule) ? meetsRule(rule, results.get(person.id) ?? []) : { ok: true, why: [] as string[] },
    owesCents: owing.get(person.id) ?? 0,
  });
}

export async function getCompletion(actorUserId: string, programId: string): Promise<Result<CompletionView>> {
  const viewer = await manager(actorUserId, programId);
  if (!viewer.ok) return viewer;
  const program = await prisma.program.findUniqueOrThrow({ where: { id: programId } });
  const todayDay = today();
  const [groups, people, certs] = await Promise.all([
    groupsOf(prisma, programId),
    rollPeople({ programId, status: { in: [ProgramPlaceStatus.ACTIVE, ProgramPlaceStatus.COMPLETED] } }, todayDay),
    prisma.programCertificate.findMany({
      where: { programId },
      orderBy: { createdAt: "desc" },
      select: { id: true, participantId: true, serialNo: true, status: true },
    }),
  ]);
  const rule = ruleOf(program);
  const evalOf = await evaluate(programId, people, rule);
  const details = await prisma.programParticipant.findMany({
    where: { programId, id: { in: people.map((p) => p.id) } },
    select: { id: true, completionOverrideReason: true },
  });
  const override = new Map(details.map((d) => [d.id, d.completionOverrideReason]));
  const certOf = new Map<string, { id: string; serialNo: string; status: ProgramCertificateStatus }>();
  for (const c of certs)
    if (!certOf.has(c.participantId) || c.status === "ISSUED")
      certOf.set(c.participantId, { id: c.id, serialNo: c.serialNo, status: c.status });
  return done({
    program: {
      kind: program.kind,
      status: program.status,
      endsOn: program.endsOn ? toIsoDate(program.endsOn) : null,
      completable: programCompletable(
        { kind: program.kind, status: program.status, endsOn: program.endsOn ? toIsoDate(program.endsOn) : null },
        todayDay,
      ),
    },
    rule,
    noCertWhileOwing: program.noCertWhileOwing,
    rows: people.map((p) => {
      const e = evalOf(p);
      return {
        participantId: p.id,
        name: p.name,
        groupPath: groupPath(groups, p.groupId),
        state: p.state,
        status: p.status,
        completedOn: p.status === "COMPLETED" && p.endedOn ? toIsoDate(p.endedOn) : null,
        overrideReason: override.get(p.id) ?? null,
        completable: placeCompletable(p.status, p.state),
        meets: e.meets,
        owes: e.owesCents / 100,
        certificate: certOf.get(p.id) ?? null,
      };
    }),
  });
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Completing one place

/// Completes one person's place, at any time (a Quran memoriser finishes a level in a program that never ends). If the program has a completion rule the person must meet it, or the
/// completion needs an override with a reason, which is kept. A super admin or a program admin.
export async function completePlace(
  actorUserId: string,
  programId: string,
  personId: string,
  input: { note?: string; overrideReason?: string },
): Promise<Result<{ id: string; owes: number }>> {
  return change(actorUserId, programId, "manage", async ({ tx, program }) => {
    const row = await tx.programParticipant.findFirst({ where: { id: personId, programId }, select: { id: true, joinedOn: true } });
    if (!row) return refuse(404, "NOT_FOUND", PERSON_NOT_FOUND);
    const [person] = await rollPeople({ programId, id: personId }, today());
    if (!person) return refuse(404, "NOT_FOUND", PERSON_NOT_FOUND);
    const can = placeCompletable(person.status, person.state);
    if (!can.ok) return refuse(409, "NOT_APPLICABLE", can.why ?? "That place can't be completed.");
    const rule = ruleOf(program);
    const evalOf = await evaluate(programId, [person], rule);
    const { meets, owesCents } = evalOf(person);
    const override = input.overrideReason?.trim() || null;
    if (!meets.ok && (!override || override.length < MIN_REASON_LENGTH))
      return refuse(
        409,
        "RULE_NOT_MET",
        `${person.name} does not meet the completion rule: ${meets.why.join(" ")} Complete with an override and a reason to go ahead.`,
        meets.why.map((message) => ({ path: "body.overrideReason", message })),
      );
    await tx.programParticipant.update({
      where: { id: personId },
      data: {
        status: ProgramPlaceStatus.COMPLETED,
        endedOn: asDate(today()),
        endedReason: input.note?.trim() || "Completed",
        completionOverrideReason: meets.ok ? null : override,
      },
    });
    await writeAudit(tx, {
      programId,
      actorUserId,
      action: "PLACE_COMPLETED",
      targetType: "Participant",
      targetId: personId,
      after: { overrode: !meets.ok, owes: owesCents / 100 },
      reason: meets.ok ? input.note?.trim() || null : override,
    });
    return done({ id: personId, owes: owesCents / 100 });
  });
}

/// Reopens a completed place, with a reason that is kept: a super admin only, only while the program is active, and only after any certificate for it has been withdrawn.
export async function reopenPlace(
  actorUserId: string,
  programId: string,
  personId: string,
  reason: string,
): Promise<Result<{ id: string }>> {
  return change(actorUserId, programId, "super", async ({ tx }) => {
    const row = await tx.programParticipant.findFirst({ where: { id: personId, programId } });
    if (!row) return refuse(404, "NOT_FOUND", PERSON_NOT_FOUND);
    if (row.status !== ProgramPlaceStatus.COMPLETED) return refuse(409, "NOT_APPLICABLE", "That place is not completed.");
    if ((await tx.programCertificate.count({ where: { programId, participantId: personId, status: "ISSUED" } })) > 0)
      return refuse(409, "HAS_CERTIFICATE", "Withdraw the certificate first.");
    await tx.programParticipant.update({
      where: { id: personId },
      data: { status: ProgramPlaceStatus.ACTIVE, endedOn: null, endedReason: null, completionOverrideReason: null },
    });
    await writeAudit(tx, { programId, actorUserId, action: "PLACE_REOPENED", targetType: "Participant", targetId: personId, reason });
    return done({ id: personId });
  });
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Completing a whole program

export type ProgramPlan = {
  completable: { ok: boolean; why: string | null };
  willComplete: { participantId: string; name: string; groupPath: string; meets: boolean; why: string[]; owes: number }[];
  skipped: { participantId: string; name: string; reason: string }[];
  owing: number;
  rule: CompletionRule;
};

async function planProgram(
  programId: string,
  program: {
    kind: string;
    status: string;
    endsOn: Date | null;
    completionMinAverage: Prisma.Decimal | null;
    completionRequirePassed: boolean;
  },
): Promise<ProgramPlan> {
  const todayDay = today();
  const groups = await groupsOf(prisma, programId);
  const people = await rollPeople({ programId, status: ProgramPlaceStatus.ACTIVE }, todayDay);
  const rule = ruleOf(program);
  const evalOf = await evaluate(programId, people, rule);
  const willComplete: ProgramPlan["willComplete"] = [];
  const skipped: ProgramPlan["skipped"] = [];
  for (const p of people) {
    const can = placeCompletable(p.status, p.state);
    if (!can.ok) {
      skipped.push({ participantId: p.id, name: p.name, reason: can.why ?? "Not completed." });
      continue;
    }
    const e = evalOf(p);
    willComplete.push({
      participantId: p.id,
      name: p.name,
      groupPath: groupPath(groups, p.groupId),
      meets: e.meets.ok,
      why: e.meets.why,
      owes: e.owesCents / 100,
    });
  }
  return {
    completable: programCompletable(
      { kind: program.kind, status: program.status, endsOn: program.endsOn ? toIsoDate(program.endsOn) : null },
      todayDay,
    ),
    willComplete,
    skipped,
    owing: willComplete.filter((w) => w.owes > 0).length,
    rule,
  };
}

/// Who the completion of the program would complete, who is skipped and why, who does not meet the rule, and who still owes: before anything happens.
export async function previewProgramCompletion(actorUserId: string, programId: string): Promise<Result<ProgramPlan>> {
  const viewer = await manager(actorUserId, programId);
  if (!viewer.ok) return viewer;
  const program = await prisma.program.findUniqueOrThrow({ where: { id: programId } });
  return done(await planProgram(programId, program));
}

/// Completes the program in one step under its lock: every open place whose person is taking part becomes COMPLETED, and the program becomes COMPLETED. Anyone who does not meet the rule
/// needs an override with a reason (given here), or the whole step is refused and nothing changes. Suspended, expelled and departed places are not completed.
export async function completeProgram(
  actorUserId: string,
  programId: string,
  overrides: { participantId: string; reason: string }[],
): Promise<Result<{ completed: number; skipped: number; overridden: number }>> {
  return change(actorUserId, programId, "manage", async ({ tx, program }) => {
    const plan = await planProgram(programId, program);
    if (!plan.completable.ok) return refuse(409, "NOT_COMPLETABLE", plan.completable.why ?? "The program can't be completed.");
    const reasons = new Map(overrides.map((o) => [o.participantId, o.reason.trim()]));
    const blocked = plan.willComplete.filter((w) => !w.meets && (reasons.get(w.participantId)?.length ?? 0) < MIN_REASON_LENGTH);
    if (blocked.length > 0)
      return refuse(
        409,
        "RULE_NOT_MET",
        `${blocked.length} ${blocked.length === 1 ? "person does not" : "people do not"} meet the completion rule. Give a reason for each to complete them anyway, or withdraw them first.`,
        blocked.slice(0, 50).map((b) => ({ path: `body.overrides.${b.participantId}`, message: `${b.name}: ${b.why.join(" ")}` })),
      );
    const endedOn = asDate(today());
    let overridden = 0;
    for (const w of plan.willComplete) {
      const reason = w.meets ? null : (reasons.get(w.participantId) ?? null);
      if (reason) overridden += 1;
      await tx.programParticipant.update({
        where: { id: w.participantId },
        data: {
          status: ProgramPlaceStatus.COMPLETED,
          endedOn,
          endedReason: "Completed with the program",
          completionOverrideReason: reason,
        },
      });
    }
    await tx.program.update({ where: { id: programId }, data: { status: ProgramStatus.COMPLETED } });
    await writeAudit(tx, {
      programId,
      actorUserId,
      action: "PROGRAM_COMPLETED",
      targetType: "Program",
      targetId: programId,
      before: { status: program.status },
      after: { status: "COMPLETED", completed: plan.willComplete.length, skipped: plan.skipped.length, overridden, owing: plan.owing },
    });
    return done({ completed: plan.willComplete.length, skipped: plan.skipped.length, overridden });
  });
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Certificates

const newToken = (): string => randomBytes(32).toString("base64url");

async function nextSerial(tx: Prisma.TransactionClient, year: number): Promise<string> {
  const rows = await tx.$queryRaw<{ seq: number }[]>`
    INSERT INTO "ProgramCertificateCounter" ("year", "next") VALUES (${year}::int, 2)
    ON CONFLICT ("year") DO UPDATE SET "next" = "ProgramCertificateCounter"."next" + 1
    RETURNING ("next" - 1)::int AS seq`;
  return certificateSerial(year, rows[0]!.seq);
}

/// A token no report card already uses (the one public page tells them apart by the code alone).
async function freshToken(tx: Prisma.TransactionClient): Promise<string> {
  for (let i = 0; i < 5; i += 1) {
    const token = newToken();
    const [cert, result] = await Promise.all([
      tx.programCertificate.findUnique({ where: { verifyToken: token }, select: { id: true } }),
      tx.result.findUnique({ where: { verificationToken: token }, select: { id: true } }),
    ]);
    if (!cert && !result) return token;
  }
  throw new Error("Could not make a unique verification code");
}

export type IssueResult = { issued: number; skipped: { participantId: string; name: string; reason: string }[] };

/// Issues certificates for completed places, one or all in one step: a person who already has one in force is skipped (so doing it twice makes nothing new). The wording, the name and the
/// signatories are copied onto the certificate as they are now. A person who owes fees is skipped when the program says "no certificate while fees are owed". Each is audited.
export async function issueCertificates(actorUserId: string, programId: string, participantIds?: string[]): Promise<Result<IssueResult>> {
  return change(
    actorUserId,
    programId,
    "manage",
    async ({ tx, program }) => {
      // A completed program issues its certificates (that is what completing is for); an archived one is read only.
      if (program.status === ProgramStatus.ARCHIVED)
        return refuse(409, "PROGRAM_READ_ONLY", "This program is archived. Restore it to change it.");
      const wanted = participantIds ? [...new Set(participantIds)] : null;
      if (wanted && (await tx.programParticipant.count({ where: { programId, id: { in: wanted } } })) !== wanted.length)
        return refuse(404, "NOT_FOUND", PERSON_NOT_FOUND);
      const people = await rollPeople(
        { programId, status: ProgramPlaceStatus.COMPLETED, ...(wanted ? { id: { in: wanted } } : {}) },
        today(),
      );
      const have = new Set(
        (await tx.programCertificate.findMany({ where: { programId, status: "ISSUED" }, select: { participantId: true } })).map(
          (c) => c.participantId,
        ),
      );
      const owing = program.noCertWhileOwing ? await owingByPerson(programId) : new Map<string, number>();
      const school = (await getSchoolSettings()).name;
      const signatories: Signatory[] = parseSignatories(program.certSignatories);
      const skipped: IssueResult["skipped"] = [];
      const year = new Date().getUTCFullYear();
      const issuedOn = today();
      let issued = 0;
      const wantedSet = wanted ? new Set(wanted) : null;
      if (wantedSet)
        for (const id of wantedSet)
          if (!people.some((p) => p.id === id)) skipped.push({ participantId: id, name: "", reason: "The place is not completed." });
      for (const person of people) {
        if (have.has(person.id)) continue;
        if ((owing.get(person.id) ?? 0) > 0) {
          skipped.push({ participantId: person.id, name: person.name, reason: "Still owes fees." });
          continue;
        }
        if (issued >= MAX_ISSUE_BATCH) {
          skipped.push({
            participantId: person.id,
            name: person.name,
            reason: `Only ${MAX_ISSUE_BATCH} are issued at a time: do it again.`,
          });
          continue;
        }
        const completedOn = person.endedOn ? toIsoDate(person.endedOn) : issuedOn;
        const previous = await tx.programCertificate.findFirst({
          where: { programId, participantId: person.id, status: "REVOKED" },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        });
        const text = fillWording(program.certBody, {
          name: person.name,
          program: program.name,
          from: longDate(toIsoDate(person.joinedOn)),
          to: longDate(completedOn),
          school,
        });
        const created = await tx.programCertificate.create({
          data: {
            programId,
            participantId: person.id,
            serialNo: await nextSerial(tx, year),
            verifyToken: await freshToken(tx),
            issuedOn: asDate(issuedOn),
            completedOn: asDate(completedOn),
            title: fillWording(program.certTitle, { name: person.name, program: program.name, from: "", to: "", school }),
            bodyText: text,
            personName: person.name,
            programName: program.name,
            schoolName: school,
            signatories: signatories as unknown as Prisma.InputJsonValue,
            replacesId: previous?.id ?? null,
            issuedByUserId: actorUserId,
          },
        });
        await writeAudit(tx, {
          programId,
          actorUserId,
          action: "CERTIFICATE_ISSUED",
          targetType: "Certificate",
          targetId: created.id,
          after: { serialNo: created.serialNo, participantId: person.id },
        });
        issued += 1;
      }
      return done({ issued, skipped });
    },
    { allowArchived: true },
  );
}

/// Withdraws a certificate with a reason that is kept. It stays in the records, the public page says it was withdrawn, and a new one can be issued for the person.
export async function revokeCertificate(
  actorUserId: string,
  programId: string,
  certificateId: string,
  reason: string,
): Promise<Result<{ id: string }>> {
  return change(
    actorUserId,
    programId,
    "manage",
    async ({ tx }) => {
      const cert = await tx.programCertificate.findFirst({ where: { id: certificateId, programId } });
      if (!cert) return refuse(404, "NOT_FOUND", CERT_NOT_FOUND);
      if (cert.status === "REVOKED") return refuse(409, "NOT_APPLICABLE", "That certificate was already withdrawn.");
      await tx.programCertificate.update({
        where: { id: certificateId },
        data: { status: "REVOKED", revokedAt: new Date(), revokedByUserId: actorUserId, revokeReason: reason },
      });
      await writeAudit(tx, {
        programId,
        actorUserId,
        action: "CERTIFICATE_REVOKED",
        targetType: "Certificate",
        targetId: certificateId,
        after: { serialNo: cert.serialNo },
        reason,
      });
      return done({ id: certificateId });
    },
    { allowArchived: true },
  );
}

export type CertificateRow = {
  id: string;
  serialNo: string;
  participantId: string;
  personName: string;
  issuedOn: string;
  completedOn: string;
  status: ProgramCertificateStatus;
  revokedAt: string | null;
  branchId: string;
};

const certificateReach = (viewer: ProgramViewer): Prisma.ProgramCertificateWhereInput | null =>
  viewer.level === "SUPER" || viewer.level === "ADMIN"
    ? {}
    : viewer.level === "BRANCH"
      ? { participant: { branchId: { in: viewer.branchIds } } }
      : null;

/// The program's certificates: a super admin and a program admin all of them; a branch administrator those of people through their own branch; anyone else none.
export async function listCertificates(actorUserId: string, programId: string): Promise<Result<{ certificates: CertificateRow[] }>> {
  const viewer = await viewerOf(actorUserId, programId);
  if (!viewer) return refuse(404, "NOT_FOUND", NOT_FOUND);
  const reach = certificateReach(viewer);
  if (!reach) return refuse(403, "FORBIDDEN", "You don't have permission to see the certificates.");
  const rows = await prisma.programCertificate.findMany({
    where: { programId, AND: [reach] },
    include: { participant: { select: { branchId: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: 2000,
  });
  return done({
    certificates: rows.map((c) => ({
      id: c.id,
      serialNo: c.serialNo,
      participantId: c.participantId,
      personName: c.personName,
      issuedOn: toIsoDate(c.issuedOn),
      completedOn: toIsoDate(c.completedOn),
      status: c.status,
      revokedAt: c.revokedAt?.toISOString() ?? null,
      branchId: c.participant.branchId,
    })),
  });
}

export type CertificateView = {
  id: string;
  serialNo: string;
  verifyToken: string;
  title: string;
  bodyText: string;
  personName: string;
  programName: string;
  schoolName: string;
  signatories: Signatory[];
  issuedOn: string;
  completedOn: string;
  status: ProgramCertificateStatus;
  revokedAt: string | null;
};

/// One certificate for its print page: the snapshot as it was issued, and the code for its QR.
export async function getCertificate(actorUserId: string, programId: string, certificateId: string): Promise<Result<CertificateView>> {
  const viewer = await viewerOf(actorUserId, programId);
  if (!viewer) return refuse(404, "NOT_FOUND", NOT_FOUND);
  const reach = certificateReach(viewer);
  if (!reach) return refuse(403, "FORBIDDEN", "You don't have permission to see the certificates.");
  const c = await prisma.programCertificate.findFirst({ where: { id: certificateId, programId, AND: [reach] } });
  if (!c) return refuse(404, "NOT_FOUND", CERT_NOT_FOUND);
  return done({
    id: c.id,
    serialNo: c.serialNo,
    verifyToken: c.verifyToken,
    title: c.title,
    bodyText: c.bodyText,
    personName: c.personName,
    programName: c.programName,
    schoolName: c.schoolName,
    signatories: parseSignatories(c.signatories),
    issuedOn: toIsoDate(c.issuedOn),
    completedOn: toIsoDate(c.completedOn),
    status: c.status,
    revokedAt: c.revokedAt?.toISOString() ?? null,
  });
}
