import "../support/env";
import { test, expect } from "@playwright/test";
import { Role } from "@prisma/client";
import {
  mayAuthorIn,
  mayDecide,
  mayEditAsSubmitter,
  mayMakeGeneral,
  maySeeOverlap,
  maySetVisibility,
  maySubmit,
  pupilsMaySee,
  reviewPower,
  staffMaySee,
  type BankItemFacts,
  type BankViewer,
  type DecisionAction,
} from "@/lib/question-bank/rules";

// Who may do what with a question bank item. The rules are one pure module, so they are tested as tables and as properties over thousands of random people and items, with
// no database. What each rule is for is in the design note (sections 6 and 7) and the slice 2 rules (docs/tasks/0032, section 4b).

const NOW = new Date("2026-10-20T12:00:00Z");
const PAST = new Date("2026-10-01T00:00:00Z");
const FUTURE = new Date("2026-12-01T00:00:00Z");
const A = "branch-a";
const B = "branch-b";

const who = (over: Partial<BankViewer> = {}): BankViewer => ({
  userId: "viewer",
  isSuperAdmin: false,
  memberships: [],
  reviewerRows: [],
  teaches: [],
  ...over,
});
const thing = (over: Partial<BankItemFacts> = {}): BankItemFacts => ({
  branchId: A,
  subjectKey: "maths",
  status: "PENDING",
  visibility: "TEACHERS_ONLY",
  visibleFrom: null,
  submittedById: "someone-else",
  ...over,
});
const member = (role: Role, branchId = A) => ({ branchId, role });
const reviewer = (over: Partial<BankViewer["reviewerRows"][number]> = {}) => ({
  branchId: A as string | null,
  scope: "GENERAL" as "GENERAL" | "SUBJECT",
  subjectKey: null as string | null,
  isExamApprover: false,
  ...over,
});
const ALL_ACTIONS: DecisionAction[] = ["approve", "reject", "edit", "retire"];
const STATUSES = ["DRAFT", "PENDING", "APPROVED", "REJECTED", "RETIRED"] as const;

