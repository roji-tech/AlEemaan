import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createUser, db, resetDatabase, seedInstance } from "../support/db";
import { STORE_NAMES } from "@/lib/storage/types";

// Question bank core (Task 0032 slice 2; migration 20261020130000_question_bank_core): the database itself keeps the rule "a question may appear later, never disappear",
// keeps every version of a question, says where each picture is stored and what it is, and refuses an approved item that does not say who approved it. Written before any
// service code, so the service is built to fit rules that already hold whichever code writes.

let home: { id: string };
let author: { id: string };
test.afterAll(async () => {
  await resetDatabase();
});
test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();
  author = await createUser();
});

const rejects = async (p: Promise<unknown>, message?: RegExp) => {
  if (message) await expect(p).rejects.toThrow(message);
  else await expect(p).rejects.toThrow();
};
const item = (over: Record<string, unknown> = {}) =>
  db.questionBankItem.create({
    data: { branchId: home.id, type: "SINGLE", prompt: "What is 2 + 2?", submittedById: author.id, ...over },
  });
const image = (itemId: string, over: Record<string, unknown> = {}) =>
  db.questionBankImage.create({
    data: {
      itemId,
      storageKey: `k/${Math.random()}`,
      store: "memory",
      contentType: "image/png",
      alt: "A diagram",
      bytes: 1000,
      width: 100,
      height: 100,
      sortOrder: 0,
      ...over,
    },
  });
const inFuture = (ms = 3_600_000) => new Date(Date.now() + ms);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test.describe("the migration is additive", () => {
  const sql = readFileSync(join(process.cwd(), "prisma", "migrations", "20261020130000_question_bank_core", "migration.sql"), "utf8");
  const statements = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  test("it creates one table, and everything else it touches is a question bank table", () => {
    expect(statements.match(/^CREATE TABLE /gm)).toHaveLength(1);
    const touched = [
      ...statements.matchAll(
        /^(?:ALTER TABLE|CREATE (?:UNIQUE )?INDEX "[^"]+" ON|CREATE TRIGGER "[^"]+" [A-Z ]+(?: OF [^O]+)? ON)\s+"([^"]+)"/gm,
      ),
    ].map((m) => m[1]);
    expect(touched.length).toBeGreaterThan(8);
    for (const table of touched) expect(table, table).toMatch(/^QuestionBank/);
  });

  test("it never drops, updates, deletes or inserts anything", () => {
    expect(statements).not.toMatch(/^\s*(DROP|DELETE|UPDATE|INSERT|TRUNCATE)\b/im);
  });

  test("the list of stores in the database check is exactly the list of stores the code knows", () => {
    const listed = statements.match(/"store" IN \(([^)]*)\)/)?.[1] ?? "";
    expect([...listed.matchAll(/'([a-z0-9]+)'/g)].map((m) => m[1]).sort()).toEqual([...STORE_NAMES].sort());
  });
});

