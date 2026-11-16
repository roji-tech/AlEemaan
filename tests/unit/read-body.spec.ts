import { test, expect } from "@playwright/test";
import { readBoundedBytes, readBoundedForm, readBoundedText } from "../../src/lib/api/read-body";

// The one reader of a request body (lib/api/read-body.ts): bytes, text and a multipart form, none read further than the cap. No server, no database.

const post = (body: BodyInit | null, headers: Record<string, string> = {}) =>
  new Request("http://localhost/x", { method: "POST", body, headers });
const streamOf = (chunks: Uint8Array[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });

test("a body within the cap comes back exactly, byte for byte, including bytes that are not text", async () => {
  const bytes = Uint8Array.from([0, 255, 1, 254, 0, 0, 128]);
  expect(Array.from((await readBoundedBytes(post(bytes), 100))!)).toEqual(Array.from(bytes));
  expect(await readBoundedText(post("héllo"), 100)).toBe("héllo");
  expect((await readBoundedBytes(post(null), 100))!.length).toBe(0);
});

test("a body over the cap is null: by its declared length without reading, and when it only shows its size by being read", async () => {
  expect(await readBoundedBytes(post(new Uint8Array(101)), 100)).toBeNull();
  expect(await readBoundedText(post("x".repeat(101)), 100)).toBeNull();
  const chunked = new Request("http://localhost/x", {
    method: "POST",
    body: streamOf([new Uint8Array(60), new Uint8Array(60)]),
    // @ts-expect-error `duplex` is required by Node for a streamed request body and is not in the DOM typings
    duplex: "half",
  });
  expect(await readBoundedBytes(chunked, 100)).toBeNull();
  expect(await readBoundedBytes(post(new Uint8Array(100)), 100)).not.toBeNull(); // exactly the cap is allowed
});

// A multipart body as plain bytes and its Content-Type, as a client sends it. The tests below read a request built from these bytes and NOT one built from a FormData object: a request body made from a
// FormData is generated lazily by Node's fetch (undici), and on Node 24.22 cancelling it early (which is what the cap does to a body that is too big) makes that generator close a stream that is already
// closed, an error Node raises on its own, outside any promise, which Playwright then blames on whichever test runs next ("TypeError: Invalid state: ReadableStream is already closed").
// Found in CI (task 0081): the same two spec files pass on Node 24.11.1 and fail on 24.22.2. A real upload arrives as a network stream, not a FormData, and is not affected.
async function multipart(data: FormData): Promise<{ bytes: Uint8Array; type: string }> {
  const encoded = new Response(data);
  return { type: encoded.headers.get("content-type") ?? "", bytes: new Uint8Array(await encoded.arrayBuffer()) };
}
const upload = ({ bytes, type }: { bytes: Uint8Array; type: string }) => post(bytes as BodyInit, { "content-type": type });

test("a multipart form is parsed only after it is known to fit; anything else says why not", async () => {
  const data = new FormData();
  data.append("file", new Blob([Uint8Array.from([1, 2, 3])]), "a.bin");
  data.append("alt", "hello");
  const encoded = await multipart(data);
  const parsed = await readBoundedForm(upload(encoded), 10_000);
  expect(parsed.ok).toBe(true);
  if (parsed.ok) {
    expect(parsed.form.get("alt")).toBe("hello");
    expect(Array.from(new Uint8Array(await (parsed.form.get("file") as Blob).arrayBuffer()))).toEqual([1, 2, 3]);
  }
  expect(encoded.bytes.length).toBeGreaterThan(50); // so the cap of 50 below is passed
  expect(await readBoundedForm(upload(encoded), 50)).toEqual({ ok: false, reason: "TOO_BIG" });
  expect(await readBoundedForm(post("{}", { "content-type": "application/json" }), 100)).toEqual({ ok: false, reason: "NOT_MULTIPART" });
  expect(await readBoundedForm(post("{}"), 100)).toEqual({ ok: false, reason: "NOT_MULTIPART" });
  expect(await readBoundedForm(post("garbage", { "content-type": "multipart/form-data; boundary=xyz" }), 100)).toEqual({
    ok: false,
    reason: "UNREADABLE",
  });
});
