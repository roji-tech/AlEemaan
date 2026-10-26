import "../support/env";
import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { Role, createUser, db, resetDatabase, seedInstance, type TestUser } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";
import { DEVTOOLS_URL } from "../support/env";

// Pictures on question bank items (Task 0032 slice 2.2): add, serve and remove. For each: who may call, the one "Not found" for a question the person may not see, what happens to
// a hostile file (nothing is stored, the question does not change), the limit on pictures, the version and audit rows a change leaves, and that what comes back carries nothing
// but pixels. The server under test keeps its pictures in its own memory; the dev-tools server has no store at all, which is where the 503 is checked.

const ITEMS = "/api/v1/question-bank/items";

let home: { id: string };
let other: { id: string };
type Who = "super" | "writer" | "writer2" | "reviewer" | "exam" | "otherTeacher" | "student";
const users = {} as Record<Who, TestUser>;
const ck = {} as Record<Who, string>;

async function cookieFor(user: TestUser) {
  const res = await loginAs(user);
  expect(res.status).toBe(200);
  return cookieHeader(res.token!);
}
const addMembership = (user: TestUser, branchId: string, role: Role) => db.membership.create({ data: { userId: user.id, branchId, role } });

test.beforeAll(async () => {
  await resetDatabase();
  home = await seedInstance();
  other = await db.branch.findFirstOrThrow({ where: { id: { not: home.id } }, orderBy: { name: "asc" } });
  users.super = await createUser({ name: "Sue Super", role: Role.ADMIN });
  users.writer = await createUser({ name: "Wale Writer", role: Role.TEACHING_STAFF, superAdmin: false });
  users.writer2 = await createUser({ name: "Wura Writer", role: Role.TEACHING_STAFF, superAdmin: false });
  users.reviewer = await createUser({ name: "Rita Reviewer", role: Role.NON_TEACHING_STAFF, superAdmin: false });
  users.exam = await createUser({ name: "Eze Exam", role: Role.TEACHING_STAFF, superAdmin: false });
  users.student = await createUser({ name: "Stu Dent", role: Role.STUDENT, superAdmin: false });
  users.otherTeacher = await createUser({ name: "Olu Other", superAdmin: false });
  await addMembership(users.otherTeacher, other.id, Role.TEACHING_STAFF);
  for (const key of Object.keys(users) as Who[]) ck[key] = await cookieFor(users[key]);
});

test.beforeEach(async () => {
  await db.settingValue.deleteMany({ where: { key: { startsWith: "bank." } } });
  await db.$executeRawUnsafe(
    `TRUNCATE "QuestionBankAudit", "QuestionBankReview", "QuestionBankItemVersion", "QuestionOverlapFlag", "QuestionBankImage", "QuestionBankClassTag", "QuestionBankItem", "QuestionBankReviewer" RESTART IDENTITY CASCADE`,
  );
  await db.questionBankReviewer.create({ data: { userId: users.reviewer.id, assignedById: users.super.id, scope: "GENERAL", branchId: home.id } });
  await db.questionBankReviewer.create({ data: { userId: users.exam.id, assignedById: users.super.id, scope: "GENERAL", branchId: home.id, isExamApprover: true } });
});
test.afterAll(async () => {
  await resetDatabase();
});

let counter = 0;
const body = () => {
  counter += 1;
  return {
    type: "SINGLE",
    prompt: `Picture question number ${counter}: which of these words belongs with the entry p${counter}x${counter * 11}?`,
    options: [`alpha${counter}`, `beta${counter}`, `gamma${counter}`],
    correct: 0,
    subject: "Mathematics",
    classTags: ["JSS 1"],
  };
};
const create = async (who: Who) => {
  const res = await api(ITEMS, { method: "POST", cookie: ck[who], body: { branchId: home.id, ...body() } });
  expect(res.status, res.text).toBe(201);
  return res.json.data.item as { id: string };
};
const decide = (who: Who, id: string, action: string, payload: unknown = {}) => api(`${ITEMS}/${id}/${action}`, { method: "POST", cookie: ck[who], body: payload });
// pictures
const GPS = { IFD0: { Copyright: "SECRET-COPYRIGHT-MARK", Software: "SECRET-SOFTWARE-MARK" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "51/1 30/1 0/1", GPSLongitudeRef: "W", GPSLongitude: "0/1 7/1 0/1" } };
const jpegWithGps = () => sharp({ create: { width: 64, height: 48, channels: 3, background: "#3366aa" } }).jpeg().withExif(GPS).toBuffer();
const png = (colour = "#aa3333") => sharp({ create: { width: 40, height: 30, channels: 3, background: colour } }).png().toBuffer();