test.describe("images say where they are and what they are", () => {
  test("an image needs a store and a content type, and only known ones", async () => {
    const q = await item();
    for (const store of ["", "S3", "gcs", "file", "memory "])
      await rejects(image(q.id, { store, sortOrder: 0 }), /QuestionBankImage_store/);
    for (const contentType of [
      "",
      "image/gif",
      "image/svg+xml",
      "text/html",
      "image/PNG",
      "image/png; charset=x",
      "application/octet-stream",
    ])
      await rejects(image(q.id, { contentType }), /QuestionBankImage_contentType/);
    for (const [i, store] of STORE_NAMES.entries()) expect((await image(q.id, { store, sortOrder: i })).store).toBe(store);
    // a row with neither column is refused by the database even where the client types would allow it (an item with room, so the limit trigger does not answer first)
    const roomy = await item();
    await rejects(
      db.$executeRawUnsafe(
        `INSERT INTO "QuestionBankImage" ("id","itemId","storageKey","bytes","width","height") VALUES ('x','${roomy.id}','kx',1,1,1)`,
      ),
      /23502/, // not_null_violation
    );
    await rejects(db.$executeRawUnsafe(`UPDATE "QuestionBankImage" SET "store" = NULL`), /23502/);
  });

  test("an image row cannot lose its store or its type, or change them to something unknown", async () => {
    const q = await item();
    const img = await image(q.id);
    await rejects(db.questionBankImage.update({ where: { id: img.id }, data: { store: "ftp" } }), /QuestionBankImage_store/);
    await rejects(
      db.questionBankImage.update({ where: { id: img.id }, data: { contentType: "image/tiff" } }),
      /QuestionBankImage_contentType/,
    );
    expect((await db.questionBankImage.update({ where: { id: img.id }, data: { store: "r2", contentType: "image/webp" } })).store).toBe(
      "r2",
    );
  });

  test("two rows cannot point at one stored file", async () => {
    const a = await item();
    const b = await item();
    await image(a.id, { storageKey: "aleemaan/question-bank/one" });
    await rejects(image(b.id, { storageKey: "aleemaan/question-bank/one" }), /unique/i);
    await rejects(image(a.id, { storageKey: "aleemaan/question-bank/one", sortOrder: 1 }), /unique/i);
  });
});

test.describe("versions are kept and never changed", () => {
  const version = (itemId: string, n: number, over: Record<string, unknown> = {}) =>
    db.questionBankItemVersion.create({ data: { itemId, version: n, snapshot: { prompt: "p" }, actorUserId: author.id, ...over } });

  test("a version has a number from 1, a snapshot that is a JSON object, an author, and is unique per item", async () => {
    const q = await item();
    expect((await version(q.id, 1)).version).toBe(1);
    await rejects(version(q.id, 1), /unique/i);
    expect((await version(q.id, 2, { snapshot: { prompt: "p2", options: ["a"] } })).version).toBe(2);
    await rejects(version(q.id, 0), /QuestionBankItemVersion_sane/);
    await rejects(version(q.id, -1), /QuestionBankItemVersion_sane/);
    for (const snapshot of [[1, 2], "text", 5, true]) await rejects(version(q.id, 9, { snapshot }), /QuestionBankItemVersion_sane/);
    await rejects(version(q.id, 9, { actorUserId: "no-such-user" }), /foreign key/i);
    await rejects(version("no-such-item", 1), /foreign key/i);
    // another item has its own numbering
    expect((await version((await item()).id, 1)).version).toBe(1);
  });

  test("a version row refuses UPDATE and DELETE, by any route, and so does removing its item", async () => {
    const q = await item();
    const v = await version(q.id, 1);
    await rejects(db.questionBankItemVersion.update({ where: { id: v.id }, data: { snapshot: { prompt: "changed" } } }), /append-only/);
    await rejects(db.questionBankItemVersion.delete({ where: { id: v.id } }), /append-only/);
    await rejects(db.questionBankItemVersion.deleteMany(), /append-only/);
    await rejects(db.$executeRawUnsafe(`UPDATE "QuestionBankItemVersion" SET "version" = 5`), /append-only/);
    await rejects(db.questionBankItem.delete({ where: { id: q.id } }), /foreign key|violates/i);
    expect((await db.questionBankItemVersion.findUniqueOrThrow({ where: { id: v.id } })).snapshot).toEqual({ prompt: "p" });
  });
});

