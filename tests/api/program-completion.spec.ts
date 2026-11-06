import "../support/env";
import { randomBytes } from "node:crypto";
import { test, expect } from "@playwright/test";
import { Role } from "@prisma/client";
import { db, resetDatabase } from "../support/db";
import { api } from "../support/http";
import { PROGRAMS, buildWorld, day, get, post, send, staffIn, type Person, type World } from "../support/programs";

// Programs, slice P5 (task 0043, section 12): completing a place or a whole fixed-term program, the completion rule and its override, certificates (a snapshot, withdrawn never deleted),
// and the public check page. Real HTTP against a production build, real database.

let w: World;
const base = () => `${PROGRAMS}/${w.program}`;
const settings = (who: Person, body: Record<string, unknown>, id = w.program) => send("PATCH", `${PROGRAMS}/${id}/settings`, who, body);
const complete = (who: Person, personId: string, body: Record<string, unknown> = {}) =>
  post(`${base()}/completion/places/${personId}`, who, body);
const reopen = (who: Person, personId: string, reason = "Completed by mistake") =>
  post(`${base()}/completion/places/${personId}/reopen`, who, { reason });
const issue = (who: Person, participantIds?: string[]) => post(`${base()}/certificates`, who, participantIds ? { participantIds } : {});
const certs = (who: Person) => get(`${base()}/certificates`, who);
const revoke = (who: Person, id: string, reason = "Issued to the wrong person") =>
  post(`${base()}/certificates/${id}`, who, { action: "revoke", reason });
const verify = (token: string) => api(`/api/v1/verify/${token}`);
const view = async (who: Person) => (await get(`${base()}/completion`, who)).json.data;
const row = async (who: Person, id: string) => (await view(who)).rows.find((r: { participantId: string }) => r.participantId === id);

/// A published assessment out of 100 with a pass mark of 50, required for completion, and these scores.
async function published(scores: Record<string, number>, over: Record<string, unknown> = {}) {
  expect((await settings(w.sa, { assessmentsEnabled: true })).status).toBe(200);
  const made = await post(`${base()}/assessments`, w.sa, {
    title: "Final exam",
    kind: "Exam",
    date: day(0),
    maxScore: 100,
    passMark: 50,
    weight: 1,
    required: true,
    groupIds: [],
    ...over,
  });
  expect(made.status, made.text).toBe(201);
  const id = made.json.data.id;
  expect((await post(`${base()}/assessments/${id}`, w.sa, { action: "open" })).status).toBe(200);
  const saved = await send("PUT", `${base()}/assessments/${id}/scores`, w.sa, {
    entries: Object.entries(scores).map(([participantId, score]) => ({ participantId, score })),
  });
  expect(saved.status, saved.text).toBe(200);
  expect((await post(`${base()}/assessments/${id}`, w.sa, { action: "mark" })).status).toBe(200);
  expect((await post(`${base()}/assessments/${id}`, w.sa, { action: "publish" })).status).toBe(200);
  return id as string;
}

/// A fixed-term program of its own whose end date has passed (or not), with three adults in it.
async function fixedTerm(ended = true) {
  const created = await post(PROGRAMS, w.sa, {
    name: "Tailoring course",
    kind: "FIXED_TERM",
    startsOn: day(-60),
    endsOn: day(30),
    branchIds: [w.A.id],
    levelLabels: ["Class"],
  });
  expect(created.status, created.text).toBe(201);
  const id = created.json.data.id as string;
  const group = (await post(`${PROGRAMS}/${id}/groups`, w.sa, { name: "Morning", parentId: null })).json.data.id as string;
  expect((await post(`${PROGRAMS}/${id}/status`, w.sa, { action: "activate" })).status).toBe(200);
  let seq = 0;
  const add = async (firstName: string) => {
    seq += 1;
    const r = await post(`${PROGRAMS}/${id}/people`, w.sa, {
      kind: "ADULT",
      firstName,
      lastName: "Trainee",
      branchId: w.A.id,
      groupId: group,
      phone: `0803123456${seq}`,
    });
    expect(r.status, r.text).toBe(201);
    return r.json.data.id as string;
  };
  const [one, two, three] = [await add("Ada"), await add("Bola"), await add("Chidi")];
  await db.programParticipant.updateMany({ where: { programId: id }, data: { joinedOn: new Date(day(-30)) } });
  await db.program.update({ where: { id }, data: { endsOn: new Date(day(ended ? -1 : 5)) } });
  return { id, group, one, two, three };
}