const form = (file: Uint8Array | null, fields: Record<string, string> = { alt: "A blue rectangle" }, name = "picture.jpg", type = "image/jpeg") => {
  const data = new FormData();
  if (file) data.append("file", new Blob([file as BlobPart], { type }), name);
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
};
const upload = (who: Who | undefined, id: string, data: FormData, baseUrl?: string) =>
  api(`${ITEMS}/${id}/images`, { method: "POST", cookie: who ? ck[who] : undefined, form: data, baseUrl });
const serve = (who: Who | undefined, id: string, imageId: string) => api(`${ITEMS}/${id}/images/${imageId}`, { cookie: who ? ck[who] : undefined });
const stored = (id: string) => db.questionBankItem.findUniqueOrThrow({ where: { id }, include: { images: true } });

test.describe("adding and serving a picture", () => {
  test("the writer adds a picture to a draft: the question gets a new version, an audit row, and the picture comes back with nothing but pixels", async () => {
    const item = await create("writer");
    const res = await upload("writer", item.id, form(await jpegWithGps()));
    expect(res.status, res.text).toBe(201);
    const imageId = res.json.data.imageId as string;
    expect(res.json.data.item).toMatchObject({ version: 2, status: "DRAFT" });
    expect(res.json.data.item.images).toEqual([expect.objectContaining({ id: imageId, alt: "A blue rectangle", decorative: false, contentType: "image/jpeg", sortOrder: 0 })]);
    expect(JSON.stringify(res.json)).not.toMatch(/storageKey|aleemaan\/question-bank/); // nothing says where the file lives

    const row = await db.questionBankImage.findUniqueOrThrow({ where: { id: imageId } });
    expect(row).toMatchObject({ itemId: item.id, store: "memory", contentType: "image/jpeg", width: 64, height: 48 });
    expect(row.storageKey).toBe(`aleemaan/question-bank/${imageId}`);
    expect(await db.questionBankItemVersion.count({ where: { itemId: item.id, version: 2 } })).toBe(1);
    expect((await db.questionBankAudit.findMany({ where: { action: "IMAGE_ADDED" } }))[0]).toMatchObject({ itemId: item.id, actorUserId: users.writer.id });

    const got = await serve("writer", item.id, imageId);
    expect(got.status).toBe(200);
    expect(got.headers.get("content-type")).toBe("image/jpeg");
    expect(got.headers.get("cache-control")).toBe("private, no-store");
    expect(got.headers.get("x-content-type-options")).toBe("nosniff");
    expect(got.headers.get("content-security-policy")).toBe("default-src 'none'; frame-ancestors 'none'"); // the API-wide policy: nothing in it can run or be framed
    expect(got.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    const meta = await sharp(got.bytes).metadata();
    expect(meta).toMatchObject({ format: "jpeg", width: 64, height: 48 });
    expect(meta.exif).toBeUndefined();
    expect(got.bytes.includes(Buffer.from("SECRET-COPYRIGHT-MARK"))).toBe(false);
    expect(got.bytes.includes(Buffer.from("SECRET-SOFTWARE-MARK"))).toBe(false);
    expect(got.bytes.length).toBe(row.bytes);
  });

  test("a decorative picture has no description; any other needs one", async () => {
    const item = await create("writer");
    const file = await png();
    const ok = await upload("writer", item.id, form(file, { decorative: "true" }));
    expect(ok.status, ok.text).toBe(201);
    expect(ok.json.data.item.images[0]).toMatchObject({ decorative: true, alt: "" });
    const refused: Record<string, string>[] = [{}, { alt: "   " }, { alt: "x".repeat(301) }, { alt: "ok", decorative: "true" }, { alt: "ok", decorative: "yes" }, { alt: "bad\u0000text" }, { alt: "hidden\u202etext" }];
    for (const fields of refused) {
      const res = await upload("writer", item.id, form(file, fields));
      expect(res.status, JSON.stringify(fields)).toBe(400);
    }
    expect(await db.questionBankImage.count({ where: { itemId: item.id } })).toBe(1);
  });

  test("a PNG named .jpg is a PNG; anything that is not a JPEG, PNG or WebP by its content is refused and nothing changes", async () => {
    const item = await create("writer");
    const renamed = await upload("writer", item.id, form(await png(), { alt: "Red" }, "photo.jpg", "image/jpeg"));
    expect(renamed.status, renamed.text).toBe(201);
    expect(renamed.json.data.item.images[0].contentType).toBe("image/png");

    const before = await stored(item.id);
    const hostile: [string, Uint8Array, string][] = [
      ["a script named .png", Buffer.from("<script>alert(1)</script>"), "x.png"],
      ["an SVG", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), "x.svg"],
      ["a GIF", Buffer.from("GIF89a\u0001\u0000\u0001\u0000\u0080\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000;", "latin1"), "x.gif"],
      ["a PDF", Buffer.from("%PDF-1.4 hello"), "x.pdf"],
      ["a cut-off JPEG", (await jpegWithGps()).subarray(0, 120), "x.jpg"],
      ["an empty file", new Uint8Array(0), "x.png"],
    ];
    for (const [what, bytes, name] of hostile) {
      const res = await upload("writer", item.id, form(bytes, { alt: "x" }, name));
      expect(res.status, what).toBe(400);
      expect(res.json.error.code, what).toBe("IMAGE_REJECTED");
    }
    const after = await stored(item.id);
    expect(after.version).toBe(before.version);
    expect(after.images.length).toBe(1);
  });

  test("a file over 8 MB is 413 and is never decoded; a body that is not a form is 415; a broken form, an extra field, two files or none are 400", async () => {
    const item = await create("writer");
    // just over the picture limit and under the form's: the whole body is read, then the picture is refused by its size (a body far over the form's cap is refused unread,
    // and a client still sending then sees the connection closed, which is not something a test can rely on; the cap itself is in tests/unit/read-body.spec.ts)
    const big = await upload("writer", item.id, form(Buffer.alloc(8 * 1024 * 1024 + 10_000, 7)));
    expect(big.status).toBe(413);
    expect(big.json.error.code).toBe("IMAGE_REJECTED");
    const json = await api(`${ITEMS}/${item.id}/images`, { method: "POST", cookie: ck.writer, body: { alt: "x" } });
    expect(json.status).toBe(415);
    const broken = await api(`${ITEMS}/${item.id}/images`, { method: "POST", cookie: ck.writer, rawBody: "garbage", headers: { "content-type": "multipart/form-data; boundary=xyz" } });
    expect(broken.status).toBe(400);
    const file = await png();
    expect((await upload("writer", item.id, form(file, { alt: "x", caption: "no" }))).status).toBe(400);
    expect((await upload("writer", item.id, form(null, { alt: "x" }))).status).toBe(400);
    const two = form(file);
    two.append("file", new Blob([file as BlobPart]), "b.png");
    expect((await upload("writer", item.id, two)).status).toBe(400);
    const asText = new FormData();
    asText.append("file", "not a file");
    asText.append("alt", "x");
    expect((await upload("writer", item.id, asText)).status).toBe(400);
    expect((await stored(item.id)).images.length).toBe(0);
    expect((await stored(item.id)).version).toBe(1);
  });

  test("at most 3 pictures by default (4 when the school allows it); the 4th is a 409 and five at once leave exactly the limit", async () => {
    const item = await create("writer");
    const file = await png();
    for (let i = 0; i < 3; i++) expect((await upload("writer", item.id, form(file))).status).toBe(201);
    const fourth = await upload("writer", item.id, form(file));
    expect(fourth.status).toBe(409);
    expect(fourth.json.error.code).toBe("IMAGE_LIMIT");
    expect((await stored(item.id)).images.map((image) => image.sortOrder).sort()).toEqual([0, 1, 2]);

    await db.settingValue.create({ data: { scope: "GLOBAL", key: "bank.images.max", value: 4, status: "APPROVED" } });
    const racing = await create("writer");
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => upload("writer", racing.id, form(file))));
    expect(results.filter((r) => r.status === 201).length).toBe(4);
    expect(results.filter((r) => r.status === 409).length).toBe(1);
    expect((await stored(racing.id)).images.length).toBe(4);
  });

  test("the limits come from the branch's settings: a larger picture is drawn again smaller", async () => {
    const item = await create("writer");
    await db.settingValue.create({ data: { scope: "GLOBAL", key: "bank.images.maxLongSide", value: 400, status: "APPROVED" } });
    const wide = await sharp({ create: { width: 1200, height: 600, channels: 3, background: "#118833" } }).png().toBuffer();
    const res = await upload("writer", item.id, form(wide));
    expect(res.status, res.text).toBe(201);
    const row = (await stored(item.id)).images[0];
    expect(Math.max(row.width, row.height)).toBeLessThanOrEqual(400);
  });
});

