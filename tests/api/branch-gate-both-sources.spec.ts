import { HTTP_URL } from "../support/env";
import { test, expect } from "@playwright/test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { Role } from "@prisma/client";
import { createUser, db, resetDatabase, seedInstance, uniqueIp } from "../support/db";
import { api, cookieHeader, loginAs, type ApiResponse } from "../support/http";

// `withAuthGated` checks the branch a request NAMES. The handlers behind it read that branch from the query, from the body, or (the retry route) from the body first, and some
// parse the body whatever the Content-Type header says, so the gate has to judge every branch the request names, wherever it names it.
//
//   1. Concrete: a request that names two different branches, or names a branch only in a body that is not sent as JSON, is judged by every branch it names; nothing is written
//      for a branch the caller does not hold.
//   2. Size: the gate reads no more than the body cap.
//   3. Generic: every `withAuthGated` route and method, found by reading the source tree (so a route added tomorrow is covered the day it is added), is sent the same
//      combinations and must refuse them at the gate, before its handler runs.
//   4. Controls: a request that names only the caller's own branch (in the query, in the body, or in both) is NOT refused by the gate.

let home: { id: string };
let other: { id: string };
type Caller = { role: Role; cookie: string };
let callers: Caller[];

test.afterAll(async () => {
  await resetDatabase();
});
test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();
  other = await db.branch.create({ data: { name: `Other ${Date.now()}` } });
  callers = [];
  for (const role of [Role.ADMIN, Role.TEACHING_STAFF, Role.STUDENT, Role.PARENT]) {
    const user = await createUser({ superAdmin: false });
    await db.membership.create({ data: { userId: user.id, branchId: home.id, role } });
    callers.push({ role, cookie: cookieHeader((await loginAs(user)).token!) });
  }
});
const caller = (role: Role) => callers.find((c) => c.role === role)!;

const GATE_WORDS = /same branch|must be text|access to that branch/;
const message = (res: ApiResponse): string => String(res.json?.error?.message ?? "");

test("announcements: the gate judges every branch a request names, in the query and in a body of any Content-Type", async () => {
  const teacher = caller(Role.TEACHING_STAFF);
  const payload = { branchId: other.id, title: "Gate case", body: "Gate case body", targetRoles: [Role.PARENT], status: "PUBLISHED" };

  const both = await api(`/api/v1/announcements?branchId=${home.id}`, { method: "POST", cookie: teacher.cookie, body: payload });
  expect(both.status).toBe(400);
  expect(message(both)).toMatch(/same branch/);

  const plain = await api("/api/v1/announcements", {
    method: "POST",
    cookie: teacher.cookie,
    rawBody: JSON.stringify(payload),
    headers: { "content-type": "text/plain" },
  });
  expect(plain.status).toBe(403);
  expect(message(plain)).toMatch(/access to that branch/);

  expect(await db.announcement.count({ where: { title: "Gate case" } })).toBe(0);

  // the control: their own branch, named in the query, in the body, and in both
  for (const [url, branchInBody] of [
    [`/api/v1/announcements`, home.id],
    [`/api/v1/announcements?branchId=${home.id}`, undefined],
    [`/api/v1/announcements?branchId=${home.id}`, home.id],
  ] as const) {
    const res = await api(url, {
      method: "POST",
      cookie: teacher.cookie,
      body: { ...payload, branchId: branchInBody ?? home.id, title: `Own ${url.length}${branchInBody ? "b" : "q"}` },
    });
    expect(res.status, `${url} ${branchInBody ? "with the body branch" : ""}`).toBe(201);
  }
  expect(await db.announcement.count({ where: { branchId: other.id } })).toBe(0);
  expect(await db.announcement.count({ where: { branchId: home.id } })).toBe(3);
});