test.describe("review power: who can review an item at all", () => {
  test("a superadmin can, as an exam approver for every branch", () => {
    expect(reviewPower(who({ isSuperAdmin: true }), thing())).toEqual({ mayReview: true, examApprover: true, everyBranch: true });
    expect(reviewPower(who({ isSuperAdmin: true }), thing({ branchId: null }))).toEqual({
      mayReview: true,
      examApprover: true,
      everyBranch: true,
    });
  });

  test("a general reviewer of the branch can; a subject reviewer only for their subject; an exam approver flag is carried; every-branch only for a null-branch row", () => {
    const staff = [member(Role.TEACHING_STAFF)];
    expect(reviewPower(who({ memberships: staff, reviewerRows: [reviewer()] }), thing())).toEqual({
      mayReview: true,
      examApprover: false,
      everyBranch: false,
    });
    expect(reviewPower(who({ memberships: staff, reviewerRows: [reviewer({ isExamApprover: true })] }), thing()).examApprover).toBe(true);
    expect(
      reviewPower(who({ memberships: staff, reviewerRows: [reviewer({ scope: "SUBJECT", subjectKey: "maths" })] }), thing()).mayReview,
    ).toBe(true);
    expect(
      reviewPower(who({ memberships: staff, reviewerRows: [reviewer({ scope: "SUBJECT", subjectKey: "english" })] }), thing()).mayReview,
    ).toBe(false);
    // a subject reviewer does not cover a cross-subject item; a general reviewer does
    expect(
      reviewPower(
        who({ memberships: staff, reviewerRows: [reviewer({ scope: "SUBJECT", subjectKey: "maths" })] }),
        thing({ subjectKey: null }),
      ).mayReview,
    ).toBe(false);
    expect(reviewPower(who({ memberships: staff, reviewerRows: [reviewer()] }), thing({ subjectKey: null })).mayReview).toBe(true);
    const everyBranch = who({ memberships: staff, reviewerRows: [reviewer({ branchId: null })] });
    expect(reviewPower(everyBranch, thing({ branchId: B })).mayReview).toBe(true);
    expect(reviewPower(everyBranch, thing({ branchId: B })).everyBranch).toBe(true);
  });

  test("a reviewer of one branch has no power over another branch's item, or over a general item (a branch never overrides the school)", () => {
    const v = who({ memberships: [member(Role.TEACHING_STAFF)], reviewerRows: [reviewer({ isExamApprover: true })] });
    expect(reviewPower(v, thing({ branchId: B })).mayReview).toBe(false);
    expect(reviewPower(v, thing({ branchId: null })).mayReview).toBe(false);
  });

  test("a reviewer row counts only while its person is still active staff there: a deactivated membership, a pupil's membership or none at all voids it", () => {
    const row = reviewer({ isExamApprover: true });
    expect(reviewPower(who({ memberships: [], reviewerRows: [row] }), thing()).mayReview).toBe(false);
    expect(reviewPower(who({ memberships: [member(Role.STUDENT)], reviewerRows: [row] }), thing()).mayReview).toBe(false);
    expect(reviewPower(who({ memberships: [member(Role.PARENT)], reviewerRows: [row] }), thing()).mayReview).toBe(false);
    expect(reviewPower(who({ memberships: [member(Role.TEACHING_STAFF, B)], reviewerRows: [row] }), thing()).mayReview).toBe(false); // staff, but of another branch
    expect(reviewPower(who({ memberships: [member(Role.NON_TEACHING_STAFF)], reviewerRows: [row] }), thing()).mayReview).toBe(true);
    // an every-branch row needs active staff somewhere
    const wide = reviewer({ branchId: null });
    expect(reviewPower(who({ memberships: [], reviewerRows: [wide] }), thing()).mayReview).toBe(false);
    expect(reviewPower(who({ memberships: [member(Role.STUDENT)], reviewerRows: [wide] }), thing()).mayReview).toBe(false);
    expect(reviewPower(who({ memberships: [member(Role.NON_TEACHING_STAFF, B)], reviewerRows: [wide] }), thing()).mayReview).toBe(true);
  });

  test("the administrator of the item's branch can review (the 'override'), but is not an exam approver and cannot reach another branch or a general item", () => {
    const admin = who({ memberships: [member(Role.ADMIN)] });
    expect(reviewPower(admin, thing())).toEqual({ mayReview: true, examApprover: false, everyBranch: false });
    expect(reviewPower(admin, thing({ branchId: B })).mayReview).toBe(false);
    expect(reviewPower(admin, thing({ branchId: null })).mayReview).toBe(false);
    expect(reviewPower(who({ memberships: [member(Role.TEACHING_STAFF)] }), thing()).mayReview).toBe(false);
  });
});

