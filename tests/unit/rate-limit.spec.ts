import "../support/env";
import crypto from "node:crypto";
import { test, expect } from "@playwright/test";
import { prisma } from "@/lib/db";
import {
  MAX_TRACKED_IDENTIFIERS,
  auditClientInfo,
  checkRateLimit,
  getClientIp,
  memoryLimiter,
  refundAttempt,
  reserveAttempt,
} from "@/lib/auth/rate-limit";

const WINDOW_MS = 5 * 60 * 1000;
const key = (label: string) => `test:${label}:${crypto.randomUUID()}`;

/// Time is the one thing the limiter reads implicitly (Date.now), so tests
/// drive it with a fake clock and restore the real one afterwards.
async function withClock(fn: (clock: { advance(ms: number): void }) => Promise<void>) {
  const realNow = Date.now;
  let now = realNow.call(Date);
  Date.now = () => now;
  try {
    await fn({ advance: (ms) => void (now += ms) });
  } finally {
    Date.now = realNow;
  }
}

// The same rules must hold whether the counts live in the database (the default; task 0102) or in this process's memory (the fallback, and RATE_LIMIT_STORE=memory).
for (const store of ["database", "memory"] as const) {
  test.describe(`reserve-then-refund limiter (${store})`, () => {
    let saved: string | undefined;
    test.beforeAll(() => {
      saved = process.env.RATE_LIMIT_STORE;
      process.env.RATE_LIMIT_STORE = store;
    });
    test.afterAll(() => {
      if (saved === undefined) delete process.env.RATE_LIMIT_STORE;
      else process.env.RATE_LIMIT_STORE = saved;
    });

    test("allows exactly `limit` reservations, then refuses", async () => {
      const id = key("limit");
      const results: boolean[] = [];
      for (let i = 0; i < 7; i++) results.push(await reserveAttempt(id, 5));
      expect(results).toEqual([true, true, true, true, true, false, false]);
    });

    test("a refused reservation does not extend the lockout", async () => {
      await withClock(async ({ advance }) => {
        const id = key("no-extend");
        for (let i = 0; i < 5; i++) await reserveAttempt(id, 5);
        advance(WINDOW_MS - 1_000);
        expect(await reserveAttempt(id, 5)).toBe(false); // hammering while locked out…
        advance(2_000); // …must not push the window's end out
        expect(await reserveAttempt(id, 5)).toBe(true);
      });
    });

    test("the window slides: attempts expire individually", async () => {
      await withClock(async ({ advance }) => {
        const id = key("slide");
        await reserveAttempt(id, 5);
        await reserveAttempt(id, 5); // two at t=0
        advance(4 * 60 * 1000);
        await reserveAttempt(id, 5);
        await reserveAttempt(id, 5);
        await reserveAttempt(id, 5); // three at t=4min -> full
        expect(await reserveAttempt(id, 5)).toBe(false);
        advance(61 * 1000); // t=5m01s: the first two have aged out, the last three haven't
        expect(await reserveAttempt(id, 5)).toBe(true);
        expect(await reserveAttempt(id, 5)).toBe(true);
        expect(await reserveAttempt(id, 5)).toBe(false);
      });
    });

    test("refund hands back exactly the most recent reservation", async () => {
      const id = key("refund");
      for (let i = 0; i < 5; i++) await reserveAttempt(id, 5);
      expect(await reserveAttempt(id, 5)).toBe(false);
      await refundAttempt(id);
      expect(await reserveAttempt(id, 5)).toBe(true);
      expect(await reserveAttempt(id, 5)).toBe(false);
    });

    test("refunding an unknown or empty key is a harmless no-op", async () => {
      const id = key("refund-empty");
      await refundAttempt(id);
      expect(await reserveAttempt(id, 1)).toBe(true);
      await refundAttempt(id);
      await refundAttempt(id); // already empty
      expect(await reserveAttempt(id, 1)).toBe(true);
    });

    test("checkRateLimit reads without reserving", async () => {
      const id = key("check");
      for (let i = 0; i < 20; i++) expect(await checkRateLimit(id, 2)).toBe(true);
      await reserveAttempt(id, 5);
      await reserveAttempt(id, 5);
      expect(await checkRateLimit(id, 2)).toBe(false);
      expect(await checkRateLimit(id, 3)).toBe(true);
    });

    test("keys are independent", async () => {
      const a = key("indep-a");
      const b = key("indep-b");
      for (let i = 0; i < 5; i++) await reserveAttempt(a, 5);
      expect(await reserveAttempt(a, 5)).toBe(false);
      expect(await reserveAttempt(b, 5)).toBe(true);
    });

    test("concurrent reservations are atomic: 50 racers, exactly `limit` win", async () => {
      // Guards the file's stated invariant (no `await` inside reserveAttempt). If
      // someone adds one, every racer passes the count check before any records.
      const id = key("race");
      const results = await Promise.all(Array.from({ length: 50 }, () => reserveAttempt(id, 5)));
      expect(results.filter(Boolean)).toHaveLength(5);
    });
  });
}