test.describe("who may add, serve and remove", () => {
  test("nobody signed out, no pupil, and a teacher of another branch is told nothing; a teacher who cannot see the draft gets 'Not found'", async () => {
    const item = await create("writer");
    const file = await png();
    expect((await upload(undefined, item.id, form(file))).status).toBe(401);
    expect((await upload("student", item.id, form(file))).status).toBe(403);
    expect((await upload("otherTeacher", item.id, form(file))).status).toBe(404);
    expect((await upload("writer2", item.id, form(file))).status).toBe(404);
    expect((await upload("reviewer", item.id, form(file))).status).toBe(404); // a draft is its writer's alone
    expect((await upload("writer", "nope", form(file))).status).toBe(404);
    expect((await upload("writer", "a".repeat(300), form(file))).status).toBe(404);
    expect((await stored(item.id)).images.length).toBe(0);
  });

  test("the writer may change a pending question's pictures, not an approved one's; a reviewer in scope may, and leaves an EDITED review row", async () => {
    const item = await create("writer");
    expect((await decide("writer", item.id, "submit")).status).toBe(200);
    const file = await png();
    const pending = await upload("writer", item.id, form(file));
    expect(pending.status, pending.text).toBe(201);
    expect(pending.json.data.item.status).toBe("PENDING");

    expect((await decide("exam", item.id, "approve", { visibility: "PRACTICE" })).status).toBe(200);
    expect((await upload("writer", item.id, form(file))).status).toBe(403); // approved: no longer the writer's to change
    expect((await upload("writer2", item.id, form(file))).status).toBe(403); // can see it, may not change it
    expect((await upload("otherTeacher", item.id, form(file))).status).toBe(404);

    const byReviewer = await upload("reviewer", item.id, form(file, { alt: "Added by a reviewer" }));
    expect(byReviewer.status, byReviewer.text).toBe(201);
    expect(await db.questionBankReview.count({ where: { itemId: item.id, outcome: "EDITED" } })).toBe(1);
    const imageId = byReviewer.json.data.imageId as string;
    expect((await api(`${ITEMS}/${item.id}/images/${imageId}`, { method: "DELETE", cookie: ck.writer })).status).toBe(403);
    expect((await api(`${ITEMS}/${item.id}/images/${imageId}`, { method: "DELETE", cookie: ck.reviewer })).status).toBe(200);
    expect(await db.questionBankReview.count({ where: { itemId: item.id, outcome: "EDITED" } })).toBe(2);
  });

  test("a picture is served only to those who may see its question: a teachers-only question's picture is 'Not found' to a teacher who does not teach the subject", async () => {
    const item = await create("writer");
    const added = await upload("writer", item.id, form(await png()));
    const imageId = added.json.data.imageId as string;
    expect((await serve(undefined, item.id, imageId)).status).toBe(401);
    expect((await serve("student", item.id, imageId)).status).toBe(403);
    expect((await serve("writer2", item.id, imageId)).status).toBe(404); // a draft
    expect((await serve("writer", item.id, imageId)).status).toBe(200);
    expect((await serve("super", item.id, imageId)).status).toBe(200);

    expect((await decide("writer", item.id, "submit")).status).toBe(200);
    expect((await decide("reviewer", item.id, "approve")).status).toBe(200); // teachers only
    expect((await serve("writer2", item.id, imageId)).status).toBe(404);
    expect((await serve("reviewer", item.id, imageId)).status).toBe(200);
    await db.questionBankItem.update({ where: { id: item.id }, data: { visibility: "PRACTICE" } });
    expect((await serve("writer2", item.id, imageId)).status).toBe(200);
    expect((await serve("otherTeacher", item.id, imageId)).status).toBe(404); // another branch
  });

  test("a picture asked for under another question's id, or with an id that cannot be one, is the same 'Not found'", async () => {
    const a = await create("writer");
    const b = await create("writer");
    const imageId = (await upload("writer", a.id, form(await png()))).json.data.imageId as string;
    expect((await serve("writer", b.id, imageId)).status).toBe(404);
    expect((await serve("writer", a.id, "missing")).status).toBe(404);
    for (const bad of ["%00", "a".repeat(300), "x y"]) {
      const res = await serve("writer", a.id, bad);
      expect(res.status, bad).toBe(404);
    }
    expect((await api(`${ITEMS}/${b.id}/images/${imageId}`, { method: "DELETE", cookie: ck.writer })).status).toBe(404);
    expect((await stored(a.id)).images.length).toBe(1);
  });

  test("the bank switched off for staff closes the pictures too; a person whose membership ended a moment ago changes nothing", async () => {
    const item = await create("writer");
    const file = await png();
    await db.settingValue.create({ data: { scope: "BRANCH", branchId: home.id, key: "bank.access.staff", value: false, status: "APPROVED" } });
    const off = await upload("writer", item.id, form(file));
    expect(off.status).toBe(403);
    expect(off.json.error.code).toBe("BANK_OFF");
    await db.settingValue.deleteMany({ where: { key: "bank.access.staff" } });

    await db.membership.update({ where: { userId_branchId: { userId: users.writer.id, branchId: home.id } }, data: { deactivatedAt: new Date() } });
    expect((await upload("writer", item.id, form(file))).status).toBeGreaterThanOrEqual(401);
    await db.membership.update({ where: { userId_branchId: { userId: users.writer.id, branchId: home.id } }, data: { deactivatedAt: null } });
    expect((await stored(item.id)).images.length).toBe(0);
  });
});

