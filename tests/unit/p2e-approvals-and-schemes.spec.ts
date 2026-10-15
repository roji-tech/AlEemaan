import { test, expect } from "@playwright/test";
import { validateHierarchicalScheme } from "@/lib/settings/approvals";
import { PART_NAME_MAX } from "@/lib/academics/scoring";

test.describe("validateHierarchicalScheme - 100-point total & part constraints", () => {
  test("valid 60 exam + 40 CA (single CA part with default name 'CA')", () => {
    const res = validateHierarchicalScheme({
      examMax: 60,
      caParts: [{ maxScore: 40 }],
    });
    expect(res.valid).toBe(true);
    expect(res.normalizedComponents).toEqual([{ name: "CA", maxScore: 40, sortOrder: 1 }]);
  });

  test("valid 60 exam + 20 CA + 20 Project (default names 'CA' and 'Project')", () => {
    const res = validateHierarchicalScheme({
      examMax: 60,
      caParts: [{ maxScore: 20 }, { maxScore: 20 }],
    });
    expect(res.valid).toBe(true);
    expect(res.normalizedComponents).toEqual([
      { name: "CA", maxScore: 20, sortOrder: 1 },
      { name: "Project", maxScore: 20, sortOrder: 2 },
    ]);
  });

  test("valid multi-part CA with custom names", () => {
    const res = validateHierarchicalScheme({
      examMax: 50,
      caParts: [
        { name: "Mid-Term Test", maxScore: 20 },
        { name: "Practical Assignment", maxScore: 20 },
        { name: "Attendance & Conduct", maxScore: 10 },
      ],
    });
    expect(res.valid).toBe(true);
    expect(res.normalizedComponents).toEqual([
      { name: "Mid-Term Test", maxScore: 20, sortOrder: 1 },
      { name: "Practical Assignment", maxScore: 20, sortOrder: 2 },
      { name: "Attendance & Conduct", maxScore: 10, sortOrder: 3 },
    ]);
  });

  test("refuses scheme when sum is less than 100 (e.g. 60 + 30 = 90)", () => {
    const res = validateHierarchicalScheme({
      examMax: 60,
      caParts: [{ maxScore: 30 }],
    });
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/must sum to exactly 100\.00.*90\.00/i);
  });

  test("refuses scheme when sum is greater than 100 (e.g. 70 + 40 = 110)", () => {
    const res = validateHierarchicalScheme({
      examMax: 70,
      caParts: [{ maxScore: 40 }],
    });
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/must sum to exactly 100\.00.*110\.00/i);
  });

  test("refuses scheme with no CA parts (exam alone)", () => {
    const res = validateHierarchicalScheme({
      examMax: 100,
      caParts: [],
    });
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/must have at least one continuous assessment/i);
  });

  test("refuses non-positive exam maximum (0 or negative)", () => {
    const zeroExam = validateHierarchicalScheme({
      examMax: 0,
      caParts: [{ maxScore: 100 }],
    });
    expect(zeroExam.valid).toBe(false);
    expect(zeroExam.error).toMatch(/Exam maximum score must be a positive number/i);

    const negExam = validateHierarchicalScheme({
      examMax: -10,
      caParts: [{ maxScore: 110 }],
    });
    expect(negExam.valid).toBe(false);
    expect(negExam.error).toMatch(/Exam maximum score must be a positive number/i);
  });

  test("refuses non-positive CA part score", () => {
    const res = validateHierarchicalScheme({
      examMax: 100,
      caParts: [{ maxScore: 0 }],
    });
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/CA part 1 maximum score must be a positive number/i);
  });

  test("refuses duplicate part names (case-insensitive) or 'Exam'", () => {
    const duplicate = validateHierarchicalScheme({
      examMax: 60,
      caParts: [
        { name: "Test", maxScore: 20 },
        { name: "test", maxScore: 20 },
      ],
    });
    expect(duplicate.valid).toBe(false);
    expect(duplicate.error).toMatch(/Duplicate part name/i);

    const namedExam = validateHierarchicalScheme({
      examMax: 60,
      caParts: [{ name: "Exam", maxScore: 40 }],
    });
    expect(namedExam.valid).toBe(false);
    expect(namedExam.error).toMatch(/Duplicate part name "Exam"/i);
  });

  test("refuses part names longer than 64 characters", () => {
    const longName = "A".repeat(PART_NAME_MAX + 1);
    const res = validateHierarchicalScheme({
      examMax: 60,
      caParts: [{ name: longName, maxScore: 40 }],
    });
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/exceeds maximum length of 64 characters/i);
  });
});
