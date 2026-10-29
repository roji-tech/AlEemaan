import "../support/env";
import { test, expect } from "@playwright/test";
import { Role } from "@prisma/client";
import { mayAccessForm, type FormAccess } from "@/lib/forms/access";
import { isFullMarks } from "@/lib/forms/manual-marking";
import { withoutAnswerKey } from "@/lib/forms/practice-sets";

// Who reaches a form by its id inside a branch (view, read, manage), as a table over the pure rule with no database. The routes and services ask this one function;
// forms-authority.spec.ts holds the same rule over HTTP. What the gate of the route has already decided (which branch, which roles) is an input here, not part of the rule.

type Row = [string, Parameters<typeof mayAccessForm>[0], Record<FormAccess, boolean>];
const creator = "creator";
const form = { createdById: creator };
const staff = (userId: string, role: Role | null, administers = false) => ({ userId, role, administers, ...form });

const yes = { view: true, read: true, manage: true };
const viewOnly = { view: true, read: false, manage: false };
const no = { view: false, read: false, manage: false };

const TABLE: Row[] = [
  ["the creator, a teacher of the branch", staff(creator, Role.TEACHING_STAFF), yes],
  ["a colleague, a teacher of the branch", staff("colleague", Role.TEACHING_STAFF), viewOnly],
  ["non-teaching staff of the branch", staff("clerk", Role.NON_TEACHING_STAFF), viewOnly],
  ["non-teaching staff who is named as the creator (their role changed since)", staff(creator, Role.NON_TEACHING_STAFF), viewOnly],
  ["an administrator of the branch", staff("admin", Role.ADMIN, true), yes],
  ["a superadmin", staff("super", Role.ADMIN, true), yes],
  ["an ADMIN membership that is not an administrator of this branch", staff("admin-elsewhere", Role.ADMIN, false), viewOnly],
  ["a person with no staff role in the branch", staff("outsider", null), no],
  ["the creator, who no longer holds a staff role in the branch", staff(creator, null), no],
];

test.describe("mayAccessForm: view, read, manage", () => {
  for (const [name, viewer, expected] of TABLE) {
    test(name, () => {
      for (const access of ["view", "read", "manage"] as const) expect(mayAccessForm(viewer, access), access).toBe(expected[access]);
    });
  }

  test("manage implies read, and read implies view, for every row of the table", () => {
    for (const [, viewer] of TABLE) {
      if (mayAccessForm(viewer, "manage")) expect(mayAccessForm(viewer, "read")).toBe(true);
      if (mayAccessForm(viewer, "read")) expect(mayAccessForm(viewer, "view")).toBe(true);
    }
  });
});

test.describe("isFullMarks: an answer is correct only for full marks", () => {
  test("table", () => {
    expect(isFullMarks(10, 10)).toBe(true);
    expect(isFullMarks(9.5, 10)).toBe(false);
    expect(isFullMarks(1, 10)).toBe(false);
    expect(isFullMarks(0, 10)).toBe(false);
    expect(isFullMarks(5, 5)).toBe(true);
  });
  test("a question worth nothing has no full marks to give", () => {
    expect(isFullMarks(0, 0)).toBe(false);
  });
});

test.describe("withoutAnswerKey: what staff who may view a form but not manage it get", () => {
  const question = {
    id: "q1",
    prompt: "Which island grows cloves?",
    questionType: "SHORT",
    options: [{ id: "a", text: "Unguja" }],
    points: 2,
    sortOrder: 1,
    correctAnswer: "Pemba",
    explanation: "Because of the soil.",
  };

  test("drops the correct answer and the explanation and nothing else", () => {
    const clean = withoutAnswerKey(question);
    expect(clean).not.toHaveProperty("correctAnswer");
    expect(clean).not.toHaveProperty("explanation");
    expect(clean).toEqual({ id: "q1", prompt: question.prompt, questionType: "SHORT", options: question.options, points: 2, sortOrder: 1 });
    expect(JSON.stringify(clean)).not.toContain("Pemba");
  });

  test("does not change the question it is given, and copes with a question that has no key", () => {
    withoutAnswerKey(question);
    expect(question.correctAnswer).toBe("Pemba");
    expect(withoutAnswerKey({ id: "q2", prompt: "Open", correctAnswer: null, explanation: null })).toEqual({ id: "q2", prompt: "Open" });
  });
});
