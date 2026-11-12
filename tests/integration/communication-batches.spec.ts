import "../support/env";
import { test, expect } from "@playwright/test";
import { Gender, NotificationChannel, NotificationDispatchStatus } from "@prisma/client";
import { db, resetDatabase, seedInstance } from "../support/db";
import { BATCH_SIZE, LEASE_MS, countWaiting, sendNextBatch } from "@/lib/communication/queue";
import { broadcastMessage } from "@/lib/communication/service";
import { clearMockTermiiMessages, getMockTermiiMessages } from "@/lib/communication/gateways/termii";

// Task 0063: a broadcast writes one row per recipient, sends the first batch and leaves the rest QUEUED; the Communication screen asks for the next batch until nothing is left. These run on the
// real database with the in-memory sender (the test process may use it).

// The stand-in sender is allowed only in the tests and the dev tools (task 0053); this process is the tests' own, so it says so (the setup file blanks the dev tools on purpose).
const env = process.env as Record<string, string | undefined>;
const before = env.NODE_ENV;
test.beforeAll(() => {
  env.NODE_ENV = "test";
});

let home: { id: string };
test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();
  clearMockTermiiMessages();
});
test.afterAll(async () => {
  env.NODE_ENV = before;
  await resetDatabase();
});

let counter = 0;
const queue = async (
  n: number,
  seed: { phone?: string; status?: NotificationDispatchStatus; updatedAt?: Date; branchId?: string } = {},
) => {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    counter += 1;
    const row = await db.notificationDispatch.create({
      data: {
        branchId: seed.branchId ?? home.id,
        channel: NotificationChannel.SMS,
        recipientAddress: seed.phone ?? `0803${String(counter).padStart(7, "0")}`,
        body: `Message ${counter}`,
        status: seed.status ?? NotificationDispatchStatus.QUEUED,
        ...(seed.updatedAt ? { updatedAt: seed.updatedAt } : {}),
      },
    });
    ids.push(row.id);
  }
  return ids;
};
const statusOf = async (ids: string[]) => (await db.notificationDispatch.findMany({ where: { id: { in: ids } } })).map((r) => r.status);

test.describe("one batch", () => {
  test("takes at most ten, oldest first, sends them, and says how many are left", async () => {
    const ids = await queue(25);
    const res = await sendNextBatch(home.id);
    expect(res).toMatchObject({ claimed: BATCH_SIZE, sent: BATCH_SIZE, failed: 0, remaining: 15, firstError: null });
    const sent = await db.notificationDispatch.findMany({
      where: { status: NotificationDispatchStatus.SENT },
      orderBy: { createdAt: "asc" },
    });
    expect(sent.map((r) => r.id)).toEqual(ids.slice(0, BATCH_SIZE));
    expect(sent.every((r) => r.sentAt !== null && r.attempts === 1 && r.lastError === null)).toBe(true);
    expect(getMockTermiiMessages()).toHaveLength(BATCH_SIZE);
    expect(await countWaiting(home.id)).toBe(15);
  });

  test("three calls empty a queue of twenty-five, and a fourth finds nothing", async () => {
    await queue(25);
    expect((await sendNextBatch(home.id)).remaining).toBe(15);
    expect((await sendNextBatch(home.id)).remaining).toBe(5);
    expect(await sendNextBatch(home.id)).toMatchObject({ claimed: 5, sent: 5, remaining: 0 });
    expect(await sendNextBatch(home.id)).toMatchObject({ claimed: 0, sent: 0, remaining: 0 });
    expect(getMockTermiiMessages()).toHaveLength(25);
  });

  test("a message that cannot be sent is FAILED with its reason, and the others in the batch are still sent", async () => {
    const [bad] = await queue(1, { phone: "not-a-phone" });
    await queue(2);
    const res = await sendNextBatch(home.id);
    expect(res).toMatchObject({ claimed: 3, sent: 2, failed: 1, remaining: 0 });
    expect(res.firstError).toBeTruthy();
    const row = await db.notificationDispatch.findUniqueOrThrow({ where: { id: bad! } });
    expect(row.status).toBe(NotificationDispatchStatus.FAILED);
    expect(row.lastError).toBe(res.firstError);
    // the sender's own reason quotes the address; what is stored and answered does not
    expect(res.firstError).toBe("Invalid phone number format: the recipient");
    expect(row.lastError).not.toContain("not-a-phone");
  });
});

