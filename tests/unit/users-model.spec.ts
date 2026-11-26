import { test, expect } from "@playwright/test";
import { displayName, expiryText, sentText } from "@/components/users/model";
import { escapeLike } from "@/lib/members/service";
import { INVITATION_TTL_MS, hashInvitationToken, isInvitationToken, newInvitationToken } from "@/lib/invitations/token";
import { invitationStatus, isLiveInvitation } from "@/lib/invitations/status";

// The pure parts of the Users pages (the database-backed behaviour is in tests/integration): wording, escaping, token shape, status.

const NOW = Date.parse("2026-10-07T12:00:00Z");
const at = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

test.describe("expiryText", () => {
  test("says the largest whole unit left, singular and plural", () => {
    expect(expiryText(at(6 * DAY + 3 * HOUR), NOW)).toBe("Expires in 6 days");
    expect(expiryText(at(1 * DAY), NOW)).toBe("Expires in 1 day");
    expect(expiryText(at(23 * HOUR + 59 * MIN), NOW)).toBe("Expires in 23 hours");
    expect(expiryText(at(1 * HOUR), NOW)).toBe("Expires in 1 hour");
    expect(expiryText(at(59 * MIN), NOW)).toBe("Expires in 59 minutes");
    expect(expiryText(at(1 * MIN), NOW)).toBe("Expires in 1 minute");
  });

  test("under a minute, at the instant, and in the past", () => {
    expect(expiryText(at(59_000), NOW)).toBe("Expires in under a minute");
    expect(expiryText(at(0), NOW)).toBe("Expired"); // the moment of expiry is already expired (the server's rule is exclusive too)
    expect(expiryText(at(-1), NOW)).toBe("Expired");
    expect(expiryText(at(-30 * DAY), NOW)).toBe("Expired");
  });
});

test.describe("displayName", () => {
  test("the name, else the address, else a placeholder — and a blank name is not a name", () => {
    expect(displayName({ name: "Ada Admin", email: "a@x.test" })).toBe("Ada Admin");
    expect(displayName({ name: "   ", email: "a@x.test" })).toBe("a@x.test");
    expect(displayName({ name: null, email: "a@x.test" })).toBe("a@x.test");
    expect(displayName({ name: null, email: null })).toBe("Unnamed person");
  });
});

test.describe("escapeLike", () => {
  test("makes %, _ and \\ ordinary text, and leaves everything else alone", () => {
    expect(escapeLike("100%")).toBe("100\\%");
    expect(escapeLike("a_b")).toBe("a\\_b");
    expect(escapeLike("c:\\dir")).toBe("c:\\\\dir");
    expect(escapeLike("plain text")).toBe("plain text");
    expect(escapeLike("%_\\")).toBe("\\%\\_\\\\");
  });
});

test.describe("invitation tokens and status", () => {
  test("a token is 43 base64url characters and is never equal to its hash; hashes are 64 hex characters and deterministic", () => {
    const token = newInvitationToken();
    expect(isInvitationToken(token)).toBe(true);
    expect(token).toHaveLength(43);
    expect(hashInvitationToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashInvitationToken(token)).toBe(hashInvitationToken(token));
    expect(hashInvitationToken(token)).not.toBe(token);
    expect(hashInvitationToken(newInvitationToken())).not.toBe(hashInvitationToken(token));
  });

  test("shape check refuses what cannot be a token (so garbage never reaches the database)", () => {
    for (const bad of [
      "",
      " ",
      "a".repeat(42),
      "a".repeat(44),
      `${"a".repeat(42)}!`,
      `${"a".repeat(42)} `,
      "../".repeat(15),
      43,
      null,
      undefined,
      {},
    ]) {
      expect(isInvitationToken(bad), String(bad)).toBe(false);
    }
  });

  test("a link lives exactly seven days", () => {
    expect(INVITATION_TTL_MS).toBe(7 * DAY);
  });

  test("status: accepted beats revoked beats expired beats pending; expiry is exclusive; only 'pending' is live", () => {
    const now = new Date(NOW);
    const future = new Date(NOW + 1);
    const past = new Date(NOW - 1);
    const open = { acceptedAt: null, revokedAt: null };
    expect(invitationStatus({ ...open, expiresAt: future }, now)).toBe("pending");
    expect(invitationStatus({ ...open, expiresAt: now }, now)).toBe("expired");
    expect(invitationStatus({ acceptedAt: null, revokedAt: past, expiresAt: future }, now)).toBe("revoked");
    expect(invitationStatus({ acceptedAt: past, revokedAt: past, expiresAt: past }, now)).toBe("accepted");
    expect(isLiveInvitation({ ...open, expiresAt: future }, now)).toBe(true);
    for (const times of [
      { ...open, expiresAt: now },
      { acceptedAt: past, revokedAt: null, expiresAt: future },
      { acceptedAt: null, revokedAt: past, expiresAt: future },
    ])
      expect(isLiveInvitation(times, now)).toBe(false);
  });
});

test.describe("sentText", () => {
  const base = { createdAt: "2026-11-20T09:00:00.000Z", sentAt: "2026-11-26T14:20:00.000Z" };
  test("a sent invitation says when it was sent, a draft when it was saved, an old row falls back to its creation time", () => {
    expect(sentText({ status: "pending", ...base })).toMatch(/^Sent 26 Nov 2026, \d{2}:\d{2}$/);
    expect(sentText({ status: "expired", ...base })).toMatch(/^Sent 26 Nov 2026,/);
    expect(sentText({ status: "draft", ...base, sentAt: null })).toMatch(/^Saved 20 Nov 2026,/);
    expect(sentText({ status: "pending", createdAt: base.createdAt })).toMatch(/^Sent 20 Nov 2026,/);
  });
});