test.describe("visibility only moves forward", () => {
  const set = (id: string, data: Record<string, unknown>) => db.questionBankItem.update({ where: { id }, data });

  test("TEACHERS_ONLY may become TEACHERS_ONLY_UNTIL (a date in the future) or PRACTICE, and PRACTICE may not go back", async () => {
    const q = await item();
    expect(q.visibility).toBe("TEACHERS_ONLY");
    const until = await set(q.id, { visibility: "TEACHERS_ONLY_UNTIL", visibleFrom: inFuture() });
    expect(until.visibility).toBe("TEACHERS_ONLY_UNTIL");
    const practice = await set(q.id, { visibility: "PRACTICE", visibleFrom: null });
    expect(practice.visibility).toBe("PRACTICE");
    await rejects(set(q.id, { visibility: "TEACHERS_ONLY" }), /never disappear/);
    await rejects(set(q.id, { visibility: "TEACHERS_ONLY_UNTIL", visibleFrom: inFuture() }), /never disappear/);
    expect((await db.questionBankItem.findUniqueOrThrow({ where: { id: q.id } })).visibility).toBe("PRACTICE");

    const direct = await item();
    expect((await set(direct.id, { visibility: "PRACTICE" })).visibility).toBe("PRACTICE");
  });

  test("TEACHERS_ONLY_UNTIL cannot go back to TEACHERS_ONLY, while its date is still ahead either", async () => {
    const q = await item({ visibility: "TEACHERS_ONLY_UNTIL", visibleFrom: inFuture() });
    await rejects(set(q.id, { visibility: "TEACHERS_ONLY", visibleFrom: null }), /never disappear/);
    expect((await db.questionBankItem.findUniqueOrThrow({ where: { id: q.id } })).visibility).toBe("TEACHERS_ONLY_UNTIL");
  });

  test("while the date is ahead it may move later (an exam put off) or earlier but still ahead; a date that is not ahead is refused", async () => {
    const q = await item({ visibility: "TEACHERS_ONLY_UNTIL", visibleFrom: inFuture(3_600_000) });
    const later = inFuture(7_200_000);
    expect((await set(q.id, { visibleFrom: later })).visibleFrom?.getTime()).toBe(later.getTime());
    const earlier = inFuture(1_800_000);
    expect((await set(q.id, { visibleFrom: earlier })).visibleFrom?.getTime()).toBe(earlier.getTime());
    for (const date of [new Date(Date.now() - 1000), new Date(0), new Date()])
      await rejects(set(q.id, { visibleFrom: date }), /must be in the future/);
    await rejects(set(q.id, { visibility: "TEACHERS_ONLY_UNTIL", visibleFrom: new Date(Date.now() - 60_000) }), /must be in the future/);
    expect((await db.questionBankItem.findUniqueOrThrow({ where: { id: q.id } })).visibleFrom?.getTime()).toBe(earlier.getTime());
  });

  test("a date that has passed (the question is visible to pupils) cannot be pushed back, cleared or changed, but the question may still go to PRACTICE", async () => {
    const q = await item({ visibility: "TEACHERS_ONLY_UNTIL", visibleFrom: inFuture(1200) });
    await sleep(1500);
    await rejects(set(q.id, { visibleFrom: inFuture() }), /its date has passed/);
    await rejects(set(q.id, { visibility: "TEACHERS_ONLY", visibleFrom: null }), /never disappear/);
    await rejects(set(q.id, { visibleFrom: null }), /its date has passed/);
    await rejects(set(q.id, { visibleFrom: new Date(Date.now() - 1000) }), /must be in the future/);
    // other changes to the question are not visibility changes
    expect((await set(q.id, { topic: "Fractions", status: "DRAFT" })).topic).toBe("Fractions");
    expect((await set(q.id, { visibility: "PRACTICE", visibleFrom: null })).visibility).toBe("PRACTICE");
  });

  test("only TEACHERS_ONLY_UNTIL has a date, and it always has one; an already-passed date cannot be inserted", async () => {
    await rejects(item({ visibility: "TEACHERS_ONLY_UNTIL" }), /QuestionBankItem_until/);
    await rejects(item({ visibility: "TEACHERS_ONLY", visibleFrom: inFuture() }), /QuestionBankItem_until/);
    await rejects(item({ visibility: "PRACTICE", visibleFrom: inFuture() }), /QuestionBankItem_until/);
    await rejects(item({ visibility: "TEACHERS_ONLY_UNTIL", visibleFrom: new Date(Date.now() - 1000) }), /must be in the future/);
    expect((await item({ visibility: "TEACHERS_ONLY_UNTIL", visibleFrom: inFuture() })).visibility).toBe("TEACHERS_ONLY_UNTIL");
    expect((await item({ visibility: "PRACTICE" })).visibility).toBe("PRACTICE");
  });

  test("two updates at once cannot end in a step backwards: whichever order they land in, the question ends in PRACTICE", async () => {
    for (let round = 0; round < 12; round++) {
      const q = await item({ visibility: "TEACHERS_ONLY_UNTIL", visibleFrom: inFuture() });
      const results = await Promise.allSettled([
        set(q.id, { visibility: "PRACTICE", visibleFrom: null }),
        set(q.id, { visibility: "TEACHERS_ONLY_UNTIL", visibleFrom: inFuture(9_000_000) }),
        set(q.id, { visibility: "TEACHERS_ONLY", visibleFrom: null }),
      ]);
      expect(results[0].status, `round ${round}: the move to PRACTICE`).toBe("fulfilled");
      expect(results[2].status, `round ${round}: back to TEACHERS_ONLY`).toBe("rejected");
      expect((await db.questionBankItem.findUniqueOrThrow({ where: { id: q.id } })).visibility, `round ${round}`).toBe("PRACTICE");
    }
  });

  test("retiring is a status change, so it works for every visibility and does not touch the rule", async () => {
    for (const visibility of ["TEACHERS_ONLY", "PRACTICE"] as const) {
      const q = await item({ visibility, status: "APPROVED", approvedById: author.id, approvedAt: new Date() });
      const retired = await set(q.id, { status: "RETIRED", retiredReason: "The answer key was wrong" });
      expect(retired.status).toBe("RETIRED");
      expect(retired.visibility).toBe(visibility);
    }
  });
});