test.describe("the database store (task 0102)", () => {
  const rows = (id: string) => prisma.rateLimitHit.count({ where: { key: id } });

  test("the count is in the database, not in this process: wiping the process's memory changes nothing, so a second instance would see the same count", async () => {
    const id = key("shared");
    for (let i = 0; i < 5; i++) expect(await reserveAttempt(id, 5)).toBe(true);
    memoryLimiter.clear(); // what another server instance, or a restart, would have: nothing in memory
    expect(await reserveAttempt(id, 5)).toBe(false);
    expect(await rows(id)).toBe(5);
  });

  test("a refused attempt is not recorded, a refund removes exactly one row, and rows past the window are removed when the key is used again", async () => {
    await withClock(async ({ advance }) => {
      const id = key("rows");
      for (let i = 0; i < 3; i++) await reserveAttempt(id, 3);
      expect(await reserveAttempt(id, 3)).toBe(false);
      expect(await rows(id)).toBe(3);
      await refundAttempt(id);
      expect(await rows(id)).toBe(2);
      advance(WINDOW_MS + 1_000);
      expect(await reserveAttempt(id, 3)).toBe(true);
      expect(await rows(id), "the two old rows were removed, the new one is the only one").toBe(1);
    });
  });

  test("two keys never share a count, and a key's rows are only that key's", async () => {
    const a = key("one");
    const b = key("two");
    await reserveAttempt(a, 5);
    await reserveAttempt(a, 5);
    await reserveAttempt(b, 5);
    expect([await rows(a), await rows(b)]).toEqual([2, 1]);
  });

  test("if the database cannot be used the limit still holds, counted in memory, and the caller sees no error", async () => {
    const id = key("fallback");
    const client = prisma as unknown as { $transaction: unknown; $queryRaw: unknown };
    client.$transaction = () => Promise.reject(new Error("the database is down"));
    client.$queryRaw = () => Promise.reject(new Error("the database is down"));
    try {
      const results: boolean[] = [];
      for (let i = 0; i < 7; i++) results.push(await reserveAttempt(id, 5));
      expect(results).toEqual([true, true, true, true, true, false, false]);
      expect(await checkRateLimit(id, 5)).toBe(false);
      await refundAttempt(id);
      expect(await reserveAttempt(id, 5)).toBe(true);
    } finally {
      delete (client as Partial<typeof client>).$transaction;
      delete (client as Partial<typeof client>).$queryRaw;
    }
  });
});

test.describe("bounded memory (LRU eviction)", () => {
  test("evicts the stalest keys past the cap and keeps a hot key", async () => {
    const hot = key("hot");
    const stale = key("stale");
    memoryLimiter.reserve(stale, 1);
    memoryLimiter.reserve(hot, 1);

    // Fill well past the cap with one-off keys (an attacker cycling identifiers),
    // re-touching the hot key along the way like a real, active user.
    for (let i = 0; i < MAX_TRACKED_IDENTIFIERS + 500; i++) {
      memoryLimiter.reserve(`test:flood:${i}:${crypto.randomUUID()}`, 1);
      if (i % 1000 === 0) {
        memoryLimiter.refund(hot);
        memoryLimiter.reserve(hot, 1);
      }
    }

    // A key still tracked reads as "at its limit of 1"; an evicted one reads as fresh.
    expect(memoryLimiter.check(stale, 1)).toBe(true); // evicted
    expect(memoryLimiter.check(hot, 1)).toBe(false); // survived
  });
});

