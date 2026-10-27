import { test, expect } from "@playwright/test";
import crypto from "node:crypto";
import { signPortalSession, verifyPortalSession, type PortalSessionPayload } from "@/lib/portal/auth";
import { portalSecret } from "@/lib/portal/secret";

// Who is acting is part of the signed portal session (task 0040): a PUPIL or a GUARDIAN. A cookie signed before this existed carries no actor and is read as a GUARDIAN.

const now = () => Math.floor(Date.now() / 1000);
const payload = (actor: PortalSessionPayload["actor"]): PortalSessionPayload => ({
  actor,
  primaryStudentId: "stu_1",
  allowedStudentIds: ["stu_1"],
  issuedAt: now(),
  expiresAt: now() + 3600,
});
/// A token signed with the real secret over any JSON, as an old release (or an attacker who somehow held the secret) would have produced it.
const signRaw = (value: unknown) => {
  const serialized = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${serialized}.${crypto.createHmac("sha256", portalSecret()).update(serialized).digest("base64url")}`;
};

test("both actors survive signing and verifying", () => {
  expect(verifyPortalSession(signPortalSession(payload("PUPIL")))?.actor).toBe("PUPIL");
  expect(verifyPortalSession(signPortalSession(payload("GUARDIAN")))?.actor).toBe("GUARDIAN");
});

test("a cookie from before the actor existed is a GUARDIAN: never widened to anything else", () => {
  const { actor: _actor, ...legacy } = payload("PUPIL");
  void _actor;
  expect(verifyPortalSession(signRaw(legacy))?.actor).toBe("GUARDIAN");
});

test("any other actor value is not a session at all", () => {
  for (const bad of ["ADMIN", "pupil", "", null, 1, true, [], {}, "GUARDIAN "]) {
    expect(verifyPortalSession(signRaw({ ...payload("PUPIL"), actor: bad })), JSON.stringify(bad)).toBeNull();
  }
});

test("the actor cannot be changed without the secret", () => {
  const token = signPortalSession(payload("GUARDIAN"));
  const [, signature] = token.split(".");
  const forged = Buffer.from(JSON.stringify(payload("PUPIL"))).toString("base64url");
  expect(verifyPortalSession(`${forged}.${signature}`)).toBeNull();
});
