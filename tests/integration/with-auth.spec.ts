import { HTTP_PORT, HTTP_URL } from "../support/env";
import { NextRequest, NextResponse } from "next/server";
import { test, expect } from "@playwright/test";
import { NUL_MESSAGE } from "@/lib/api/no-nul";
import { withAuth } from "@/lib/auth/with-auth";
import { SESSION_COOKIE_NAME, createSession } from "@/lib/auth/session";
import { Role, createUser, db } from "../support/db";

const APP = HTTP_URL;

function request(opts: { method?: string; origin?: string | null; token?: string; query?: string; body?: string } = {}) {
  const headers: Record<string, string> = { "x-forwarded-host": `localhost:${HTTP_PORT}` };
  if (opts.origin !== null && opts.origin !== undefined) headers.origin = opts.origin;
  if (opts.token) headers.cookie = `${SESSION_COOKIE_NAME}=${opts.token}`;
  return new NextRequest(`${APP}/api/v1/thing${opts.query ? `?${opts.query}` : ""}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body,
  });
}

function makeHandler() {
  const calls: { userId: string; ctx: unknown }[] = [];
  const route = withAuth<{ params: { id: string } }>(async (_req, auth, ctx) => {
    calls.push({ userId: auth.userId, ctx });
    return NextResponse.json({ ok: true });
  });
  return { route, calls };
}
const ctx = { params: { id: "42" } };
const codeOf = async (res: Response) => (await res.json()).error?.code;

test.describe("withAuth", () => {
  test("no session => 401 UNAUTHENTICATED and the handler never runs", async () => {
    const { route, calls } = makeHandler();
    const res = await route(request(), ctx);
    expect(res.status).toBe(401);
    expect(await codeOf(res)).toBe("UNAUTHENTICATED");
    expect(res.headers.get("cache-control")).toBe("no-store"); // refusals are uncacheable too
    expect(calls).toHaveLength(0);
  });

  test("an unknown/garbage token is also 401", async () => {
    const { route, calls } = makeHandler();
    const res = await route(request({ token: "f".repeat(64) }), ctx);
    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  test("valid session => handler runs with the resolved user and the route context", async () => {
    const user = await createUser();
    const { token } = await createSession(user.id);
    const { route, calls } = makeHandler();
    const res = await route(request({ token }), ctx);
    expect(res.status).toBe(200);
    expect(calls).toEqual([{ userId: user.id, ctx }]);
  });

  test("authenticated responses default to Cache-Control: private, no-store", async () => {
    const user = await createUser();
    const { token } = await createSession(user.id);
    const { route } = makeHandler();
    const res = await route(request({ token }), ctx);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  test("a handler that sets its own Cache-Control keeps it", async () => {
    const user = await createUser();
    const { token } = await createSession(user.id);
    const route = withAuth(async () => {
      const res = NextResponse.json({});
      res.headers.set("Cache-Control", "no-cache");
      return res;
    });
    const res = await route(request({ token }), undefined);
    expect(res.headers.get("cache-control")).toBe("no-cache");
  });

  test.describe("a NUL character in the query string or the JSON body is refused for every route, before its handler (lib/api/no-nul.ts)", () => {
    const nul = String.fromCharCode(0);

    test("in the query string (a value, a key, one of several values): 400 VALIDATION naming the query, and the handler never runs", async () => {
      const user = await createUser();
      const { token } = await createSession(user.id);
      const { route, calls } = makeHandler();
      for (const query of ["q=a%00b", "q%00=1", "tag=ok&tag=x%00", "%00"]) {
        const res = await route(request({ token, query }), ctx);
        expect(res.status, query).toBe(400);
        const error = (await res.json()).error;
        expect(error.code).toBe("VALIDATION");
        expect(error.details).toEqual([{ path: "query", message: NUL_MESSAGE }]);
        expect(res.headers.get("cache-control")).toBe("no-store");
      }
      expect(calls).toHaveLength(0);
    });

    test("in a JSON body (a value, a key, nested), whatever the method: 400 VALIDATION naming the body, and the handler never runs", async () => {
      const user = await createUser();
      const { token } = await createSession(user.id);
      const { route, calls } = makeHandler();
      const bodies = [{ name: `a${nul}b` }, { [`x${nul}`]: 1 }, { list: [{ deep: [nul] }] }];
      for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        for (const body of bodies) {
          const res = await route(request({ method, origin: APP, token, body: JSON.stringify(body) }), ctx);
          expect(res.status, `${method} ${JSON.stringify(body)}`).toBe(400);
          const error = (await res.json()).error;
          expect(error.code).toBe("VALIDATION");
          expect(error.details).toEqual([{ path: "body", message: NUL_MESSAGE }]);
          expect(res.headers.get("cache-control")).toBe("no-store");
        }
      }
      expect(calls).toHaveLength(0);
    });

    test("the usual refusals come first: signed out is 401 and a cross-origin request is 403, whatever the address or the body holds", async () => {
      const { route, calls } = makeHandler();
      const body = JSON.stringify({ name: `a${nul}b` });
      expect((await route(request({ method: "POST", origin: APP, query: "q=a%00b", body }), ctx)).status).toBe(401);
      const user = await createUser();
      const { token } = await createSession(user.id);
      expect((await route(request({ method: "POST", origin: "https://evil.example", token, query: "q=a%00b", body }), ctx)).status).toBe(
        403,
      );
      expect(calls).toHaveLength(0);
    });

    test("what only looks like one passes, and the handler still reads the whole body after the scan", async () => {
      const user = await createUser();
      const { token } = await createSession(user.id);
      const literalEscape = ["\\", "u0000"].join("");
      const seen: unknown[] = [];
      const route = withAuth(async (req) => {
        seen.push(await req.json());
        return NextResponse.json({ ok: true });
      });
      const body = { text: literalEscape, line: "a\nb\tc", long: "x".repeat(200_000), accent: "Núñez" };
      const res = await route(
        request({ method: "POST", origin: APP, token, query: "q=%5Cu0000&r=%2500&s=a%09b%0Ac", body: JSON.stringify(body) }),
        undefined,
      );
      expect(res.status).toBe(200);
      expect(seen).toEqual([body]);
    });

    test("a body that is not JSON, or is empty, goes on to the handler untouched (the scan does not judge it)", async () => {
      const user = await createUser();
      const { token } = await createSession(user.id);
      const seen: string[] = [];
      const route = withAuth(async (req) => {
        seen.push(await req.text());
        return NextResponse.json({ ok: true });
      });
      for (const body of ["{nope", "plain text", ""]) {
        const res = await route(request({ method: "POST", origin: APP, token, body }), undefined);
        expect(res.status, body).toBe(200);
      }
      expect(seen).toEqual(["{nope", "plain text", ""]);
    });
  });

  test.describe("CSRF is enforced for every state-changing method, by the wrapper itself", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      test(`${method} without an Origin/Referer is rejected even with a valid session`, async () => {
        const user = await createUser();
        const { token } = await createSession(user.id);
        const { route, calls } = makeHandler();
        const res = await route(request({ method, token }), ctx);
        expect(res.status).toBe(403);
        expect(await codeOf(res)).toBe("CSRF");
        expect(res.headers.get("cache-control")).toBe("no-store");
        expect(calls).toHaveLength(0);
      });
    }

    test("a cross-origin Origin is rejected", async () => {
      const user = await createUser();
      const { token } = await createSession(user.id);
      const { route, calls } = makeHandler();
      const res = await route(request({ method: "POST", origin: "https://evil.example", token }), ctx);
      expect(res.status).toBe(403);
      expect(calls).toHaveLength(0);
    });

    test("a same-origin POST with a valid session goes through", async () => {
      const user = await createUser();
      const { token } = await createSession(user.id);
      const { route, calls } = makeHandler();
      const res = await route(request({ method: "POST", origin: APP, token }), ctx);
      expect(res.status).toBe(200);
      expect(calls).toHaveLength(1);
    });

    test("CSRF is checked BEFORE the session lookup (a forged request learns nothing about the session)", async () => {
      const { route } = makeHandler();
      const res = await route(request({ method: "POST", origin: "https://evil.example", token: "f".repeat(64) }), ctx);
      expect(res.status).toBe(403); // not 401
    });

    test("same-origin POST without a session is 401", async () => {
      const { route } = makeHandler();
      const res = await route(request({ method: "POST", origin: APP }), ctx);
      expect(res.status).toBe(401);
    });

    test("safe methods (GET/HEAD/OPTIONS) don't need an Origin", async () => {
      const user = await createUser();
      const { token } = await createSession(user.id);
      const { route } = makeHandler();
      for (const method of ["GET", "HEAD", "OPTIONS"]) {
        expect((await route(request({ method, token }), ctx)).status).toBe(200);
      }
    });
  });
});

test.describe("withAuth `roles` (AlEemaan: any membership with a listed role, school-wide)", () => {
  function adminRoute() {
    const calls: string[] = [];
    const route = withAuth(
      async (_req, auth) => {
        calls.push(auth.userId);
        return NextResponse.json({ ok: true });
      },
      { roles: [Role.ADMIN] },
    );
    return { route, calls };
  }
  const signedIn = async (role?: Role) => {
    const user = await createUser({ role });
    const { token } = await createSession(user.id);
    return { user, token };
  };

  test("no session => 401 (sign in), never 403", async () => {
    const { route, calls } = adminRoute();
    const res = await route(request(), undefined);
    expect(res.status).toBe(401);
    expect(await codeOf(res)).toBe("UNAUTHENTICATED");
    expect(calls).toHaveLength(0);
  });

  test("signed in but NOT an admin => 403 FORBIDDEN (signing in again won't help), uncacheable, handler never runs", async () => {
    const { route, calls } = adminRoute();
    for (const role of [undefined, Role.TEACHING_STAFF, Role.STUDENT, Role.PARENT, Role.NON_TEACHING_STAFF]) {
      const { token } = await signedIn(role);
      const res = await route(request({ token }), undefined);
      expect(res.status, `role ${role ?? "none"}`).toBe(403);
      expect(await codeOf(res)).toBe("FORBIDDEN");
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
    expect(calls).toHaveLength(0);
  });

  test("an ADMIN gets through", async () => {
    const { route, calls } = adminRoute();
    const { user, token } = await signedIn(Role.ADMIN);
    const res = await route(request({ token }), undefined);
    expect(res.status).toBe(200);
    expect(calls).toEqual([user.id]);
  });

  test("the role may be held in ANY branch (an admin's row anchors to one branch, the role crosses all of them)", async () => {
    const { route } = adminRoute();
    const user = await createUser({ role: Role.ADMIN });
    // move the membership to a different branch than the seed default
    const other = await db.branch.findFirstOrThrow({ where: { name: "Primary (Arabic)" } });
    await db.membership.updateMany({ where: { userId: user.id }, data: { branchId: other.id } });
    const { token } = await createSession(user.id);
    expect((await route(request({ token }), undefined)).status).toBe(200);
  });

  test("any of several listed roles is enough", async () => {
    const calls: string[] = [];
    const route = withAuth(
      async (_req, auth) => {
        calls.push(auth.userId);
        return NextResponse.json({});
      },
      { roles: [Role.ADMIN, Role.TEACHING_STAFF] },
    );
    const teacher = await signedIn(Role.TEACHING_STAFF);
    const parent = await signedIn(Role.PARENT);
    expect((await route(request({ token: teacher.token }), undefined)).status).toBe(200);
    expect((await route(request({ token: parent.token }), undefined)).status).toBe(403);
  });

  test("order: CSRF first, then authentication, then authorization", async () => {
    const { route } = adminRoute();
    const nonAdmin = await signedIn(Role.PARENT);
    // cross-origin POST from a signed-in NON-admin: CSRF wins (403 CSRF), not FORBIDDEN
    const csrf = await route(request({ method: "POST", origin: "https://evil.example", token: nonAdmin.token }), undefined);
    expect(csrf.status).toBe(403);
    expect(await codeOf(csrf)).toBe("CSRF");
    // same-origin POST, not signed in: 401
    expect((await route(request({ method: "POST", origin: APP }), undefined)).status).toBe(401);
    // same-origin POST, signed in, not admin: 403 FORBIDDEN
    const forbidden = await route(request({ method: "POST", origin: APP, token: nonAdmin.token }), undefined);
    expect(forbidden.status).toBe(403);
    expect(await codeOf(forbidden)).toBe("FORBIDDEN");
  });
});