test.beforeEach(async () => {
  w = await buildWorld();
});

test.afterAll(async () => {
  await resetDatabase();
});

test.describe("reaching the routes", () => {
  test("nobody signed out can do anything; a member of staff with no place finds no program; only administrators complete, and a branch administrator reads only certificates", async () => {
    expect((await complete(w.sa, w.amina)).status).toBe(200);
    const cert = (await issue(w.sa)).json.data;
    expect(cert.issued).toBe(1);
    const certId = (await certs(w.sa)).json.data.certificates[0].id;
    for (const [method, path] of [
      ["GET", `${base()}/completion`],
      ["POST", `${base()}/completion`],
      ["POST", `${base()}/completion/places/${w.amina}`],
      ["POST", `${base()}/completion/places/${w.amina}/reopen`],
      ["GET", `${base()}/certificates`],
      ["POST", `${base()}/certificates`],
      ["GET", `${base()}/certificates/${certId}`],
      ["POST", `${base()}/certificates/${certId}`],
    ] as const)
      expect((await api(path, { method, body: method === "GET" ? undefined : {} })).status, `${method} ${path}`).toBe(401);
    const outsider = await staffIn(w.B.id, Role.TEACHING_STAFF, "Outsider");
    for (const r of [
      await get(`${base()}/completion`, outsider),
      await certs(outsider),
      await get(`${base()}/certificates/${certId}`, outsider),
    ])
      expect(r.status).toBe(404);
    for (const who of [w.teacher, w.supervisor, w.recorder, w.loner, w.adminA]) {
      expect((await get(`${base()}/completion`, who)).status, who.name).toBe(403);
      expect((await complete(who, w.binta)).status).toBe(403);
      expect((await post(`${base()}/completion`, who, { confirm: true })).status).toBe(403);
      expect((await issue(who)).status).toBe(403);
      expect((await revoke(who, certId)).status).toBe(403);
    }
    for (const who of [w.teacher, w.supervisor, w.loner]) {
      expect((await certs(who)).status, who.name).toBe(403);
      expect((await get(`${base()}/certificates/${certId}`, who)).status).toBe(403);
    }
    expect((await certs(w.adminA)).json.data.certificates).toHaveLength(1);
    expect((await certs(w.adminB)).json.data.certificates).toHaveLength(0);
    expect((await get(`${base()}/certificates/${certId}`, w.adminA)).status).toBe(200);
    expect((await get(`${base()}/certificates/${certId}`, w.adminB)).status).toBe(404);
  });
});

