import "../support/env";
import { test, expect } from "@playwright/test";
import { Gender, NotificationChannel, NotificationDispatchStatus, Role } from "@prisma/client";
import { createUser, db, seedInstance } from "../support/db";
import { DEVTOOLS_URL } from "../support/env";
import { api, cookieHeader, loginAs } from "../support/http";

// Task 0063: the two routes of the batch sender. `GET /communication/queue` says how many messages wait; `POST /communication/queue/next` sends the next batch and says how many are left.
// Who may call them (an administrator of that branch, nobody else), what they answer (counts, never an address), and that a broadcast to more than ten people leaves the rest for them.
// The servers under test are production-shaped, so a send there FAILS for want of a provider key (task 0053); the sends that must succeed use the staging-mode server.

let home: { id: string };
let other: { id: string };
test.beforeAll(async () => {
  home = await seedInstance();
  other = await db.branch.create({ data: { name: `Queue other ${Date.now()}` } });
});
test.beforeEach(async () => {
  await db.notificationAuditLog.deleteMany();
  await db.notificationDispatch.deleteMany();
  await db.studentRecord.deleteMany();
});

const asRole = async (role: Role, branchId = home.id, baseUrl?: string) => {
  const user = await createUser({ superAdmin: false });
  await db.membership.create({ data: { userId: user.id, branchId, role } });
  return { user, cookie: cookieHeader((await loginAs(user, { baseUrl })).token!) };
};
const queue = async (n: number, branchId = home.id) => {
  for (let i = 0; i < n; i++) {
    await db.notificationDispatch.create({
      data: {
        branchId,
        channel: NotificationChannel.SMS,
        recipientAddress: `0803${String(100 + i).padStart(7, "0")}`,
        body: `Queued ${i}`,
        status: NotificationDispatchStatus.QUEUED,
      },
    });
  }
};
const GET = "/api/v1/communication/queue";
const NEXT = "/api/v1/communication/queue/next";

test.describe("who may call them", () => {
  test("an administrator of the branch may; a teacher, an anonymous caller and another branch's administrator may not", async () => {
    await queue(3);
    const admin = await asRole(Role.ADMIN);
    const teacher = await asRole(Role.TEACHING_STAFF);
    const stranger = await asRole(Role.ADMIN, other.id);

    expect((await api(`${GET}?branchId=${home.id}`, { cookie: admin.cookie })).json.data).toEqual({ pending: 3 });
    expect((await api(`${GET}?branchId=${home.id}`)).status).toBe(401);
    expect((await api(`${GET}?branchId=${home.id}`, { cookie: teacher.cookie })).status).toBeGreaterThanOrEqual(403);
    expect((await api(`${GET}?branchId=${home.id}`, { cookie: stranger.cookie })).status).toBe(404);

    expect((await api(NEXT, { method: "POST", body: { branchId: home.id } })).status).toBe(401);
    expect((await api(NEXT, { method: "POST", cookie: teacher.cookie, body: { branchId: home.id } })).status).toBeGreaterThanOrEqual(403);
    expect((await api(NEXT, { method: "POST", cookie: stranger.cookie, body: { branchId: home.id } })).status).toBe(403);
    // nothing was taken by any of the refused calls
    expect(await db.notificationDispatch.count({ where: { branchId: home.id, status: NotificationDispatchStatus.QUEUED } })).toBe(3);
  });

  test("the branch must be named", async () => {
    const admin = await asRole(Role.ADMIN);
    expect((await api(GET, { cookie: admin.cookie })).status).toBe(400);
    expect((await api(NEXT, { method: "POST", cookie: admin.cookie, body: {} })).status).toBe(400);
  });
});

test.describe("what they do", () => {
  test("next sends a batch and answers counts only; on the production-shaped server a send with no provider key fails closed, with the reason, and the number is not in the answer", async () => {
    await queue(4);
    const admin = await asRole(Role.ADMIN);
    const res = await api(NEXT, { method: "POST", cookie: admin.cookie, body: { branchId: home.id } });
    expect(res.status).toBe(200);
    expect(res.json.data).toMatchObject({ claimed: 4, sent: 0, failed: 4, remaining: 0 });
    expect(res.json.data.firstError).toContain("TERMII_API_KEY");
    expect(res.text).not.toContain("0803");
    expect((await db.notificationDispatch.findMany()).every((r) => r.status === NotificationDispatchStatus.FAILED)).toBe(true);
  });

  test("on the staging-mode server (the stand-in sender) a broadcast to 25 people leaves 15 queued, and two calls to next finish it", async () => {
    for (let i = 0; i < 25; i++) {
      await db.studentRecord.create({
        data: {
          branchId: home.id,
          firstName: `Q${i}`,
          lastName: "Pupil",
          gender: Gender.MALE,
          dateOfBirth: new Date("2012-01-01"),
          admissionNo: `ADM-Q-${i}`,
          guardianPhone: `0805${String(i).padStart(7, "0")}`,
        },
      });
    }
    const admin = await asRole(Role.ADMIN, home.id, DEVTOOLS_URL);
    const base = { baseUrl: DEVTOOLS_URL, cookie: admin.cookie };
    const made = await api("/api/v1/communication/broadcast", {
      ...base,
      method: "POST",
      body: { branchId: home.id, channel: "SMS", targetAudience: "ALL_PARENTS", body: "School resumes on Monday." },
    });
    expect(made.status).toBe(201);
    expect(made.json.data).toMatchObject({ count: 25, sent: 10, failed: 0, queued: 15 });
    expect((await api(`${GET}?branchId=${home.id}`, base)).json.data).toEqual({ pending: 15 });
    expect((await api(NEXT, { ...base, method: "POST", body: { branchId: home.id } })).json.data).toMatchObject({
      claimed: 10,
      sent: 10,
      remaining: 5,
    });
    expect((await api(NEXT, { ...base, method: "POST", body: { branchId: home.id } })).json.data).toMatchObject({
      claimed: 5,
      sent: 5,
      remaining: 0,
    });
    expect((await api(`${GET}?branchId=${home.id}`, base)).json.data).toEqual({ pending: 0 });
    expect(await db.notificationDispatch.count({ where: { branchId: home.id, status: NotificationDispatchStatus.SENT } })).toBe(25);
  });

  test("another branch's waiting messages are not counted and not sent", async () => {
    await queue(2, other.id);
    const admin = await asRole(Role.ADMIN);
    expect((await api(`${GET}?branchId=${home.id}`, { cookie: admin.cookie })).json.data).toEqual({ pending: 0 });
    expect((await api(NEXT, { method: "POST", cookie: admin.cookie, body: { branchId: home.id } })).json.data).toMatchObject({
      claimed: 0,
      remaining: 0,
    });
    expect(await db.notificationDispatch.count({ where: { branchId: other.id, status: NotificationDispatchStatus.QUEUED } })).toBe(2);
  });
});
