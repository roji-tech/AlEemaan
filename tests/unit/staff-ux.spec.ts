import { expect, test } from "@playwright/test";
import { ALL_BRANCHES, BRANCH_PARAM, pickBranch, rememberable, withBranchParam } from "@/components/ui/branch-selection";
import {
  NOTHING_HIDDEN,
  SNOOZE_MS,
  close,
  dontList,
  listAgain,
  parseHidden,
  reopen,
  shown,
  snooze,
} from "@/components/academics/unlisted-hidden";
import { DELETE_BLOCKED_PREFIX, blockedMessage, deleteBlockers } from "@/lib/academics/staff-delete";
import { historyState, historyText, type HistoricInvitation } from "@/components/users/model-history";

// Task 0117: the pure rules behind the staff and navigation fixes (the maintainer, 2026-11-20).

test.describe("the branch a page shows", () => {
  const ids = ["a", "b", "c"];
  test("order: chosen here, the address, a link's branch, the remembered one, then the fallback", () => {
    expect(pickBranch({ ids, chosen: "c", address: "b", initial: "a", remembered: "a", fallback: "a" })).toBe("c");
    expect(pickBranch({ ids, address: "b", initial: "c", remembered: "a", fallback: "a" })).toBe("b");
    expect(pickBranch({ ids, initial: "c", remembered: "b", fallback: "a" })).toBe("c");
    expect(pickBranch({ ids, remembered: "b", fallback: "a" })).toBe("b");
    expect(pickBranch({ ids, fallback: "a" })).toBe("a");
  });
  test("an id the person does not have is skipped at every step, never trusted", () => {
    expect(pickBranch({ ids, chosen: "zz", address: "yy", initial: "xx", remembered: "ww", fallback: "a" })).toBe("a");
    expect(pickBranch({ ids, address: "yy", remembered: "c", fallback: "a" })).toBe("c");
    expect(pickBranch({ ids, address: null, initial: undefined, remembered: null, fallback: "b" })).toBe("b");
  });
  test("'all' is honoured only where the page offers it, and is never taken from memory", () => {
    expect(pickBranch({ ids, address: ALL_BRANCHES, fallback: "a" })).toBe("a");
    expect(pickBranch({ ids, allowAll: true, address: ALL_BRANCHES, remembered: "b", fallback: "a" })).toBe(ALL_BRANCHES);
    expect(pickBranch({ ids, allowAll: true, remembered: ALL_BRANCHES, fallback: "a" })).toBe("a");
    expect(rememberable(ALL_BRANCHES)).toBeNull();
    expect(rememberable("b")).toBe("b");
  });
  test("choosing rewrites only the branch parameter of the address", () => {
    const next = new URLSearchParams(withBranchParam("tab=staff&q=amina&branch=a", "b"));
    expect(next.get(BRANCH_PARAM)).toBe("b");
    expect(next.get("tab")).toBe("staff");
    expect(next.get("q")).toBe("amina");
    expect(withBranchParam("", "c")).toBe("branch=c");
  });
});

test.describe("'Signs in here, not on the staff list yet': close, remind me later, don't list", () => {
  const people = [{ userId: "u1" }, { userId: "u2" }];
  const NOW = Date.UTC(2026, 10, 20, 12);
  test("nothing hidden shows everyone", () => {
    const v = shown(people, NOTHING_HIDDEN, NOW);
    expect([v.candidates.length, v.hidden.length, v.collapsed]).toEqual([2, 0, false]);
  });
  test("closed stays closed until somebody new appears", () => {
    const closed = close(NOTHING_HIDDEN, people);
    expect(shown(people, closed, NOW).collapsed).toBe(true);
    expect(shown([people[0]], closed, NOW).collapsed).toBe(true); // somebody left: still closed
    expect(shown([...people, { userId: "u3" }], closed, NOW).collapsed).toBe(false); // somebody new: back
    expect(shown(people, reopen(closed), NOW).collapsed).toBe(false); // the chip reopens it
  });
  test("remind me later hides it for seven days, then it is back", () => {
    const later = snooze(NOTHING_HIDDEN, NOW);
    expect(later.snoozedUntil).toBe(NOW + SNOOZE_MS);
    expect(shown(people, later, NOW + SNOOZE_MS - 1).collapsed).toBe(true);
    expect(shown(people, later, NOW + SNOOZE_MS).collapsed).toBe(false);
  });
  test("don't list leaves one person out for good, and list again brings them back", () => {
    const left = dontList(NOTHING_HIDDEN, "u1");
    const v = shown(people, left, NOW);
    expect(v.candidates.map((m) => m.userId)).toEqual(["u2"]);
    expect(v.hidden.map((m) => m.userId)).toEqual(["u1"]);
    expect(dontList(left, "u1").dontList).toEqual(["u1"]); // once
    expect(shown(people, listAgain(left, "u1"), NOW).candidates).toHaveLength(2);
  });
  test("a panel with nobody left to list is not 'collapsed' (there is nothing to remind about)", () => {
    const everyone = dontList(dontList(NOTHING_HIDDEN, "u1"), "u2");
    const v = shown(people, everyone, NOW);
    expect([v.candidates.length, v.hidden.length, v.collapsed]).toEqual([0, 2, false]);
  });
  test("what was stored is read defensively", () => {
    expect(parseHidden(null)).toEqual(NOTHING_HIDDEN);
    expect(parseHidden("{nope")).toEqual(NOTHING_HIDDEN);
    expect(parseHidden("[]")).toEqual(NOTHING_HIDDEN);
    expect(parseHidden(JSON.stringify({ closedFor: ["a", 7], snoozedUntil: "x", dontList: "b" }))).toEqual({
      closedFor: ["a"],
      snoozedUntil: null,
      dontList: [],
    });
    expect(parseHidden(JSON.stringify({ closedFor: ["a"], snoozedUntil: 5, dontList: ["b"] }))).toEqual({
      closedFor: ["a"],
      snoozedUntil: 5,
      dontList: ["b"],
    });
  });
});