test.describe("completing one place", () => {
  test("any time, by a super admin or a program admin; the place becomes completed today and says so", async () => {
    const done = await complete(w.progAdmin, w.amina, { note: "Finished Juz 1" });
    expect(done.status, done.text).toBe(200);
    const place = await db.programParticipant.findUniqueOrThrow({ where: { id: w.amina } });
    expect(place).toMatchObject({ status: "COMPLETED", endedReason: "Finished Juz 1", completionOverrideReason: null });
    expect(place.endedOn!.toISOString().slice(0, 10)).toBe(day(0));
    const shown = await row(w.sa, w.amina);
    expect(shown).toMatchObject({ status: "COMPLETED", completedOn: day(0), certificate: null });
    expect((await get(`${base()}/people/${w.amina}`, w.sa)).json.data.person.state).toBe("COMPLETED");
    expect(await db.programAudit.count({ where: { action: "PLACE_COMPLETED" } })).toBe(1);
    // once only
    expect((await complete(w.sa, w.amina)).json.error.code).toBe("NOT_APPLICABLE");
    expect((await complete(w.sa, "well-formed-but-nothing")).status).toBe(404);
    expect((await post(`${base()}/completion/places/${w.binta}`, w.sa, { extra: 1 })).status).toBe(400);
    expect((await post(`${base()}/completion/places/${w.binta}`, w.sa, { note: "n".repeat(201) })).status).toBe(400);
  });

  test("a suspended, withdrawn or expelled person's place is not completed", async () => {
    expect((await post(`${base()}/people/${w.hauwa}/standing`, w.sa, { action: "suspend", reason: "Disturbing the class" })).status).toBe(
      200,
    );
    expect((await post(`${base()}/people/${w.binta}/place`, w.sa, { action: "withdraw", reason: "Moved away" })).status).toBe(200);
    expect((await complete(w.sa, w.hauwa)).json.error.code).toBe("NOT_APPLICABLE");
    expect((await complete(w.sa, w.binta)).json.error.code).toBe("NOT_APPLICABLE");
    expect((await row(w.sa, w.hauwa)).completable).toEqual({ ok: false, why: "Suspended: lift the suspension first." });
    expect(await db.programParticipant.count({ where: { status: "COMPLETED" } })).toBe(0);
  });

  test("a completion rule: an average and/or every required assessment passed; a person who does not meet it is completed only with a reason, which is kept", async () => {
    await published({ [w.amina]: 80, [w.binta]: 40, [w.cara]: 90, [w.hauwa]: 70 });
    expect((await settings(w.progAdmin, { completionMinAverage: 70, completionRequirePassed: true })).status).toBe(200);
    expect((await row(w.sa, w.amina)).meets).toEqual({ ok: true, why: [] });
    expect((await row(w.sa, w.hauwa)).meets.ok).toBe(true);
    const binta = await row(w.sa, w.binta);
    expect(binta.meets.ok).toBe(false);
    expect(binta.meets.why).toEqual(["The average is 40%, under 70%.", "1 required assessment is not passed."]);

    const refused = await complete(w.sa, w.binta);
    expect(refused.status).toBe(409);
    expect(refused.json.error.code).toBe("RULE_NOT_MET");
    expect(refused.json.error.details).toHaveLength(2);
    expect((await complete(w.sa, w.binta, { overrideReason: "ok" })).status).toBe(400); // a reason is at least 3 characters
    expect((await complete(w.sa, w.amina)).status).toBe(200);
    const over = await complete(w.progAdmin, w.binta, { overrideReason: "Sat the exam ill; the head agreed" });
    expect(over.status, over.text).toBe(200);
    expect((await db.programParticipant.findUniqueOrThrow({ where: { id: w.binta } })).completionOverrideReason).toBe(
      "Sat the exam ill; the head agreed",
    );
    expect((await row(w.sa, w.binta)).overrideReason).toBe("Sat the exam ill; the head agreed");
    expect(await db.programAudit.count({ where: { action: "PLACE_COMPLETED", reason: "Sat the exam ill; the head agreed" } })).toBe(1);
    // a reason given to someone who meets the rule is not stored
    expect((await complete(w.sa, w.cara, { overrideReason: "not needed" })).status).toBe(200);
    expect((await db.programParticipant.findUniqueOrThrow({ where: { id: w.cara } })).completionOverrideReason).toBeNull();
  });

  test("a person with no published result does not meet an average rule; a rule can also be taken away", async () => {
    expect((await settings(w.sa, { completionMinAverage: 50 })).status).toBe(200);
    const none = await row(w.sa, w.amina);
    expect(none.meets).toEqual({ ok: false, why: ["No result counts toward the average yet."] });
    expect((await settings(w.sa, { completionMinAverage: null })).status).toBe(200);
    expect((await row(w.sa, w.amina)).meets.ok).toBe(true);
  });

  test("a super admin can reopen a completed place with a reason - not while a certificate is in force", async () => {
    expect((await complete(w.sa, w.amina)).status).toBe(200);
    expect((await reopen(w.progAdmin, w.amina)).status).toBe(403);
    expect((await reopen(w.sa, w.binta)).json.error.code).toBe("NOT_APPLICABLE");
    expect((await post(`${base()}/completion/places/${w.amina}/reopen`, w.sa, { reason: "x" })).status).toBe(400);
    expect((await issue(w.sa)).json.data.issued).toBe(1);
    expect((await reopen(w.sa, w.amina)).json.error.code).toBe("HAS_CERTIFICATE");
    const certId = (await certs(w.sa)).json.data.certificates[0].id;
    expect((await revoke(w.sa, certId)).status).toBe(200);
    const done = await reopen(w.sa, w.amina, "She had not finished the last unit");
    expect(done.status, done.text).toBe(200);
    expect(await db.programParticipant.findUniqueOrThrow({ where: { id: w.amina } })).toMatchObject({
      status: "ACTIVE",
      endedOn: null,
      endedReason: null,
    });
    expect(await db.programAudit.count({ where: { action: "PLACE_REOPENED", reason: "She had not finished the last unit" } })).toBe(1);
  });
});

