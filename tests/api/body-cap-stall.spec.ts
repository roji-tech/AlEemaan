import { HTTP_PORT, HTTP_URL } from "../support/env";
import net from "node:net";
import { test, expect } from "@playwright/test";
import { Role } from "@prisma/client";
import { createUser, db, resetDatabase, seedInstance, uniqueIp } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// The 1 MiB cap on a request body, over real HTTP, for a body that never ends. A body with a Content-Length is refused from the header; a CHUNKED body (no length to look
// at) can only be measured by reading it, so it is read no further than the cap: a chunked body that passes the cap gets its 413 straight away, even when the sender never
// finishes it. (Octalve Edu has the same spec; the route here is one behind the branch gate, which reads the body to find the branch it names.)

let home: { id: string };
let cookie: string;
const path = "/api/v1/announcements";

test.beforeAll(async () => {
  await resetDatabase();
  home = await seedInstance();
  const teacher = await createUser({ superAdmin: false });
  await db.membership.create({ data: { userId: teacher.id, branchId: home.id, role: Role.TEACHING_STAFF } });
  cookie = cookieHeader((await loginAs(teacher)).token!);
});
test.afterAll(async () => {
  await resetDatabase();
});

/// A chunked POST written straight to the socket: the first chunk starts a JSON string, then `chunks` chunks of `chunkBytes`; the body is only ended when `finish` is true.
/// Resolves with the response's status code, or null when none arrived within `waitMs`.
function chunkedPost(chunkBytes: number, chunks: number, finish: boolean, waitMs: number): Promise<{ status: number | null; ms: number }> {
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = net.connect(HTTP_PORT, "127.0.0.1");
    let received = "";
    let settled = false;
    const settle = (status: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve({ status, ms: Date.now() - started });
    };
    const timer = setTimeout(() => settle(null), waitMs);
    socket.on("data", (data) => {
      received += data.toString("latin1");
      const line = /^HTTP\/1\.1 (\d{3})/.exec(received);
      if (line) settle(Number(line[1]));
    });
    socket.on("error", () => settle(/^HTTP\/1\.1 (\d{3})/.exec(received) ? Number(/^HTTP\/1\.1 (\d{3})/.exec(received)![1]) : null));
    socket.on("connect", () => {
      const headers = [
        `POST ${path} HTTP/1.1`,
        `Host: localhost:${HTTP_PORT}`,
        `Origin: ${HTTP_URL}`,
        `Cookie: ${cookie}`,
        `x-real-ip: ${uniqueIp()}`,
        "Content-Type: application/json",
        "Transfer-Encoding: chunked",
        "",
        "",
      ].join("\r\n");
      socket.write(headers);
      const first = `{"branchId":"${home.id}","pad":"`;
      socket.write(`${first.length.toString(16)}\r\n${first}\r\n`);
      const piece = "x".repeat(chunkBytes);
      for (let i = 0; i < chunks; i++) socket.write(`${chunkBytes.toString(16)}\r\n${piece}\r\n`);
      if (finish) socket.write(`2\r\n"}\r\n0\r\n\r\n`);
    });
  });
}

test("the control: a small body reaches the handler and is judged on its fields", async () => {
  const res = await api(path, { method: "POST", cookie, body: { branchId: home.id, title: "" } });
  expect(res.status).toBe(400);
});

test("a chunked body that is finished and over the cap is a 413", async () => {
  const sent = await chunkedPost(64 * 1024, 20, true, 20_000); // 1.25 MiB
  expect(sent.status).toBe(413);
});

test("a chunked body that passes the cap and then stalls still gets its 413, without waiting for the end of it", async () => {
  const sent = await chunkedPost(64 * 1024, 20, false, 20_000); // 1.25 MiB, never ended
  expect(sent.status, "no answer within 20 s: the server is waiting for the end of the body").toBe(413);
  expect(sent.ms).toBeLessThan(10_000);
});

const oversize = (bytes: number) => `{"branchId":"${home.id}","pad":"${"p".repeat(bytes)}"}`;

/// The same body as a chunked upload with no length (a streamed request body), through the client every test here uses.
const streamedOversize = (bytes: number) =>
  fetch(`${HTTP_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: HTTP_URL, "x-real-ip": uniqueIp(), cookie },
    body: new ReadableStream({
      start(controller) {
        const chunk = new TextEncoder().encode("x".repeat(64 * 1024));
        controller.enqueue(new TextEncoder().encode(`{"branchId":"${home.id}","pad":"`));
        for (let sent = 0; sent < bytes; sent += chunk.length) controller.enqueue(chunk);
        controller.enqueue(new TextEncoder().encode('"}'));
        controller.close();
      },
    }),
    // @ts-expect-error `duplex` is required by Node for a streamed request body and is not in the DOM typings
    duplex: "half",
  });

test("a refusal for size closes the connection, so the client cannot reuse one that is about to be torn down", async () => {
  const declared = await api(path, { method: "POST", cookie, rawBody: oversize(3 * 1024 * 1024) });
  expect(declared.status).toBe(413);
  expect(declared.headers.get("connection"), "a body refused unread").toBe("close");
  const streamed = await streamedOversize(2 * 1024 * 1024);
  expect(streamed.status).toBe(413);
  expect(streamed.headers.get("connection"), "a chunked body refused at the cap").toBe("close");
});

test("the request after a refused oversize body is answered, never reset (repeated: it is a timing fault, not a constant one)", async () => {
  for (let round = 1; round <= 8; round++) {
    const declared = await api(path, { method: "POST", cookie, rawBody: oversize(3 * 1024 * 1024) });
    expect(declared.status, `round ${round}: declared`).toBe(413);
    const streamed = await streamedOversize(2 * 1024 * 1024);
    expect(streamed.status, `round ${round}: chunked`).toBe(413);
    const next = await api(path, { method: "POST", cookie, body: { branchId: home.id, title: "" } });
    expect(next.status, `round ${round}: the request after the refusals`).toBe(400);
  }
});

test("the server is still answering afterwards", async () => {
  const res = await api(path, { method: "POST", cookie, body: { branchId: home.id, title: "" } });
  expect(res.status).toBe(400);
});
