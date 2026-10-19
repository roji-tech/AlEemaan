import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// Enforcement and change requests (Slice UI1): a superadmin can put the report-card layout behind approval; a branch administrator's change to the public
// verification page always waits for a superadmin. Both are filed with a reason and applied only when a superadmin approves.

let home: { id: string };
test.afterAll(async () => {
  await resetDatabase();
});
test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();
});

const asAdmin = async (branchId = home.id) => {
  const user = await createUser({ superAdmin: false });
  await db.membership.create({ data: { userId: user.id, branchId, role: Role.ADMIN } });
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
};
const asSuper = async () => {
  const user = await createUser({ superAdmin: true });
  await db.membership.create({ data: { userId: user.id, branchId: home.id, role: Role.ADMIN } });
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
};
const LAYOUTS = "/api/v1/settings/layouts";
const VERIFY = "/api/v1/settings/verification";
const ENFORCE = "/api/v1/settings/enforcement";
const approval = (id: string) => `/api/v1/settings/approval/${id}`;

test.describe("enforcement switch", () => {
  test("only a superadmin can read or set it; an unknown branch is a 404; the flag is listed", async () => {
    const admin = await asAdmin();
    const sup = await asSuper();
    expect((await api(ENFORCE, { cookie: admin.cookie })).status).toBe(403);
    expect((await api(ENFORCE, { method: "PUT", cookie: admin.cookie, body: { key: "report_card_layout", enforced: true } })).status).toBe(
      403,
    );
    expect(
      (await api(ENFORCE, { method: "PUT", cookie: sup.cookie, body: { key: "report_card_layout", branchId: "nope", enforced: true } }))
        .status,
    ).toBe(404);
    expect((await api(ENFORCE, { method: "PUT", cookie: sup.cookie, body: { key: "something_else", enforced: true } })).status).toBe(400);
    const on = await api(ENFORCE, { method: "PUT", cookie: sup.cookie, body: { key: "report_card_layout", enforced: true } });
    expect(on.status).toBe(200);
    expect((await api(ENFORCE, { cookie: sup.cookie })).json.data.flags).toEqual([
      { key: "report_card_layout", branchId: null, enforced: true },
    ]);
    // Switching it again updates the same row (no second NULL-branch row).
    await api(ENFORCE, { method: "PUT", cookie: sup.cookie, body: { key: "report_card_layout", enforced: false } });
    expect(await db.settingValue.count({ where: { key: "enforce_approval_report_card_layout" } })).toBe(1);
  });
});