test.describe("deciding", () => {
  const reviewerOfA = who({ memberships: [member(Role.TEACHING_STAFF)], reviewerRows: [reviewer({ isExamApprover: true })] });

  test("approve and reject need a PENDING item; edit and retire need an APPROVED one; no other status works", () => {
    for (const status of STATUSES) {
      for (const action of ALL_ACTIONS) {
        const needs = action === "approve" || action === "reject" ? "PENDING" : "APPROVED";
        const verdict = mayDecide(reviewerOfA, thing({ status }), action);
        expect(verdict.ok, `${action} on ${status}`).toBe(status === needs);
        if (!verdict.ok) expect(verdict.why).toBe("STATUS");
      }
    }
  });

  test("nobody decides their own submission except a superadmin, whatever their other authority, for every action", () => {
    const own = thing({ submittedById: "viewer" });
    for (const action of ALL_ACTIONS) {
      const status = action === "approve" || action === "reject" ? "PENDING" : "APPROVED";
      const item = { ...own, status } as BankItemFacts;
      const reviewerSelf = mayDecide(reviewerOfA, item, action);
      expect(reviewerSelf, action).toEqual({ ok: false, why: "SELF" });
      expect(mayDecide(who({ memberships: [member(Role.ADMIN)] }), item, action), `admin ${action}`).toEqual({ ok: false, why: "SELF" });
      expect(mayDecide(who({ isSuperAdmin: true }), item, action), `superadmin ${action}`).toEqual({ ok: true });
    }
  });

  test("a person with no authority gets 'SCOPE' whatever the status, so they learn nothing about the item", () => {
    for (const status of STATUSES) {
      expect(mayDecide(who(), thing({ status }), "approve")).toEqual({ ok: false, why: "SCOPE" });
      expect(mayDecide(who({ memberships: [member(Role.TEACHING_STAFF)] }), thing({ status, submittedById: "viewer" }), "retire")).toEqual({
        ok: false,
        why: "SCOPE",
      });
    }
  });

  test("visibility: an exam approver in scope, the branch's administrator and a superadmin set it; a plain reviewer, a teacher and the uploader do not", () => {
    const item = thing();
    expect(maySetVisibility(reviewerOfA, item)).toBe(true);
    expect(maySetVisibility(who({ memberships: [member(Role.ADMIN)] }), item)).toBe(true);
    expect(maySetVisibility(who({ isSuperAdmin: true }), item)).toBe(true);
    expect(maySetVisibility(who({ memberships: [member(Role.TEACHING_STAFF)], reviewerRows: [reviewer()] }), item)).toBe(false); // reviewer, not an approver
    expect(maySetVisibility(who({ memberships: [member(Role.TEACHING_STAFF)] }), item)).toBe(false);
    expect(maySetVisibility(who({ userId: "someone-else", memberships: [member(Role.TEACHING_STAFF)] }), item)).toBe(false); // the uploader
    expect(maySetVisibility(who({ memberships: [member(Role.ADMIN, B)] }), item)).toBe(false); // another branch's administrator
    expect(maySetVisibility(who({ memberships: [member(Role.ADMIN)] }), thing({ branchId: null }))).toBe(false);
    expect(
      maySetVisibility(
        who({ memberships: [member(Role.TEACHING_STAFF, B)], reviewerRows: [reviewer({ branchId: B, isExamApprover: true })] }),
        item,
      ),
    ).toBe(false);
  });

  test("overlap warnings: exam approvers in scope and superadmins only; not a reviewer, not an administrator, not the uploader", () => {
    const item = thing();
    expect(maySeeOverlap(reviewerOfA, item)).toBe(true);
    expect(maySeeOverlap(who({ isSuperAdmin: true }), item)).toBe(true);
    expect(maySeeOverlap(who({ memberships: [member(Role.TEACHING_STAFF)], reviewerRows: [reviewer()] }), item)).toBe(false);
    expect(maySeeOverlap(who({ memberships: [member(Role.ADMIN)] }), item)).toBe(false);
    expect(maySeeOverlap(who({ userId: "someone-else", memberships: [member(Role.ADMIN)], reviewerRows: [reviewer()] }), item)).toBe(false);
    expect(maySeeOverlap(reviewerOfA, thing({ branchId: B }))).toBe(false);
    expect(
      maySeeOverlap(
        who({
          memberships: [member(Role.TEACHING_STAFF)],
          reviewerRows: [reviewer({ isExamApprover: true, scope: "SUBJECT", subjectKey: "english" })],
        }),
        item,
      ),
    ).toBe(false);
  });

  test("making an item general needs an every-branch reviewer or a superadmin, not a branch reviewer or an administrator", () => {
    expect(mayMakeGeneral(who({ isSuperAdmin: true }), thing())).toBe(true);
    expect(mayMakeGeneral(who({ memberships: [member(Role.TEACHING_STAFF)], reviewerRows: [reviewer({ branchId: null })] }), thing())).toBe(
      true,
    );
    expect(mayMakeGeneral(reviewerOfA, thing())).toBe(false);
    expect(mayMakeGeneral(who({ memberships: [member(Role.ADMIN)] }), thing())).toBe(false);
  });
});