test.describe("an approved or retired item says who approved it and when", () => {
  test("APPROVED and RETIRED need an approver and a time; RETIRED needs a reason that is not blank", async () => {
    for (const status of ["APPROVED", "RETIRED"] as const) {
      await rejects(item({ status, retiredReason: "x" }), /QuestionBankItem_decided/);
      await rejects(item({ status, approvedById: author.id, retiredReason: "x" }), /QuestionBankItem_decided/);
      await rejects(item({ status, approvedAt: new Date(), retiredReason: "x" }), /QuestionBankItem_decided/);
    }
    const approved = await item({ status: "APPROVED", approvedById: author.id, approvedAt: new Date() });
    expect(approved.status).toBe("APPROVED");
    for (const reason of [undefined, null, "", "   ", "\n\t", " "])
      await rejects(
        item({ status: "RETIRED", approvedById: author.id, approvedAt: new Date(), retiredReason: reason }),
        /QuestionBankItem_decided/,
      );
    expect((await item({ status: "RETIRED", approvedById: author.id, approvedAt: new Date(), retiredReason: "Wrong key" })).status).toBe(
      "RETIRED",
    );
  });

  test("a draft, pending or rejected item needs none of it, and an approval cannot be taken away", async () => {
    for (const status of ["DRAFT", "PENDING", "REJECTED"] as const) expect((await item({ status })).status).toBe(status);
    const q = await item({ status: "APPROVED", approvedById: author.id, approvedAt: new Date() });
    await rejects(db.questionBankItem.update({ where: { id: q.id }, data: { approvedById: null } }), /QuestionBankItem_decided/);
    await rejects(db.questionBankItem.update({ where: { id: q.id }, data: { approvedAt: null } }), /QuestionBankItem_decided/);
    await rejects(db.questionBankItem.update({ where: { id: q.id }, data: { status: "RETIRED" } }), /QuestionBankItem_decided/);
  });
});