test.describe("deleting a staff record", () => {
  const none = {
    assignments: 0,
    teacherOfArms: 0,
    attendanceGrants: 0,
    timetableSlots: 0,
    programPlaces: 0,
    createdAssignments: 0,
    gradedSubmissions: 0,
    createdMaterials: 0,
    createdQuizzes: 0,
  };
  test("a record with no history has no blockers", () => {
    expect(deleteBlockers(none)).toEqual([]);
  });
  test("each kind of history is named, with its count", () => {
    expect(deleteBlockers({ ...none, assignments: 1 })).toEqual(["teaches 1 subject in a class"]);
    expect(deleteBlockers({ ...none, assignments: 3, teacherOfArms: 2 })).toEqual([
      "teaches 3 subjects in classes",
      "is the class teacher of 2 class arms (current or archived)",
    ]);
    expect(deleteBlockers({ ...none, attendanceGrants: 1, timetableSlots: 4, programPlaces: 1 })).toEqual([
      "holds 1 attendance permission",
      "is on 4 timetable slots",
      "takes part in 1 program",
    ]);
    expect(deleteBlockers({ ...none, createdAssignments: 1, createdQuizzes: 1, gradedSubmissions: 2 })).toEqual([
      "authored or graded 4 pieces of coursework",
    ]);
  });
  test("the answer says what to do instead", () => {
    const message = blockedMessage(["teaches 1 subject in a class"]);
    expect(message.startsWith(DELETE_BLOCKED_PREFIX)).toBe(true);
    expect(message).toContain("Archive it instead");
  });
});

test.describe("the history of invitations", () => {
  const base: HistoricInvitation = {
    id: "i1",
    email: "a@school.example",
    role: "TEACHING_STAFF",
    branchId: "b",
    branchName: "Primary",
    invitedByName: "Ada Admin",
    createdAt: "2026-11-10T10:00:00.000Z",
    expiresAt: "2026-11-17T10:00:00.000Z",
    status: "expired",
    acceptedAt: null,
    revokedAt: null,
    revokedByName: null,
    revokedWhy: null,
  };
  test("accepted, revoked or run out", () => {
    expect(historyState({ acceptedAt: "2026-11-11T10:00:00.000Z", revokedAt: null })).toBe("accepted");
    expect(historyState({ acceptedAt: null, revokedAt: "2026-11-11T10:00:00.000Z" })).toBe("revoked");
    expect(historyState({ acceptedAt: null, revokedAt: null })).toBe("expired");
  });
  test("a revoke names who did it and why", () => {
    const text = historyText({
      ...base,
      revokedAt: "2026-11-12T09:15:00.000Z",
      revokedByName: "Ada Admin",
      revokedWhy: "replaced by a new invitation",
    });
    expect(text).toMatch(/^Revoked by Ada Admin, /);
    expect(text).toContain("(replaced by a new invitation)");
    expect(historyText({ ...base, revokedAt: "2026-11-12T09:15:00.000Z" })).toMatch(/^Revoked, /);
    expect(historyText({ ...base, acceptedAt: "2026-11-11T10:00:00.000Z" })).toMatch(/^Accepted /);
    expect(historyText(base)).toMatch(/^Ran out /);
  });
});