test.describe("rows another call may hold", () => {
  test("two calls at once send every row exactly once", async () => {
    const ids = await queue(25);
    const results = await Promise.all([sendNextBatch(home.id), sendNextBatch(home.id), sendNextBatch(home.id)]);
    // wherever the claims fell, a row was handled by one call only: as many handled as sent, none twice
    const handled = results.reduce((n, r) => n + r.claimed, 0);
    expect(getMockTermiiMessages()).toHaveLength(handled);
    expect(new Set(getMockTermiiMessages().map((m) => m.to)).size).toBe(handled);
    const rows = await db.notificationDispatch.findMany({ where: { id: { in: ids } } });
    expect(rows.filter((r) => r.status === NotificationDispatchStatus.SENT)).toHaveLength(handled);
    expect(rows.every((r) => r.attempts <= 1)).toBe(true);
  });

  test("a PROCESSING row is left alone while its call may still be working, and taken back after the lease", async () => {
    const [fresh] = await queue(1, { status: NotificationDispatchStatus.PROCESSING });
    const [stale] = await queue(1, { status: NotificationDispatchStatus.PROCESSING, updatedAt: new Date(Date.now() - LEASE_MS - 60_000) });
    expect(await countWaiting(home.id)).toBe(1);
    const res = await sendNextBatch(home.id);
    expect(res).toMatchObject({ claimed: 1, sent: 1, remaining: 0 });
    expect(await statusOf([stale!])).toEqual([NotificationDispatchStatus.SENT]);
    expect(await statusOf([fresh!])).toEqual([NotificationDispatchStatus.PROCESSING]);
  });

  test("another branch's messages are never touched", async () => {
    const other = await db.branch.create({ data: { name: `Other ${Date.now()}` } });
    const [theirs] = await queue(1, { branchId: other.id });
    await queue(2);
    expect(await countWaiting(home.id)).toBe(2);
    expect(await sendNextBatch(home.id)).toMatchObject({ claimed: 2, remaining: 0 });
    expect(await statusOf([theirs!])).toEqual([NotificationDispatchStatus.QUEUED]);
    expect(await countWaiting(other.id)).toBe(1);
  });

  test("onlyIds restricts a call to the broadcast's own rows", async () => {
    const [older] = await queue(1);
    const mine = await queue(3);
    const res = await sendNextBatch(home.id, { onlyIds: mine });
    expect(res).toMatchObject({ claimed: 3, remaining: 1 });
    expect(await statusOf([older!])).toEqual([NotificationDispatchStatus.QUEUED]);
  });
});

test.describe("a broadcast", () => {
  const parents = async (n: number) => {
    for (let i = 0; i < n; i++) {
      await db.studentRecord.create({
        data: {
          branchId: home.id,
          firstName: `Pupil${i}`,
          lastName: "Test",
          gender: Gender.FEMALE,
          dateOfBirth: new Date("2012-05-10"),
          admissionNo: `ADM-B-${i}`,
          guardianPhone: `0802${String(i).padStart(7, "0")}`,
        },
      });
    }
  };

  test("to more than ten people writes every row, sends the first ten before it answers, and reports the rest as queued", async () => {
    await parents(25);
    const res = await broadcastMessage(home.id, {
      channel: NotificationChannel.SMS,
      targetAudience: "ALL_PARENTS",
      body: "School resumes on Monday.",
    });
    expect(res).toMatchObject({ count: 25, sent: BATCH_SIZE, failed: 0, queued: 15 });
    expect(res.dispatches).toHaveLength(25);
    expect(await db.notificationDispatch.count({ where: { branchId: home.id } })).toBe(25);
    expect(getMockTermiiMessages()).toHaveLength(BATCH_SIZE);
    expect(await countWaiting(home.id)).toBe(15);
    // and the screen's calls finish it
    await sendNextBatch(home.id);
    await sendNextBatch(home.id);
    expect(await countWaiting(home.id)).toBe(0);
    expect(await db.notificationDispatch.count({ where: { branchId: home.id, status: NotificationDispatchStatus.SENT } })).toBe(25);
  });

  test("to ten people or fewer is delivered before it answers, as it always was", async () => {
    await parents(4);
    const res = await broadcastMessage(home.id, { channel: NotificationChannel.SMS, targetAudience: "ALL_PARENTS", body: "Hello." });
    expect(res).toMatchObject({ count: 4, sent: 4, failed: 0, queued: 0 });
    expect(await countWaiting(home.id)).toBe(0);
  });
});