test.describe("authoring and editing one's own", () => {
  test("a superadmin, an administrator or teacher of the branch, and a reviewer who is staff there may write into it; nobody else", () => {
    expect(mayAuthorIn(who({ isSuperAdmin: true }), A)).toBe(true);
    expect(mayAuthorIn(who({ memberships: [member(Role.ADMIN)] }), A)).toBe(true);
    expect(mayAuthorIn(who({ memberships: [member(Role.TEACHING_STAFF)] }), A)).toBe(true);
    expect(mayAuthorIn(who({ memberships: [member(Role.NON_TEACHING_STAFF)], reviewerRows: [reviewer()] }), A)).toBe(true);
    expect(mayAuthorIn(who({ memberships: [member(Role.NON_TEACHING_STAFF)], reviewerRows: [reviewer({ branchId: null })] }), A)).toBe(
      true,
    );
    expect(mayAuthorIn(who({ memberships: [member(Role.NON_TEACHING_STAFF)] }), A)).toBe(false);
    expect(mayAuthorIn(who({ memberships: [member(Role.TEACHING_STAFF)] }), B)).toBe(false);
    expect(mayAuthorIn(who({ memberships: [member(Role.STUDENT)] }), A)).toBe(false);
    expect(mayAuthorIn(who({ memberships: [member(Role.PARENT)], reviewerRows: [reviewer()] }), A)).toBe(false);
    expect(mayAuthorIn(who(), A)).toBe(false);
    // a reviewer row for the branch does not carry across to a branch where the person is not staff
    expect(mayAuthorIn(who({ memberships: [member(Role.NON_TEACHING_STAFF, B)], reviewerRows: [reviewer({ branchId: null })] }), A)).toBe(
      false,
    );
  });

  test("the submitter edits a DRAFT, PENDING or REJECTED item and submits a DRAFT or REJECTED one; never an APPROVED or RETIRED item; others never", () => {
    const me = who();
    for (const status of STATUSES) {
      const own = { status, submittedById: "viewer" } as const;
      expect(mayEditAsSubmitter(me, own), `edit ${status}`).toBe(status === "DRAFT" || status === "PENDING" || status === "REJECTED");
      expect(maySubmit(me, own), `submit ${status}`).toBe(status === "DRAFT" || status === "REJECTED");
      expect(mayEditAsSubmitter(me, { status, submittedById: "other" })).toBe(false);
      expect(maySubmit(me, { status, submittedById: "other" })).toBe(false);
    }
    // not even a superadmin edits as a submitter what is not theirs (they act through the review routes)
    expect(mayEditAsSubmitter(who({ isSuperAdmin: true }), { status: "DRAFT", submittedById: "other" })).toBe(false);
  });
});

