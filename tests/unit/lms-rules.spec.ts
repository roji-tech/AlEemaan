import { test, expect } from "@playwright/test";
import { SubmissionStatus } from "@prisma/client";
import {
  resolveSubmissionStatus,
  evaluateQuizAttempt,
  computePercentageScore,
} from "../../src/lib/lms/rules";

test.describe("Slice P5 — LMS & Assignment Rules", () => {
  test.describe("Submission Status Resolution", () => {
    test("marks as SUBMITTED when no due date is configured", () => {
      const res = resolveSubmissionStatus(null, true);
      expect(res.status).toBe(SubmissionStatus.SUBMITTED);
      expect(res.isLate).toBe(false);
      expect(res.isAllowed).toBe(true);
    });

    test("marks as SUBMITTED when submitted before due date", () => {
      const due = new Date(Date.now() + 1000 * 60 * 60); // 1 hour in future
      const res = resolveSubmissionStatus(due, true);
      expect(res.status).toBe(SubmissionStatus.SUBMITTED);
      expect(res.isLate).toBe(false);
      expect(res.isAllowed).toBe(true);
    });

    test("marks as LATE when submitted after due date and allowLate is true", () => {
      const due = new Date(Date.now() - 1000 * 60 * 60); // 1 hour in past
      const res = resolveSubmissionStatus(due, true);
      expect(res.status).toBe(SubmissionStatus.LATE);
      expect(res.isLate).toBe(true);
      expect(res.isAllowed).toBe(true);
    });

    test("disallows submission when submitted after due date and allowLate is false", () => {
      const due = new Date(Date.now() - 1000 * 60 * 60); // 1 hour in past
      const res = resolveSubmissionStatus(due, false);
      expect(res.status).toBe(SubmissionStatus.PENDING);
      expect(res.isLate).toBe(true);
      expect(res.isAllowed).toBe(false);
    });
  });

  test.describe("Quiz Attempt Evaluation", () => {
    const questions = [
      { id: "q1", correctAnswer: "B", points: 2 },
      { id: "q2", correctAnswer: "true", points: 1 },
      { id: "q3", correctAnswer: "Photosynthesis", points: 3 },
    ];

    test("calculates perfect score when all answers match case-insensitively", () => {
      const answers = [
        { questionId: "q1", answer: "b" },
        { questionId: "q2", answer: "TRUE" },
        { questionId: "q3", answer: "photosynthesis" },
      ];

      const res = evaluateQuizAttempt(questions, answers, 70);
      expect(res.totalPoints).toBe(6);
      expect(res.earnedPoints).toBe(6);
      expect(res.percentage).toBe(100);
      expect(res.isPassed).toBe(true);
    });

    test("calculates partial score accurately", () => {
      const answers = [
        { questionId: "q1", answer: "B" }, // 2 points
        { questionId: "q2", answer: "false" }, // 0 points
        { questionId: "q3", answer: "respiration" }, // 0 points
      ];

      const res = evaluateQuizAttempt(questions, answers, 50);
      expect(res.totalPoints).toBe(6);
      expect(res.earnedPoints).toBe(2);
      expect(res.percentage).toBe(33.3);
      expect(res.isPassed).toBe(false);
    });

    test("handles omitted or unanswered questions as 0 points", () => {
      const answers = [{ questionId: "q2", answer: "true" }]; // 1 point

      const res = evaluateQuizAttempt(questions, answers, 15);
      expect(res.totalPoints).toBe(6);
      expect(res.earnedPoints).toBe(1);
      expect(res.percentage).toBe(16.7);
      expect(res.isPassed).toBe(true);
    });
  });

  test.describe("Score Percentage Computation", () => {
    test("computes percentage score correctly", () => {
      expect(computePercentageScore(45, 50)).toBe(90);
      expect(computePercentageScore(20, 80)).toBe(25);
      expect(computePercentageScore(0, 100)).toBe(0);
      expect(computePercentageScore(50, 0)).toBe(0);
    });
  });
});