test("the gate reads no more than 1 MiB of a body: one byte over is a 413 before any handler, and a body of exactly the cap is still read for its branch", async () => {
  const teacher = caller(Role.TEACHING_STAFF);
  const MAX = 1024 * 1024;
  // a JSON body of exactly `size` bytes (ASCII, so characters are bytes) naming `branch`, padded with a string field
  const bodyOf = (size: number, branch: string) => {
    const head = JSON.stringify({ branchId: branch, title: "Padded", body: "x", targetRoles: [Role.PARENT], status: "PUBLISHED", pad: "" });
    return head.replace('"pad":""', `"pad":"${"p".repeat(size - head.length)}"`);
  };
  const post = (raw: string) => api("/api/v1/announcements", { method: "POST", cookie: teacher.cookie, rawBody: raw });

  const atCap = bodyOf(MAX, other.id);
  expect(Buffer.byteLength(atCap)).toBe(MAX);
  const seen = await post(atCap);
  expect(seen.status, "the gate still read a body of exactly the cap and judged the branch it names").toBe(403);
  expect(message(seen)).toMatch(/access to that branch/);

  for (const size of [MAX + 1, MAX * 3]) {
    const tooBig = await post(bodyOf(size, other.id));
    expect(tooBig.status, `${size} bytes`).toBe(413);
    expect(tooBig.json?.error?.code).toBe("PAYLOAD_TOO_LARGE");
    const own = await post(bodyOf(size, home.id));
    expect(own.status, `${size} bytes, own branch`).toBe(413); // nothing larger than the cap reaches a handler, whichever branch it names
  }

  // no Content-Length at all (a chunked upload): the gate stops reading at the cap
  const streamed = (bytes: number) =>
    fetch(`${HTTP_URL}/api/v1/announcements`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: HTTP_URL, "x-real-ip": uniqueIp(), cookie: teacher.cookie },
      body: new ReadableStream({
        start(controller) {
          const chunk = new TextEncoder().encode("x".repeat(64 * 1024));
          controller.enqueue(new TextEncoder().encode('{"branchId":"' + other.id + '","pad":"'));
          for (let sent = 0; sent < bytes; sent += chunk.length) controller.enqueue(chunk);
          controller.enqueue(new TextEncoder().encode('"}'));
          controller.close();
        },
      }),
      // @ts-expect-error `duplex` is required by Node for a streamed request body and is not in the DOM typings
      duplex: "half",
    });
  expect((await streamed(MAX * 2)).status, "a streamed body over the cap").toBe(413);
  expect((await streamed(1000)).status, "a small streamed body is read and the branch it names is judged").toBe(403);

  expect(await db.announcement.count({ where: { title: "Padded" } })).toBe(0);
});

test("communication templates and broadcasts: the gate judges every branch a request names", async () => {
  const admin = caller(Role.ADMIN);
  const template = { branchId: other.id, code: "GATECASE", name: "Gate case template", channel: "SMS", bodyTemplate: "Hello" };

  const both = await api(`/api/v1/communication/templates?branchId=${home.id}`, { method: "POST", cookie: admin.cookie, body: template });
  expect(both.status).toBe(400);
  expect(message(both)).toMatch(/same branch/);

  const plain = await api("/api/v1/communication/templates", {
    method: "POST",
    cookie: admin.cookie,
    rawBody: JSON.stringify(template),
    headers: { "content-type": "text/plain" },
  });
  expect(plain.status).toBe(403);

  const broadcast = { branchId: other.id, channel: "SMS", targetAudience: "ALL_PARENTS", body: "Gate case broadcast" };
  const broadcastBoth = await api(`/api/v1/communication/broadcast?branchId=${home.id}`, {
    method: "POST",
    cookie: admin.cookie,
    body: broadcast,
  });
  expect(broadcastBoth.status).toBe(400);
  const broadcastPlain = await api("/api/v1/communication/broadcast", {
    method: "POST",
    cookie: admin.cookie,
    rawBody: JSON.stringify(broadcast),
    headers: { "content-type": "text/plain" },
  });
  expect(broadcastPlain.status).toBe(403);

  expect(await db.notificationTemplate.count({ where: { branchId: other.id } })).toBe(0);
  expect(await db.notificationDispatch.count({ where: { branchId: other.id } })).toBe(0);
});

// ---- the generic walk ----

const ROOT = join(process.cwd(), "src", "app", "api");
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
const routeFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? routeFiles(full) : name === "route.ts" ? [full] : [];
  });
const gated = routeFiles(ROOT).flatMap((file) => {
  const text = readFileSync(file, "utf8");
  const rel = relative(ROOT, file).replace(/\/route\.ts$/, "");
  const url = "/api/" + rel.replace(/\[[^\]]+\]/g, `c${"z".repeat(24)}`);
  return METHODS.filter((m) => new RegExp(`^export const ${m} = withAuthGated`, "m").test(text)).map((method) => ({ rel, url, method }));
});