test.describe("getClientIp — only ever trusts what the proxy sets", () => {
  const withEnv = async (env: Record<string, string | undefined>, fn: () => void | Promise<void>) => {
    const saved: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(env)) {
      saved[k] = process.env[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    try {
      await fn();
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  };
  const req = (headers: Record<string, string>) => ({ headers: new Headers(headers) });

  test("default: reads x-real-ip and ignores a spoofed X-Forwarded-For", async () => {
    await withEnv({ CLIENT_IP_HEADER: undefined, TRUSTED_PROXY_HOPS: undefined }, () => {
      expect(getClientIp(req({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe("203.0.113.7");
      // The client-controlled header alone must NOT be believed.
      expect(getClientIp(req({ "x-forwarded-for": "1.2.3.4" }))).toBe("unproxied");
    });
  });

  test("x-forwarded-for mode: takes the Nth entry from the RIGHT, never the spoofable left", async () => {
    await withEnv({ CLIENT_IP_HEADER: "x-forwarded-for", TRUSTED_PROXY_HOPS: "1" }, () => {
      // client sent "6.6.6.6"; our one proxy appended the real peer
      expect(getClientIp(req({ "x-forwarded-for": "6.6.6.6, 198.51.100.9" }))).toBe("198.51.100.9");
    });
    await withEnv({ CLIENT_IP_HEADER: "x-forwarded-for", TRUSTED_PROXY_HOPS: "2" }, () => {
      // CDN -> proxy: the client's own entry is second from the right
      expect(getClientIp(req({ "x-forwarded-for": "6.6.6.6, 198.51.100.9, 10.0.0.1" }))).toBe("198.51.100.9");
    });
  });

  test("x-forwarded-for mode: fewer entries than trusted hops => unproxied (never guess)", async () => {
    await withEnv({ CLIENT_IP_HEADER: "x-forwarded-for", TRUSTED_PROXY_HOPS: "3" }, () => {
      expect(getClientIp(req({ "x-forwarded-for": "198.51.100.9" }))).toBe("unproxied");
    });
  });

  test("no usable header => one shared 'unproxied' bucket; oversize and whitespace are bounded", async () => {
    await withEnv({ CLIENT_IP_HEADER: undefined }, () => {
      expect(getClientIp(req({}))).toBe("unproxied");
      expect(getClientIp(req({ "x-real-ip": "   " }))).toBe("unproxied");
      expect(getClientIp(req({ "x-real-ip": "  203.0.113.7  " }))).toBe("203.0.113.7");
      expect(getClientIp(req({ "x-real-ip": "9".repeat(500) }))).toHaveLength(64);
    });
  });

  test("the configured header name is case-insensitive", async () => {
    await withEnv({ CLIENT_IP_HEADER: "X-Client-IP" }, () => {
      expect(getClientIp(req({ "x-client-ip": "203.0.113.50" }))).toBe("203.0.113.50");
    });
  });
});

test.describe("auditClientInfo — what an audit record keeps about the caller", () => {
  const req = (headers: Record<string, string>) => ({ headers: new Headers(headers) });
  const withHeader = async (name: string | undefined, fn: () => void) => {
    const saved = process.env.CLIENT_IP_HEADER;
    if (name === undefined) delete process.env.CLIENT_IP_HEADER;
    else process.env.CLIENT_IP_HEADER = name;
    try {
      fn();
    } finally {
      if (saved === undefined) delete process.env.CLIENT_IP_HEADER;
      else process.env.CLIENT_IP_HEADER = saved;
    }
  };

  test("keeps the address the proxy set and ignores the browser's own forwarded-for list", async () => {
    await withHeader(undefined, () => {
      const info = auditClientInfo(
        req({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "6.6.6.6, 1.2.3.4", "user-agent": "Firefox/130.0" }),
      );
      expect(info).toEqual({ ipAddress: "203.0.113.7", userAgent: "Firefox/130.0" });
    });
  });

  test("no trusted address means no address, not the made-up one and not the word 'unproxied'", async () => {
    await withHeader(undefined, () => {
      expect(auditClientInfo(req({ "x-forwarded-for": "6.6.6.6" })).ipAddress).toBeUndefined();
      expect(auditClientInfo(req({})).ipAddress).toBeUndefined();
    });
  });

  test("in x-forwarded-for mode it takes the entry the trusted proxy appended, from the right", async () => {
    await withHeader("x-forwarded-for", () => {
      expect(auditClientInfo(req({ "x-forwarded-for": "6.6.6.6, 198.51.100.9" })).ipAddress).toBe("198.51.100.9");
    });
  });

  test("the user agent is trimmed and cut to 256 characters; an empty one is nothing", async () => {
    await withHeader(undefined, () => {
      expect(auditClientInfo(req({ "x-real-ip": "203.0.113.7", "user-agent": "  Firefox/130.0  " })).userAgent).toBe("Firefox/130.0");
      expect(auditClientInfo(req({ "x-real-ip": "203.0.113.7", "user-agent": "a".repeat(5000) })).userAgent).toHaveLength(256);
      expect(auditClientInfo(req({ "x-real-ip": "203.0.113.7", "user-agent": "   " })).userAgent).toBeUndefined();
      expect(auditClientInfo(req({ "x-real-ip": "203.0.113.7" })).userAgent).toBeUndefined();
    });
  });
});
