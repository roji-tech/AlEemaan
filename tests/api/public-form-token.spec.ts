import "../support/env";
import { test, expect } from "@playwright/test";
import { FormAudienceKind, FormKind, FormStatus, Role } from "@prisma/client";
import { createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api } from "../support/http";

// The two public questionnaire routes (GET /api/v1/forms/public/[token] and POST .../submit) take no sign-in, so they do not go through `withAuth`, which is what replaces an
// unusable value in the URL path (a NUL byte, another control character, an absurd length) with a stand-in so the route answers as for any token that does not exist. They used
// to pass the raw token to the database: Postgres refuses a NUL byte, and the caller, anyone on the internet, got a 500. A token that can only be a mistake or an attack must
// look exactly like a token that does not exist.

const TOKEN = "0123456789abcdef0123456789abcdef";
// As they would arrive in the path: NUL, NUL inside text, another control character, DEL, a very long value.
const HOSTILE = ["%00", "a%00b", "%01", "%7f", "x".repeat(5000)];

let formId: string;

test.afterAll(async () => {
  await resetDatabase();
});

test.beforeEach(async () => {
  await resetDatabase();
  const home = await seedInstance();
  const owner = await createUser({ role: Role.ADMIN });
  const form = await db.form.create({
    data: {
      branchId: home.id,
      kind: FormKind.QUESTIONNAIRE,
      title: "Open feedback",
      status: FormStatus.PUBLISHED,
      createdById: owner.id,
      shareToken: TOKEN,
    },
  });
  formId = form.id;
  await db.formAudience.create({ data: { branchId: home.id, formId: form.id, kind: FormAudienceKind.PUBLIC } });
});

const submit = (token: string) =>
  api(`/api/v1/forms/public/${token}/submit`, { body: { answers: [{ formQuestionId: "q1", value: "yes" }] } });

test.describe("a token that cannot be right is a token that does not exist", () => {
  test("the real token still opens the questionnaire (control)", async () => {
    const res = await api(`/api/v1/forms/public/${TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.json.data.questionnaire.title).toBe("Open feedback");
  });

  test("reading: a hostile token gets the same 404 as an unknown one, never a server error", async () => {
    const unknown = await api("/api/v1/forms/public/doesnotexist0000000000000000000");
    expect(unknown.status).toBe(404);
    for (const token of HOSTILE) {
      const res = await api(`/api/v1/forms/public/${token}`);
      expect(res.status, `GET [${token.slice(0, 12)}]`).toBe(404);
      expect(res.json.error.code, token.slice(0, 12)).toBe(unknown.json.error.code);
      expect(res.json.error.message, token.slice(0, 12)).toBe(unknown.json.error.message);
    }
  });

  test("submitting: a hostile token gets the same answer as an unknown one, never a server error, and nothing is stored", async () => {
    const unknown = await submit("doesnotexist0000000000000000000");
    expect(unknown.status).toBeLessThan(500);
    for (const token of HOSTILE) {
      const res = await submit(token);
      expect(res.status, `POST [${token.slice(0, 12)}]`).toBe(unknown.status);
      expect(res.json.error.code, token.slice(0, 12)).toBe(unknown.json.error.code);
    }
    expect(await db.formResponse.count({ where: { formId } })).toBe(0);
  });
});