test("the walk finds the gated routes (a guard against it silently walking nothing)", () => {
  expect(gated.length).toBeGreaterThan(20);
  expect(gated.filter((g) => g.method !== "GET").length).toBeGreaterThan(12);
});

// the role guard in front of the gate answers this when the caller's role is not one the route lists
const ROLE_REFUSAL = /don't have permission to do that/;

test("every gated route and method judges every branch a request names, before its handler runs", async () => {
  test.setTimeout(600_000);
  const problems: string[] = [];
  let walked = 0;
  const skipped: string[] = [];
  for (const { rel, url, method } of gated) {
    const mutation = method !== "GET";
    // the first caller whose role the route lists: a control request that names only the home branch is not refused by the role guard
    let who: Caller | undefined;
    for (const c of callers) {
      const control = mutation
        ? await api(`${url}?branchId=${home.id}`, { method, cookie: c.cookie, body: { branchId: home.id } })
        : await api(`${url}?branchId=${home.id}`, { method, cookie: c.cookie });
      if (control.status === 403 && ROLE_REFUSAL.test(message(control))) continue;
      // the gate itself must let a request that names only the caller's own branch through (whatever the handler then says)
      if (GATE_WORDS.test(message(control)))
        problems.push(`${method} ${rel}: the gate refused a request naming only the caller's own branch: ${message(control)}`);
      who = c;
      break;
    }
    if (!who) {
      skipped.push(`${method} ${rel}`);
      continue;
    }
    walked++;
    const as = who.cookie;
    const expectGate = (label: string, res: ApiResponse, status: number, words: RegExp) => {
      if (res.status !== status || !words.test(message(res)))
        problems.push(`${method} ${rel} (${who!.role}) ${label}: got ${res.status} ${message(res).slice(0, 80)}`);
    };

    expectGate(
      "two branch ids in the URL",
      await api(`${url}?branchId=${home.id}&branchId=${other.id}`, { method, cookie: as, ...(mutation ? { body: {} } : {}) }),
      400,
      /same branch/,
    );
    if (!mutation) continue;

    expectGate(
      "the query names the caller's branch, the body another",
      await api(`${url}?branchId=${home.id}`, { method, cookie: as, body: { branchId: other.id } }),
      400,
      /same branch/,
    );
    expectGate(
      "the query names another branch, the body the caller's",
      await api(`${url}?branchId=${other.id}`, { method, cookie: as, body: { branchId: home.id } }),
      400,
      /same branch/,
    );
    expectGate(
      "a branch the caller does not hold, named in a JSON body sent as text/plain",
      await api(url, { method, cookie: as, rawBody: JSON.stringify({ branchId: other.id }), headers: { "content-type": "text/plain" } }),
      403,
      /access to that branch/,
    );
    expectGate(
      "the same with an empty Content-Type",
      await api(url, { method, cookie: as, rawBody: JSON.stringify({ branchId: other.id }), headers: { "content-type": "" } }),
      403,
      /access to that branch/,
    );
    for (const odd of [5, true, ["x"], { k: other.id }]) {
      expectGate(
        `a body branchId that is ${JSON.stringify(odd)}`,
        await api(url, { method, cookie: as, body: { branchId: odd } }),
        400,
        /must be text/,
      );
    }

    // the controls: only the caller's own branch, however it is sent, is not the gate's refusal
    for (const [label, res] of [
      ["own branch in the body only", await api(url, { method, cookie: as, body: { branchId: home.id } })],
      [
        "own branch in the body of a text/plain request",
        await api(url, { method, cookie: as, rawBody: JSON.stringify({ branchId: home.id }), headers: { "content-type": "text/plain" } }),
      ],
      ["own branch in both", await api(`${url}?branchId=${home.id}`, { method, cookie: as, body: { branchId: home.id } })],
      ["no branch at all", await api(url, { method, cookie: as, body: {} })],
      ["a null branch", await api(url, { method, cookie: as, body: { branchId: null } })],
    ] as const) {
      if (GATE_WORDS.test(message(res)))
        problems.push(`${method} ${rel} (${who.role}) control "${label}" was refused by the gate: ${message(res)}`);
    }
  }
  expect(walked, `routes walked (skipped because no test caller holds a role they list: ${skipped.join(", ")})`).toBeGreaterThan(
    gated.length - 4,
  );
  expect(problems).toEqual([]);
});