test.describe("seeing an item (staff)", () => {
  const teacher = (teaches: string[] = ["maths"], over: Partial<BankViewer> = {}) =>
    who({ memberships: [member(Role.TEACHING_STAFF)], teaches: teaches.map((subjectKey) => ({ branchId: A, subjectKey })), ...over });
  const approved = (over: Partial<BankItemFacts> = {}) => thing({ status: "APPROVED", ...over });

  test("a DRAFT is seen by its submitter and a superadmin, and by nobody else, whatever their authority", () => {
    const draft = thing({ status: "DRAFT" });
    expect(staffMaySee(who({ isSuperAdmin: true }), draft, NOW)).toBe(true);
    expect(staffMaySee(who({ userId: "someone-else" }), draft, NOW)).toBe(true);
    expect(
      staffMaySee(
        who({ memberships: [member(Role.ADMIN)], reviewerRows: [reviewer({ branchId: null, isExamApprover: true })] }),
        draft,
        NOW,
      ),
    ).toBe(false);
    expect(staffMaySee(teacher(), draft, NOW)).toBe(false);
  });

  test("the submitter sees their own item in every status; a reviewer or the branch administrator sees every status but DRAFT in their scope", () => {
    for (const status of STATUSES) {
      expect(staffMaySee(who({ userId: "someone-else" }), thing({ status }), NOW), `own ${status}`).toBe(true);
      const admin = who({ memberships: [member(Role.ADMIN)] });
      expect(staffMaySee(admin, thing({ status }), NOW), `admin ${status}`).toBe(status !== "DRAFT");
      expect(staffMaySee(admin, thing({ status, branchId: B }), NOW), `other branch ${status}`).toBe(false);
    }
  });

  test("an approved TEACHERS_ONLY item is seen by a teacher of that subject, not by a teacher of another subject, nor by non-teaching staff", () => {
    const item = approved();
    expect(staffMaySee(teacher(["maths"]), item, NOW)).toBe(true);
    expect(staffMaySee(teacher(["english"]), item, NOW)).toBe(false);
    expect(staffMaySee(teacher([]), item, NOW)).toBe(false); // a teacher with no assignment
    expect(staffMaySee(who({ memberships: [member(Role.NON_TEACHING_STAFF)] }), item, NOW)).toBe(false);
    // a subject taught in ANOTHER branch does not count for a branch item
    expect(
      staffMaySee(who({ memberships: [member(Role.TEACHING_STAFF)], teaches: [{ branchId: B, subjectKey: "maths" }] }), item, NOW),
    ).toBe(false);
    // an item with no subject is for any teacher of the branch
    expect(staffMaySee(teacher([]), approved({ subjectKey: null }), NOW)).toBe(true);
    expect(staffMaySee(teacher(["english"]), approved({ subjectKey: null }), NOW)).toBe(true);
  });

  test("TEACHERS_ONLY_UNTIL is secret until its date and then ordinary; PRACTICE is ordinary: any active staff of the branch sees an ordinary item", () => {
    const until = (visibleFrom: Date) => approved({ visibility: "TEACHERS_ONLY_UNTIL", visibleFrom });
    expect(staffMaySee(teacher(["english"]), until(FUTURE), NOW)).toBe(false);
    expect(staffMaySee(teacher(["maths"]), until(FUTURE), NOW)).toBe(true);
    expect(staffMaySee(teacher(["english"]), until(PAST), NOW)).toBe(true);
    expect(staffMaySee(who({ memberships: [member(Role.NON_TEACHING_STAFF)] }), until(PAST), NOW)).toBe(true);
    expect(staffMaySee(who({ memberships: [member(Role.NON_TEACHING_STAFF)] }), until(FUTURE), NOW)).toBe(false);
    expect(staffMaySee(teacher(["english"]), approved({ visibility: "PRACTICE" }), NOW)).toBe(true);
    expect(staffMaySee(who({ memberships: [member(Role.NON_TEACHING_STAFF)] }), approved({ visibility: "PRACTICE" }), NOW)).toBe(true);
    // an ordinary item is still only for the item's branch
    expect(staffMaySee(who({ memberships: [member(Role.TEACHING_STAFF, B)] }), approved({ visibility: "PRACTICE" }), NOW)).toBe(false);
    // not approved yet or no longer: not for general staff
    for (const status of ["PENDING", "REJECTED", "RETIRED"] as const)
      expect(staffMaySee(teacher(["maths"]), approved({ status, visibility: "PRACTICE" }), NOW), status).toBe(false);
  });

  test("a general item is for staff of every branch; its secret form needs a teacher of that subject in some branch, or an administrator of any branch", () => {
    const general = approved({ branchId: null, visibility: "TEACHERS_ONLY" });
    expect(
      staffMaySee(who({ memberships: [member(Role.TEACHING_STAFF, B)], teaches: [{ branchId: B, subjectKey: "maths" }] }), general, NOW),
    ).toBe(true);
    expect(
      staffMaySee(who({ memberships: [member(Role.TEACHING_STAFF, B)], teaches: [{ branchId: B, subjectKey: "english" }] }), general, NOW),
    ).toBe(false);
    expect(staffMaySee(who({ memberships: [member(Role.ADMIN, B)] }), general, NOW)).toBe(true);
    expect(staffMaySee(who({ memberships: [member(Role.NON_TEACHING_STAFF, B)] }), general, NOW)).toBe(false);
    expect(staffMaySee(who(), general, NOW)).toBe(false);
    expect(staffMaySee(who({ memberships: [member(Role.STUDENT, B)] }), approved({ branchId: null, visibility: "PRACTICE" }), NOW)).toBe(
      false,
    );
  });

  test("pupils' and parents' memberships give no access to anything, in any state", () => {
    const pupil = who({ memberships: [member(Role.STUDENT), member(Role.PARENT, B)] });
    for (const status of STATUSES)
      for (const visibility of ["PRACTICE", "TEACHERS_ONLY"] as const)
        for (const branchId of [A, B, null])
          expect(staffMaySee(pupil, thing({ status, visibility, branchId }), NOW), `${status} ${visibility} ${branchId}`).toBe(false);
  });

  test("pupilsMaySee: PRACTICE, or UNTIL once the date has passed (including the exact instant); never TEACHERS_ONLY or a missing date", () => {
    expect(pupilsMaySee({ visibility: "PRACTICE", visibleFrom: null }, NOW)).toBe(true);
    expect(pupilsMaySee({ visibility: "TEACHERS_ONLY", visibleFrom: null }, NOW)).toBe(false);
    expect(pupilsMaySee({ visibility: "TEACHERS_ONLY_UNTIL", visibleFrom: PAST }, NOW)).toBe(true);
    expect(pupilsMaySee({ visibility: "TEACHERS_ONLY_UNTIL", visibleFrom: NOW }, NOW)).toBe(true);
    expect(pupilsMaySee({ visibility: "TEACHERS_ONLY_UNTIL", visibleFrom: new Date(NOW.getTime() + 1) }, NOW)).toBe(false);
    expect(pupilsMaySee({ visibility: "TEACHERS_ONLY_UNTIL", visibleFrom: null }, NOW)).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Properties over random people and items. A seeded generator, so a failure names the same case on every run.

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const BRANCHES = [A, B, "branch-c"];
const SUBJECTS = ["maths", "english", "physics"];
const ROLES: Role[] = [Role.ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF, Role.STUDENT, Role.PARENT];
const pick = <T>(next: () => number, list: readonly T[]): T => list[Math.floor(next() * list.length)];

function randomViewer(next: () => number): BankViewer {
  const memberships: BankViewer["memberships"][number][] = [];
  for (const branchId of BRANCHES) if (next() < 0.5) memberships.push({ branchId, role: pick(next, ROLES) });
  const reviewerRows: BankViewer["reviewerRows"][number][] = [];
  for (let i = Math.floor(next() * 3); i > 0; i--) {
    const scope = next() < 0.5 ? "GENERAL" : "SUBJECT";
    reviewerRows.push({
      branchId: next() < 0.3 ? null : pick(next, BRANCHES),
      scope,
      subjectKey: scope === "SUBJECT" ? pick(next, SUBJECTS) : null,
      isExamApprover: next() < 0.5,
    });
  }
  const teaches: BankViewer["teaches"][number][] = [];
  for (let i = Math.floor(next() * 3); i > 0; i--) teaches.push({ branchId: pick(next, BRANCHES), subjectKey: pick(next, SUBJECTS) });
  return { userId: next() < 0.2 ? "viewer" : "other", isSuperAdmin: next() < 0.1, memberships, reviewerRows, teaches };
}
function randomItem(next: () => number): BankItemFacts {
  const visibility = pick(next, ["PRACTICE", "TEACHERS_ONLY", "TEACHERS_ONLY_UNTIL"] as const);
  return {
    branchId: next() < 0.2 ? null : pick(next, BRANCHES),
    subjectKey: next() < 0.2 ? null : pick(next, SUBJECTS),
    status: pick(next, STATUSES),
    visibility,
    visibleFrom: visibility === "TEACHERS_ONLY_UNTIL" ? (next() < 0.5 ? PAST : FUTURE) : null,
    submittedById: next() < 0.2 ? "viewer" : "someone-else",
  };
}

/// Every permission one person has over one item, as a comparable list of names.
function permissions(viewer: BankViewer, item: BankItemFacts): string[] {
  const out: string[] = [];
  const add = (name: string, yes: boolean) => yes && out.push(name);
  add("see", staffMaySee(viewer, item, NOW));
  for (const action of ALL_ACTIONS) add(`decide:${action}`, mayDecide(viewer, item, action).ok);
  add("review", reviewPower(viewer, item).mayReview);
  add("examApprover", reviewPower(viewer, item).examApprover);
  add("everyBranch", reviewPower(viewer, item).everyBranch);
  add("visibility", maySetVisibility(viewer, item));
  add("overlap", maySeeOverlap(viewer, item));
  add("general", mayMakeGeneral(viewer, item));
  add("author", item.branchId !== null && mayAuthorIn(viewer, item.branchId));
  add("editOwn", mayEditAsSubmitter(viewer, item));
  add("submit", maySubmit(viewer, item));
  return out;
}

test.describe("properties over random people and items", () => {
  const CASES = 6000;

  test("taking anything away from a person (a membership, a reviewer row, a subject) never gives them a permission they did not have", () => {
    const next = rng(20261020);
    const problems: string[] = [];
    for (let i = 0; i < CASES; i++) {
      const viewer = randomViewer(next);
      const item = randomItem(next);
      const before = new Set(permissions(viewer, item));
      const reduced: BankViewer[] = [
        ...viewer.memberships.map((_, k) => ({ ...viewer, memberships: viewer.memberships.filter((__, j) => j !== k) })),
        ...viewer.reviewerRows.map((_, k) => ({ ...viewer, reviewerRows: viewer.reviewerRows.filter((__, j) => j !== k) })),
        ...viewer.teaches.map((_, k) => ({ ...viewer, teaches: viewer.teaches.filter((__, j) => j !== k) })),
      ];
      if (viewer.isSuperAdmin) reduced.push({ ...viewer, isSuperAdmin: false });
      for (const smaller of reduced)
        for (const permission of permissions(smaller, item))
          if (!before.has(permission)) problems.push(`case ${i}: removing something gave "${permission}"`);
    }
    expect(problems.slice(0, 5)).toEqual([]);
  });

  test("a person with no staff membership, no reviewer row that counts and no superadmin flag can see and do nothing except with their own items", () => {
    const next = rng(7);
    const problems: string[] = [];
    for (let i = 0; i < CASES; i++) {
      const base = randomViewer(next);
      const viewer: BankViewer = {
        ...base,
        isSuperAdmin: false,
        memberships: base.memberships.map((m) => ({ ...m, role: next() < 0.5 ? Role.STUDENT : Role.PARENT })),
      };
      const item = randomItem(next);
      const own = item.submittedById === viewer.userId;
      for (const permission of permissions(viewer, item)) {
        const allowedOwn = own && (permission === "see" || permission === "editOwn" || permission === "submit");
        if (!allowedOwn) problems.push(`case ${i}: a pupil/parent-only viewer got "${permission}"`);
      }
    }
    expect(problems.slice(0, 5)).toEqual([]);
  });

  test("a DRAFT is seen by nobody but its submitter and a superadmin; nobody but a superadmin decides their own submission; overlap implies review power", () => {
    const next = rng(99);
    const problems: string[] = [];
    for (let i = 0; i < CASES; i++) {
      const viewer = randomViewer(next);
      const item = randomItem(next);
      const own = item.submittedById === viewer.userId;
      if (item.status === "DRAFT" && staffMaySee(viewer, item, NOW) && !own && !viewer.isSuperAdmin)
        problems.push(`case ${i}: a draft was seen by a stranger`);
      for (const action of ALL_ACTIONS)
        if (own && !viewer.isSuperAdmin && mayDecide(viewer, item, action).ok)
          problems.push(`case ${i}: self-decision (${action}) allowed`);
      if (maySeeOverlap(viewer, item) && !reviewPower(viewer, item).mayReview) problems.push(`case ${i}: overlap without review power`);
      if (
        maySetVisibility(viewer, item) &&
        !viewer.isSuperAdmin &&
        !reviewPower(viewer, item).examApprover &&
        !(item.branchId && viewer.memberships.some((m) => m.branchId === item.branchId && m.role === Role.ADMIN))
      )
        problems.push(`case ${i}: visibility set without being an approver or the administrator`);
      if (mayMakeGeneral(viewer, item) && !viewer.isSuperAdmin && !viewer.reviewerRows.some((r) => r.branchId === null))
        problems.push(`case ${i}: made general without an every-branch row`);
    }
    expect(problems.slice(0, 5)).toEqual([]);
  });

  test("a reviewer row of one branch never gives power over another branch's item or a general item; a general item is reached only by an every-branch reviewer or a superadmin", () => {
    const next = rng(31337);
    const problems: string[] = [];
    for (let i = 0; i < CASES; i++) {
      const viewer = randomViewer(next);
      const item = randomItem(next);
      const power = reviewPower(viewer, item);
      if (!power.mayReview || viewer.isSuperAdmin) continue;
      const viaEveryBranchRow = viewer.reviewerRows.some((r) => r.branchId === null);
      const viaBranchRow = item.branchId !== null && viewer.reviewerRows.some((r) => r.branchId === item.branchId);
      const viaAdmin = item.branchId !== null && viewer.memberships.some((m) => m.branchId === item.branchId && m.role === Role.ADMIN);
      if (!viaEveryBranchRow && !viaBranchRow && !viaAdmin) problems.push(`case ${i}: review power from nowhere`);
      if (item.branchId === null && !viaEveryBranchRow) problems.push(`case ${i}: a branch person reached a general item`);
    }
    expect(problems.slice(0, 5)).toEqual([]);
  });

  test("the rules never throw for any combination, including a person with duplicated rows", () => {
    const next = rng(5);
    for (let i = 0; i < CASES; i++) {
      const viewer = randomViewer(next);
      const doubled: BankViewer = {
        ...viewer,
        memberships: [...viewer.memberships, ...viewer.memberships],
        reviewerRows: [...viewer.reviewerRows, ...viewer.reviewerRows],
      };
      const item = randomItem(next);
      expect(permissions(doubled, item)).toEqual(permissions(viewer, item));
    }
  });
});