test.describe("removing a picture", () => {
  test("the writer removes one: the row goes, the question gets a new version and an audit row, and the picture is no longer served", async () => {
    const item = await create("writer");
    const first = (await upload("writer", item.id, form(await png("#111111")))).json.data.imageId as string;
    const second = (await upload("writer", item.id, form(await png("#eeeeee")))).json.data.imageId as string;
    const res = await api(`${ITEMS}/${item.id}/images/${first}`, { method: "DELETE", cookie: ck.writer });
    expect(res.status, res.text).toBe(200);
    expect(res.json.data.item.images.map((i: { id: string }) => i.id)).toEqual([second]);
    expect(res.json.data.item.version).toBe(4);
    expect((await serve("writer", item.id, first)).status).toBe(404);
    expect((await serve("writer", item.id, second)).status).toBe(200);
    expect((await db.questionBankAudit.findMany({ where: { action: "IMAGE_REMOVED" } }))[0]).toMatchObject({ itemId: item.id, actorUserId: users.writer.id });
    expect((await api(`${ITEMS}/${item.id}/images/${first}`, { method: "DELETE", cookie: ck.writer })).status).toBe(404);
    // the freed place can be used again, in the next order
    const again = await upload("writer", item.id, form(await png("#222222")));
    expect(again.status).toBe(201);
    expect(again.json.data.item.images.map((i: { sortOrder: number }) => i.sortOrder)).toEqual([1, 2]);
  });

  test("a retired question keeps its pictures and they can still be read by those who could read it", async () => {
    const item = await create("writer");
    const imageId = (await upload("writer", item.id, form(await png()))).json.data.imageId as string;
    expect((await decide("writer", item.id, "submit")).status).toBe(200);
    expect((await decide("reviewer", item.id, "approve")).status).toBe(200);
    expect((await decide("reviewer", item.id, "retire", { reason: "No longer in the scheme of work." })).status).toBe(200);
    expect((await serve("reviewer", item.id, imageId)).status).toBe(200);
    expect((await stored(item.id)).images.length).toBe(1);
  });
});

test.describe("no store", () => {
  test("where no image store is configured the routes say so, after checking who is asking", async () => {
    const item = await create("writer");
    const file = await png();
    const signedIn = await loginAs(users.writer, { baseUrl: DEVTOOLS_URL });
    expect(signedIn.status).toBe(200);
    const cookie = cookieHeader(signedIn.token!);
    const res = await api(`${ITEMS}/${item.id}/images`, { method: "POST", cookie, form: form(file), baseUrl: DEVTOOLS_URL });
    expect(res.status, res.text).toBe(503);
    expect(res.json.error).toMatchObject({ code: "STORAGE_NOT_CONFIGURED", message: "Image storage is not configured." });
    expect((await stored(item.id)).images.length).toBe(0);
    expect((await stored(item.id)).version).toBe(1);
    // someone who may not change the question is told that, not about the store
    const other = await loginAs(users.writer2, { baseUrl: DEVTOOLS_URL });
    const denied = await api(`${ITEMS}/${item.id}/images`, { method: "POST", cookie: cookieHeader(other.token!), form: form(file), baseUrl: DEVTOOLS_URL });
    expect(denied.status).toBe(404);
  });
});