test.describe("report-card layout behind approval", () => {
  test("without enforcement an administrator's change applies at once", async () => {
    const admin = await asAdmin();
    const res = await api(LAYOUTS, { method: "PATCH", cookie: admin.cookie, body: { branchId: home.id, layoutCode: "LEGACY" } });
    expect(res.status).toBe(200);
    expect(res.json.data.layout.code).toBe("LEGACY");
  });

  test("with enforcement the change needs a reason, waits as a request, and only a superadmin can approve it", async () => {
    const admin = await asAdmin();
    const sup = await asSuper();
    await api(ENFORCE, { method: "PUT", cookie: sup.cookie, body: { key: "report_card_layout", enforced: true } });

    const noReason = await api(LAYOUTS, { method: "PATCH", cookie: admin.cookie, body: { branchId: home.id, layoutCode: "LEGACY" } });
    expect(noReason.status).toBe(400);
    expect(noReason.json.error.details[0].path).toBe("body.reason");

    const filed = await api(LAYOUTS, {
      method: "PATCH",
      cookie: admin.cookie,
      body: { branchId: home.id, layoutCode: "LEGACY", options: { logo: false }, reason: "Parents are used to the old card." },
    });
    expect(filed.status).toBe(202);
    expect(filed.json.data.pending).toBe(true);
    const id = filed.json.data.approvalId as string;
    expect((await api(`${LAYOUTS}?branchId=${home.id}`, { cookie: admin.cookie })).json.data.activeLayout.code).toBe("DEFAULT"); // not applied yet

    // The administrator who asked cannot decide it, whoever else is an administrator.
    const other = await asAdmin();
    const asker = await api(approval(id), { method: "PATCH", cookie: admin.cookie, body: { action: "APPROVE", decisionReason: "ok" } });
    expect(asker.status).toBe(403);
    expect(
      (await api(approval(id), { method: "PATCH", cookie: other.cookie, body: { action: "APPROVE", decisionReason: "ok" } })).status,
    ).toBe(403);

    const approved = await api(approval(id), { method: "PATCH", cookie: sup.cookie, body: { action: "APPROVE", decisionReason: "Fine." } });
    expect(approved.status).toBe(200);
    const effective = (await api(`${LAYOUTS}?branchId=${home.id}`, { cookie: admin.cookie })).json.data.activeLayout;
    expect(effective.code).toBe("LEGACY");
    expect(effective.options.logo).toBe(false);
    // Decided once only.
    expect(
      (await api(approval(id), { method: "PATCH", cookie: sup.cookie, body: { action: "REJECT", decisionReason: "again" } })).status,
    ).toBe(409);
  });

  test("a rejected request changes nothing, and a superadmin's own change is never held", async () => {
    const admin = await asAdmin();
    const sup = await asSuper();
    await api(ENFORCE, { method: "PUT", cookie: sup.cookie, body: { key: "report_card_layout", enforced: true } });
    const filed = await api(LAYOUTS, {
      method: "PATCH",
      cookie: admin.cookie,
      body: { branchId: home.id, layoutCode: "LEGACY", reason: "Prefer it." },
    });
    await api(approval(filed.json.data.approvalId), {
      method: "PATCH",
      cookie: sup.cookie,
      body: { action: "REJECT", decisionReason: "Not now." },
    });
    expect((await api(`${LAYOUTS}?branchId=${home.id}`, { cookie: admin.cookie })).json.data.activeLayout.code).toBe("DEFAULT");
    const direct = await api(LAYOUTS, { method: "PATCH", cookie: sup.cookie, body: { branchId: home.id, layoutCode: "LEGACY" } });
    expect(direct.status).toBe(200);
  });
});

test.describe("verification page: an administrator proposes, a superadmin decides", () => {
  test("an administrator's change for their branch is a request with a reason; school-wide or another branch is refused", async () => {
    const admin = await asAdmin();
    const sup = await asSuper();
    const otherBranch = await db.branch.create({ data: { name: `Other ${Date.now()}` } });

    expect((await api(VERIFY, { method: "PATCH", cookie: admin.cookie, body: { branchId: home.id, showMarks: true } })).status).toBe(400); // no reason
    expect((await api(VERIFY, { method: "PATCH", cookie: admin.cookie, body: { showMarks: true, reason: "x" } })).status).toBe(403); // school-wide
    expect(
      (await api(VERIFY, { method: "PATCH", cookie: admin.cookie, body: { branchId: otherBranch.id, showMarks: true, reason: "x" } }))
        .status,
    ).toBe(403);

    const filed = await api(VERIFY, {
      method: "PATCH",
      cookie: admin.cookie,
      body: { branchId: home.id, showMarks: true, showGrade: true, reason: "Parents ask for marks." },
    });
    expect(filed.status).toBe(202);
    expect((await api(`${VERIFY}?branchId=${home.id}`, { cookie: admin.cookie })).json.data.config.showMarks).toBe(false); // not applied yet

    expect(
      (
        await api(approval(filed.json.data.approvalId), {
          method: "PATCH",
          cookie: admin.cookie,
          body: { action: "APPROVE", decisionReason: "ok" },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await api(approval(filed.json.data.approvalId), {
          method: "PATCH",
          cookie: sup.cookie,
          body: { action: "APPROVE", decisionReason: "Agreed." },
        })
      ).status,
    ).toBe(200);
    const config = (await api(`${VERIFY}?branchId=${home.id}`, { cookie: admin.cookie })).json.data.config;
    expect(config.showMarks).toBe(true);
    expect(config.showGrade).toBe(true);
  });

  test("a superadmin's change applies at once, school-wide or per branch", async () => {
    const sup = await asSuper();
    const res = await api(VERIFY, { method: "PATCH", cookie: sup.cookie, body: { showMarks: true } });
    expect(res.status).toBe(200);
    expect(res.json.data.config.showMarks).toBe(true);
    expect(await db.verificationPageConfig.count({ where: { branchId: null } })).toBe(1);
  });
});