test.describe("completing a whole program", () => {
  test("a program that never ends is archived, not completed; a fixed-term one only once it has reached its end date", async () => {
    const preview = await post(`${base()}/completion`, w.sa, {});
    expect(preview.json.data.completable).toEqual({ ok: false, why: expect.stringContaining("never ends") });
    const refused = await post(`${base()}/completion`, w.sa, { confirm: true });
    expect(refused.status).toBe(409);
    expect(refused.json.error.code).toBe("NOT_COMPLETABLE");
    const early = await fixedTerm(false);
    expect((await post(`${PROGRAMS}/${early.id}/completion`, w.sa, {})).json.data.completable.why).toMatch(/not reached its end date/);
    expect((await post(`${PROGRAMS}/${early.id}/completion`, w.sa, { confirm: true })).json.error.code).toBe("NOT_COMPLETABLE");
    expect(await db.programParticipant.count({ where: { programId: early.id, status: "COMPLETED" } })).toBe(0);
    expect((await db.program.findUniqueOrThrow({ where: { id: early.id } })).status).toBe("ACTIVE");
  });

  test("the preview says who would be completed and who is skipped; confirming completes the places and the program in one step", async () => {
    const t = await fixedTerm();
    expect(
      (await post(`${PROGRAMS}/${t.id}/people/${t.two}/standing`, w.sa, { action: "suspend", reason: "Disturbing the class" })).status,
    ).toBe(200);
    expect((await post(`${PROGRAMS}/${t.id}/people/${t.three}/place`, w.sa, { action: "withdraw", reason: "Moved away" })).status).toBe(
      200,
    );
    const preview = (await post(`${PROGRAMS}/${t.id}/completion`, w.sa, {})).json.data;
    expect(preview.completable.ok).toBe(true);
    expect(preview.willComplete.map((p: { participantId: string }) => p.participantId)).toEqual([t.one]);
    expect(preview.skipped.map((s: { participantId: string }) => s.participantId)).toEqual([t.two]);
    expect(await db.programParticipant.count({ where: { programId: t.id, status: "COMPLETED" } })).toBe(0);

    expect((await post(`${PROGRAMS}/${t.id}/completion`, w.adminA, { confirm: true })).status).toBe(403); // a branch administrator reads, never completes
    expect((await post(`${PROGRAMS}/${t.id}/completion`, w.teacher, { confirm: true })).status).toBe(404); // no place in this program: it does not exist for them
    const done = await post(`${PROGRAMS}/${t.id}/completion`, w.sa, { confirm: true });
    expect(done.status, done.text).toBe(200);
    expect(done.json.data).toEqual({ completed: 1, skipped: 1, overridden: 0 });
    const places = await db.programParticipant.findMany({ where: { programId: t.id }, orderBy: { firstName: "asc" } });
    expect(places.map((p) => p.status)).toEqual(["COMPLETED", "ACTIVE", "WITHDRAWN"]); // the suspended person's place stays as it was
    expect((await db.program.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("COMPLETED");
    expect(await db.programAudit.count({ where: { programId: t.id, action: "PROGRAM_COMPLETED" } })).toBe(1);
    // a completed program is read only ... except that its certificates are issued and can be withdrawn
    expect(
      (
        await post(`${PROGRAMS}/${t.id}/people`, w.sa, {
          kind: "ADULT",
          firstName: "Late",
          lastName: "Comer",
          branchId: w.A.id,
          groupId: t.group,
          phone: "08031234567",
        })
      ).json.error.code,
    ).toBe("PROGRAM_READ_ONLY");
    expect((await post(`${PROGRAMS}/${t.id}/completion`, w.sa, { confirm: true })).json.error.code).toBe("PROGRAM_READ_ONLY");
    const issued = await post(`${PROGRAMS}/${t.id}/certificates`, w.sa, {});
    expect(issued.status, issued.text).toBe(201);
    expect(issued.json.data.issued).toBe(1);
    const certList = (await get(`${PROGRAMS}/${t.id}/certificates`, w.sa)).json.data.certificates;
    expect(
      (await post(`${PROGRAMS}/${t.id}/certificates/${certList[0].id}`, w.sa, { action: "revoke", reason: "Issued in error" })).status,
    ).toBe(200);
  });

  test("anyone who does not meet the rule needs a reason or the whole step is refused and nothing changes", async () => {
    const t = await fixedTerm();
    expect((await settings(w.sa, { completionMinAverage: 60 }, t.id)).status).toBe(200);
    const preview = (await post(`${PROGRAMS}/${t.id}/completion`, w.sa, {})).json.data;
    expect(preview.willComplete.every((p: { meets: boolean }) => !p.meets)).toBe(true);
    const refused = await post(`${PROGRAMS}/${t.id}/completion`, w.sa, {
      confirm: true,
      overrides: [{ participantId: t.one, reason: "The tutor vouches for her" }],
    });
    expect(refused.status).toBe(409);
    expect(refused.json.error.code).toBe("RULE_NOT_MET");
    expect(refused.json.error.details).toHaveLength(2);
    expect(await db.programParticipant.count({ where: { programId: t.id, status: "COMPLETED" } })).toBe(0);
    expect((await db.program.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("ACTIVE");
    const done = await post(`${PROGRAMS}/${t.id}/completion`, w.sa, {
      confirm: true,
      overrides: [t.one, t.two, t.three].map((participantId) => ({ participantId, reason: "Practical work counts instead" })),
    });
    expect(done.json.data).toEqual({ completed: 3, skipped: 0, overridden: 3 });
    expect((await db.programParticipant.findUniqueOrThrow({ where: { id: t.two } })).completionOverrideReason).toBe(
      "Practical work counts instead",
    );
    expect(
      (await post(`${PROGRAMS}/${t.id}/completion`, w.sa, { confirm: true, overrides: [{ participantId: t.one, reason: "x" }] })).status,
    ).toBe(400);
  });

  test("owing money is a warning, never a block", async () => {
    const t = await fixedTerm();
    expect((await settings(w.sa, { feesEnabled: true }, t.id)).status).toBe(200);
    expect((await post(`${PROGRAMS}/${t.id}/fees/items`, w.sa, { name: "Course fee", amount: 3000, frequency: "ONCE" })).status).toBe(201);
    expect((await post(`${PROGRAMS}/${t.id}/fees/generate`, w.sa, { periodKey: "once", confirm: true })).json.data.created).toBe(3);
    const preview = (await post(`${PROGRAMS}/${t.id}/completion`, w.sa, {})).json.data;
    expect(preview.owing).toBe(3);
    expect(preview.willComplete.every((p: { owes: number }) => p.owes === 3000)).toBe(true);
    expect((await post(`${PROGRAMS}/${t.id}/completion`, w.sa, { confirm: true })).json.data.completed).toBe(3);
  });
});

test.describe("certificates", () => {
  test("issued for completed places, one or all; a person who has one is skipped, so twice makes nothing new; the wording and the name are copied onto it", async () => {
    expect(
      (
        await settings(w.sa, {
          certTitle: "Certificate of Memorisation",
          certBody: "{name} memorised a portion of the Quran in {program} at {school}, from {from} to {to}.",
          certSignatories: [{ name: "Sheikh Musa", title: "Head of program" }],
        })
      ).status,
    ).toBe(200);
    expect((await complete(w.sa, w.amina)).status).toBe(200);
    expect((await complete(w.sa, w.cara)).status).toBe(200);
    expect((await issue(w.sa, [w.binta])).json.data.skipped).toEqual([
      { participantId: w.binta, name: "", reason: "The place is not completed." },
    ]);
    const first = await issue(w.progAdmin, [w.amina]);
    expect(first.status, first.text).toBe(201);
    expect(first.json.data.issued).toBe(1);
    const all = await issue(w.sa);
    expect(all.json.data.issued).toBe(1); // only Cara: Amina has one in force
    expect((await issue(w.sa)).json.data.issued).toBe(0);
    const rows = await db.programCertificate.findMany({ orderBy: { serialNo: "asc" } });
    expect(rows).toHaveLength(2);
    const year = new Date().getUTCFullYear();
    expect(rows.map((r) => r.serialNo)).toEqual([`CERT-${year}-0001`, `CERT-${year}-0002`]);
    for (const r of rows) {
      expect(r.verifyToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(r.status).toBe("ISSUED");
    }
    expect(new Set(rows.map((r) => r.verifyToken)).size).toBe(2);
    const a = rows.find((r) => r.participantId === w.amina)!;
    expect(a).toMatchObject({
      title: "Certificate of Memorisation",
      personName: "Amina Pupil",
      programName: "Quran memorisation",
      signatories: [{ name: "Sheikh Musa", title: "Head of program" }],
      issuedByUserId: w.progAdmin.id,
    });
    expect(a.bodyText).toMatch(
      /^Amina Pupil memorised a portion of the Quran in Quran memorisation at .+, from \d{1,2} \w+ \d{4} to \d{1,2} \w+ \d{4}\.$/,
    );
    expect(await db.programAudit.count({ where: { action: "CERTIFICATE_ISSUED" } })).toBe(2);

    // later changes never change a certificate that was issued
    expect(
      (await settings(w.sa, { certTitle: "Something else", certBody: "Different words for {name}", certSignatories: [] })).status,
    ).toBe(200);
    await db.studentRecord.updateMany({ where: { admissionNo: "2026/0001" }, data: { firstName: "Aminat" } });
    const again = await db.programCertificate.findUniqueOrThrow({ where: { id: a.id } });
    expect([again.title, again.bodyText, again.personName, again.signatories]).toEqual([a.title, a.bodyText, a.personName, a.signatories]);
    expect(((await get(`${base()}/certificates/${a.id}`, w.sa)).json.data as { personName: string; title: string }).personName).toBe(
      "Amina Pupil",
    );
  });

  test("a person who still owes fees is skipped when the program says so, and gets a certificate once they pay", async () => {
    expect((await settings(w.sa, { feesEnabled: true, noCertWhileOwing: true })).status).toBe(200);
    expect((await post(`${base()}/fees/items`, w.sa, { name: "Course fee", amount: 3000, frequency: "ONCE" })).status).toBe(201);
    expect((await post(`${base()}/fees/generate`, w.sa, { periodKey: "once", confirm: true })).status).toBe(200);
    expect((await complete(w.sa, w.amina)).json.data.owes).toBe(3000); // completing is never blocked, only warned about
    const skipped = await issue(w.sa);
    expect(skipped.json.data).toEqual({
      issued: 0,
      skipped: [{ participantId: w.amina, name: "Amina Pupil", reason: "Still owes fees." }],
    });
    const invoice = await db.programInvoice.findFirstOrThrow({ where: { participantId: w.amina } });
    expect((await post(`${base()}/fees/invoices/${invoice.id}/payments`, w.sa, { amount: 3000 })).status).toBe(201);
    expect((await issue(w.sa)).json.data.issued).toBe(1);
  });

  test("a certificate is withdrawn with a reason and stays on record; a new one points at the one it replaces; never two in force", async () => {
    expect((await complete(w.sa, w.amina)).status).toBe(200);
    await issue(w.sa);
    const first = (await certs(w.sa)).json.data.certificates[0];
    for (const bad of [
      { action: "revoke" },
      { action: "revoke", reason: "x" },
      { action: "delete", reason: "Because" },
      { action: "revoke", reason: "Because", extra: 1 },
    ])
      expect((await post(`${base()}/certificates/${first.id}`, w.sa, bad)).status, JSON.stringify(bad)).toBe(400);
    expect((await revoke(w.progAdmin, first.id)).status).toBe(200);
    expect((await revoke(w.sa, first.id)).json.error.code).toBe("NOT_APPLICABLE");
    const stored = await db.programCertificate.findUniqueOrThrow({ where: { id: first.id } });
    expect(stored).toMatchObject({ status: "REVOKED", revokeReason: "Issued to the wrong person", revokedByUserId: w.progAdmin.id });
    expect(stored.revokedAt).not.toBeNull();
    expect(await db.programAudit.count({ where: { action: "CERTIFICATE_REVOKED", reason: "Issued to the wrong person" } })).toBe(1);

    expect((await issue(w.sa)).json.data.issued).toBe(1);
    const all = await db.programCertificate.findMany({ orderBy: { createdAt: "asc" } });
    expect(all).toHaveLength(2);
    expect(all[1]!.serialNo).not.toBe(all[0]!.serialNo);
    expect(all[1]!.replacesId).toBe(all[0]!.id);
    expect(all.map((c) => c.status)).toEqual(["REVOKED", "ISSUED"]);
    // the database itself allows one certificate in force per person and program
    await expect(
      db.programCertificate.create({
        data: {
          programId: w.program,
          participantId: w.amina,
          serialNo: "CERT-9999-0001",
          verifyToken: randomBytes(32).toString("base64url"),
          issuedOn: new Date(),
          completedOn: new Date(),
          title: "T",
          bodyText: "B",
          personName: "P",
          programName: "G",
          schoolName: "S",
          issuedByUserId: w.sa.id,
        },
      }),
    ).rejects.toThrow();
    expect((await certs(w.sa)).json.data.certificates.map((c: { status: string }) => c.status).sort()).toEqual(["ISSUED", "REVOKED"]);
  });

  test("the print data is the snapshot and the code for the QR; reach: a branch administrator only their branch", async () => {
    expect((await complete(w.sa, w.amina)).status).toBe(200);
    expect((await complete(w.sa, w.cara)).status).toBe(200);
    await issue(w.sa);
    const list = (await certs(w.sa)).json.data.certificates as { id: string; participantId: string }[];
    const amina = list.find((c) => c.participantId === w.amina)!;
    const one = (await get(`${base()}/certificates/${amina.id}`, w.progAdmin)).json.data;
    expect(one).toMatchObject({
      personName: "Amina Pupil",
      status: "ISSUED",
      signatories: [],
      verifyToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    });
    expect(one.title).toBe("Certificate of Completion");
    expect(one.bodyText).toMatch(/^This is to certify that Amina Pupil has completed Quran memorisation at .+, from .+ to .+\.$/);
    expect((await get(`${base()}/certificates/well-formed-but-nothing`, w.sa)).status).toBe(404);
    expect((await certs(w.adminA)).json.data.certificates.map((c: { participantId: string }) => c.participantId)).toEqual([w.amina]);
    expect((await certs(w.adminB)).json.data.certificates.map((c: { participantId: string }) => c.participantId)).toEqual([w.cara]);
  });
});

test.describe("the public check page", () => {
  async function oneCertificate(): Promise<{ token: string; id: string }> {
    expect((await complete(w.sa, w.amina)).status).toBe(200);
    await issue(w.sa);
    const id = (await certs(w.sa)).json.data.certificates[0].id as string;
    const token = (await get(`${base()}/certificates/${id}`, w.sa)).json.data.verifyToken as string;
    return { token, id };
  }

  test("anyone with the code learns that it is genuine, the program, when - and the person as first name and last initial only; nothing private", async () => {
    const { token } = await oneCertificate();
    const res = await verify(token);
    expect(res.status).toBe(200);
    const v = res.json.data.verification;
    expect(v).toEqual({
      kind: "CERTIFICATE",
      genuine: true,
      withdrawn: false,
      school: expect.any(String),
      program: "Quran memorisation",
      title: "Certificate of Completion",
      person: "Amina P.",
      completedOn: day(0),
      issuedOn: day(0),
      serialNo: expect.stringMatching(/^CERT-\d{4}-0001$/),
    });
    const text = JSON.stringify(res.json);
    for (const secret of ["Pupil", "2348011110001", "parent", "2026/0001", w.amina, "score", "grade", "email"])
      expect(text, secret).not.toContain(secret);

    const page = await api(`/verify/${token}`);
    expect(page.status).toBe(200);
    expect(page.text).toContain("This certificate is genuine.");
    expect(page.text).toContain("Amina P.");
    expect(page.text).toContain("Quran memorisation");
    for (const secret of ["Amina Pupil", "2348011110001", "2026/0001"]) expect(page.text, secret).not.toContain(secret);
    expect(page.text).toContain("noindex");
  });

  test("a withdrawn certificate says so, and gives no reason", async () => {
    const { token, id } = await oneCertificate();
    expect((await revoke(w.sa, id, "Issued to the wrong person by mistake")).status).toBe(200);
    const v = (await verify(token)).json.data.verification;
    expect(v).toMatchObject({ withdrawn: true, genuine: true });
    expect(JSON.stringify(v)).not.toContain("wrong person");
    const page = await api(`/verify/${token}`);
    expect(page.text).toContain("withdrawn");
    expect(page.text).not.toContain("This certificate is genuine.");
    expect(page.text).not.toContain("wrong person");
  });

  test("a code that does not exist, or is malformed, gets the same plain answer", async () => {
    await oneCertificate();
    for (const bad of ["a".repeat(43), "short", "!".repeat(43), "a".repeat(44)]) {
      const res = await verify(bad);
      expect(res.status, bad).toBe(404);
      expect(res.json.error.code).toBe("NOT_FOUND");
    }
    const page = await api(`/verify/${"a".repeat(43)}`);
    expect(page.text).toContain("not found");
  });
});

test.describe("the wording", () => {
  test("is plain text with known placeholders only, at most 600 characters and two signatories", async () => {
    const bad: Record<string, unknown>[] = [
      { certTitle: "" },
      { certTitle: "t".repeat(81) },
      { certBody: "b".repeat(601) },
      { certBody: "Well done {nme}" },
      { certTitle: "{unknown}" },
      { certBody: "bad\u0007char" },
      {
        certSignatories: [
          { name: "A", title: "x" },
          { name: "B", title: "y" },
          { name: "C", title: "z" },
        ],
      },
      { certSignatories: [{ name: "", title: "x" }] },
      { certSignatories: [{ name: "n".repeat(61), title: "" }] },
      { certSignatories: [{ name: "A", title: "x", extra: 1 }] },
      { completionMinAverage: 101 },
      { completionMinAverage: -1 },
      { completionMinAverage: 70.123 },
      { completionRequirePassed: "yes" },
    ];
    for (const over of bad) expect((await settings(w.sa, over)).status, JSON.stringify(over)).toBe(400);
    const good = await settings(w.progAdmin, {
      certBody: "Awarded to {name} for {program}.",
      certSignatories: [{ name: "Head", title: "" }],
      completionMinAverage: 55.5,
    });
    expect(good.status, good.text).toBe(200);
    expect(good.json.data).toMatchObject({
      certBody: "Awarded to {name} for {program}.",
      certSignatories: [{ name: "Head", title: "" }],
      completionMinAverage: 55.5,
    });
    expect((await settings(w.teacher, { certTitle: "Mine" })).status).toBe(403);
    // a person named like a placeholder stays named like it: the wording is filled in one pass
    expect((await settings(w.sa, { completionMinAverage: null })).status).toBe(200); // no rule, so Amina can be completed
    await db.studentRecord.updateMany({ where: { admissionNo: "2026/0001" }, data: { firstName: "{school}" } });
    expect((await complete(w.sa, w.amina)).status).toBe(200);
    expect((await settings(w.sa, { certBody: "For {name} at {school}." })).status).toBe(200);
    await issue(w.sa);
    expect((await db.programCertificate.findFirstOrThrow()).bodyText).toMatch(/^For \{school\} Pupil at /);
  });
});

test.describe("the database", () => {
  test("refuses what the service would", async () => {
    expect((await complete(w.sa, w.amina)).status).toBe(200);
    await issue(w.sa);
    const cert = await db.programCertificate.findFirstOrThrow();
    const make = (over: Record<string, unknown>) =>
      db.programCertificate.create({
        data: {
          programId: w.program,
          participantId: w.cara,
          serialNo: `CERT-7777-${randomBytes(3).toString("hex")}`,
          verifyToken: randomBytes(32).toString("base64url"),
          issuedOn: new Date(),
          completedOn: new Date(),
          title: "T",
          bodyText: "B",
          personName: "P",
          programName: "G",
          schoolName: "S",
          issuedByUserId: w.sa.id,
          ...over,
        },
      });
    await expect(make({ verifyToken: "short" })).rejects.toThrow();
    await expect(make({ verifyToken: cert.verifyToken })).rejects.toThrow();
    await expect(make({ serialNo: cert.serialNo })).rejects.toThrow();
    await expect(make({ status: "REVOKED" })).rejects.toThrow(); // withdrawn needs a time and a reason
    await expect(make({ status: "REVOKED", revokedAt: new Date(), revokeReason: "no" })).rejects.toThrow();
    await expect(make({ title: "" })).rejects.toThrow();
    await expect(make({ participantId: "well-formed-but-nothing" })).rejects.toThrow();
    await expect(
      db.programParticipant.update({ where: { id: w.binta }, data: { completionOverrideReason: "A reason on an open place" } }),
    ).rejects.toThrow();
    await expect(db.program.update({ where: { id: w.program }, data: { completionMinAverage: 101 } })).rejects.toThrow();
    await expect(
      db.program.update({
        where: { id: w.program },
        data: {
          certSignatories: [
            { name: "a", title: "" },
            { name: "b", title: "" },
            { name: "c", title: "" },
          ],
        },
      }),
    ).rejects.toThrow();
    // one certificate in force per person and program: a second for the same person is refused until the first is withdrawn
    await expect(make({ participantId: w.amina })).rejects.toThrow();
    await expect(make({ participantId: w.cara })).resolves.toBeTruthy();
  });
});
