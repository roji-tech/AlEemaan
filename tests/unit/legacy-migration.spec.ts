import "../support/env";
import { test, expect } from "@playwright/test";
import {
  splitFullName,
  normalizeGender,
  normalizeClassName,
  computeClassSortOrder,
  normalizeSubjectName,
  generateSubjectCode,
  normalizeSessionLabel,
  normalizeTerm,
  buildSessionRecord,
  determineGrade,
  mapLegacyStudent,
  mapLegacyResult,
  mapLegacyDataset,
  parseFirestoreTimestamp,
  type LegacyStudentDoc,
  type LegacyResultDoc,
} from "@/lib/migration/legacy-mapper";
import { Gender, EnrollmentStatus, ResultStatus, SessionStatus } from "@prisma/client";

test.describe("splitFullName", () => {
  test("handles 1-part, 2-part, and 3+-part names cleanly", () => {
    expect(splitFullName("Fatima")).toEqual({ firstName: "Fatima", middleName: null, lastName: "Fatima" });
    expect(splitFullName("Ahmad Bello")).toEqual({ firstName: "Ahmad", middleName: null, lastName: "Bello" });
    expect(splitFullName("Muhammad Aminu Kano")).toEqual({
      firstName: "Muhammad",
      middleName: "Aminu",
      lastName: "Kano",
    });
    expect(splitFullName("  Aisha   Bukar   Abba  Gana  ")).toEqual({
      firstName: "Aisha",
      middleName: "Bukar Abba",
      lastName: "Gana",
    });
    expect(splitFullName("")).toEqual({ firstName: "Unknown", middleName: null, lastName: "Student" });
  });
});

test.describe("normalizeGender", () => {
  test("normalizes female and male variations", () => {
    expect(normalizeGender("Male")).toBe(Gender.MALE);
    expect(normalizeGender("male")).toBe(Gender.MALE);
    expect(normalizeGender("M")).toBe(Gender.MALE);
    expect(normalizeGender("boy")).toBe(Gender.MALE);

    expect(normalizeGender("Female")).toBe(Gender.FEMALE);
    expect(normalizeGender("female")).toBe(Gender.FEMALE);
    expect(normalizeGender("F")).toBe(Gender.FEMALE);
    expect(normalizeGender("girl")).toBe(Gender.FEMALE);

    expect(normalizeGender("")).toBe(Gender.MALE);
    expect(normalizeGender(undefined)).toBe(Gender.MALE);
  });
});

test.describe("normalizeClassName and computeClassSortOrder", () => {
  test("standardizes class names across formats", () => {
    expect(normalizeClassName("JSS1")).toBe("JSS 1");
    expect(normalizeClassName("jss 2")).toBe("JSS 2");
    expect(normalizeClassName("SS3")).toBe("SS 3");
    expect(normalizeClassName("ss-1")).toBe("SS 1");
    expect(normalizeClassName("Primary 3")).toBe("Primary 3");
    expect(normalizeClassName("Basic 5")).toBe("Primary 5");
    expect(normalizeClassName("Pry 2")).toBe("Primary 2");
    expect(normalizeClassName("Nursery 2")).toBe("Nursery 2");
    expect(normalizeClassName("KG 1")).toBe("KG 1");
    expect(normalizeClassName("Creche")).toBe("Creche");
  });

  test("computes progression sort orders", () => {
    expect(computeClassSortOrder("Creche")).toBe(1);
    expect(computeClassSortOrder("KG 1")).toBe(2);
    expect(computeClassSortOrder("Nursery 1")).toBe(4);
    expect(computeClassSortOrder("Primary 1")).toBe(11);
    expect(computeClassSortOrder("JSS 1")).toBe(21);
    expect(computeClassSortOrder("SS 1")).toBe(31);
    expect(computeClassSortOrder("SS 3")).toBe(33);
  });
});

test.describe("normalizeSubjectName and generateSubjectCode", () => {
  test("normalizes subject names and aliases", () => {
    expect(normalizeSubjectName("maths")).toBe("Mathematics");
    expect(normalizeSubjectName("english")).toBe("English Language");
    expect(normalizeSubjectName("basic sci")).toBe("Basic Science");
    expect(normalizeSubjectName("civic ed")).toBe("Civic Education");
    expect(normalizeSubjectName("irs")).toBe("Islamic Studies");
    expect(normalizeSubjectName("further maths")).toBe("Further Mathematics");
  });

  test("generates uppercase codes", () => {
    expect(generateSubjectCode("Mathematics")).toBe("MATH");
    expect(generateSubjectCode("English Language")).toBe("ENLA");
    expect(generateSubjectCode("Basic Technology")).toBe("BATE");
    expect(generateSubjectCode("Physical and Health Education")).toBe("PAHE");
  });
});

test.describe("normalizeSessionLabel and normalizeTerm", () => {
  test("handles session formats", () => {
    expect(normalizeSessionLabel("2024/2025")).toBe("2024/2025");
    expect(normalizeSessionLabel("2024-2025")).toBe("2024/2025");
    expect(normalizeSessionLabel("2025")).toBe("2025/2026");
    expect(normalizeSessionLabel("")).toBe("2024/2025");
  });

  test("maps term variations to ordinals", () => {
    expect(normalizeTerm("First Term")).toEqual({ ordinal: 1, label: "1st Term" });
    expect(normalizeTerm("1st Term")).toEqual({ ordinal: 1, label: "1st Term" });
    expect(normalizeTerm("Second")).toEqual({ ordinal: 2, label: "2nd Term" });
    expect(normalizeTerm("2nd Term")).toEqual({ ordinal: 2, label: "2nd Term" });
    expect(normalizeTerm("Third Term")).toEqual({ ordinal: 3, label: "3rd Term" });
    expect(normalizeTerm("3")).toEqual({ ordinal: 3, label: "3rd Term" });
  });

  test("builds full session record with 3 terms", () => {
    const s = buildSessionRecord("2024/2025", true);
    expect(s.label).toBe("2024/2025");
    expect(s.status).toBe(SessionStatus.ACTIVE);
    expect(s.periods).toHaveLength(3);
    expect(s.periods[0].label).toBe("1st Term");
    expect(s.periods[1].label).toBe("2nd Term");
    expect(s.periods[2].label).toBe("3rd Term");
  });
});

test.describe("determineGrade", () => {
  test("assigns WAEC grades according to scores", () => {
    expect(determineGrade(85)).toEqual({ gradeLetter: "A1", gradeRemark: "Excellent" });
    expect(determineGrade(72)).toEqual({ gradeLetter: "B2", gradeRemark: "Very good" });
    expect(determineGrade(68)).toEqual({ gradeLetter: "B3", gradeRemark: "Good" });
    expect(determineGrade(62)).toEqual({ gradeLetter: "C4", gradeRemark: "Credit" });
    expect(determineGrade(58)).toEqual({ gradeLetter: "C5", gradeRemark: "Credit" });
    expect(determineGrade(52)).toEqual({ gradeLetter: "C6", gradeRemark: "Credit" });
    expect(determineGrade(48)).toEqual({ gradeLetter: "D7", gradeRemark: "Pass" });
    expect(determineGrade(42)).toEqual({ gradeLetter: "E8", gradeRemark: "Pass" });
    expect(determineGrade(35)).toEqual({ gradeLetter: "F9", gradeRemark: "Fail" });
  });

  test("honors legacy grade if it matches WAEC", () => {
    expect(determineGrade(74, "B2", "Custom Remark")).toEqual({ gradeLetter: "B2", gradeRemark: "Custom Remark" });
  });
});

test.describe("parseFirestoreTimestamp", () => {
  test("parses objects with toDate, seconds, or numbers", () => {
    const now = new Date();
    expect(parseFirestoreTimestamp(now)).toEqual(now);
    expect(parseFirestoreTimestamp(now.getTime()).getTime()).toEqual(now.getTime());
    expect(parseFirestoreTimestamp({ _seconds: 1700000000 }).getTime()).toBe(1700000000 * 1000);
    expect(parseFirestoreTimestamp({ toDate: () => now })).toEqual(now);
  });
});

test.describe("mapLegacyStudent and mapLegacyResult", () => {
  test("maps secondary student doc with promotion history", () => {
    const doc: LegacyStudentDoc = {
      uid: "firebase-uid-123",
      name: "Ibrahim Musa",
      email: "ibrahim@example.com",
      class: "JSS 2",
      gender: "Male",
      hasPaid: true,
      promotionHistory: [{ from: "JSS 1", to: "JSS 2", session: "2023/2024" }],
    };

    const { student, enrollment } = mapLegacyStudent(doc, "Secondary (English)");
    expect(student.admissionNo).toBe("firebase-uid-123");
    expect(student.firstName).toBe("Ibrahim");
    expect(student.lastName).toBe("Musa");
    expect(student.gender).toBe(Gender.MALE);
    expect(student.guardianEmail).toBe("ibrahim@example.com");
    expect(student.hasPaid).toBe(true);

    expect(enrollment).not.toBeNull();
    expect(enrollment?.className).toBe("JSS 2");
    expect(enrollment?.sessionLabel).toBe("2023/2024");
    expect(enrollment?.status).toBe(EnrollmentStatus.ACTIVE);
  });

  test("maps legacy result doc with tests array and remarks", () => {
    const rDoc: LegacyResultDoc = {
      studentNumber: "firebase-uid-123",
      studentName: "Ibrahim Musa",
      class: "JSS 2",
      session: "2023/2024",
      term: "Second Term",
      subjects: [
        {
          name: "Mathematics",
          tests: [
            { name: "CA 1", score: 10, max: 10 },
            { name: "CA 2", score: 12, max: 20 },
          ],
          exam: 55,
        },
      ],
      teacherRemark: "Hardworking student",
      principalRemark: "Keep it up",
    };

    const { results, remark } = mapLegacyResult(rDoc, "Secondary (English)");
    expect(results).toHaveLength(1);
    expect(results[0].subjectName).toBe("Mathematics");
    expect(results[0].caTotal).toBe(22);
    expect(results[0].examScore).toBe(55);
    expect(results[0].total).toBe(77);
    expect(results[0].gradeLetter).toBe("A1");
    expect(results[0].termOrdinal).toBe(2);
    expect(results[0].status).toBe(ResultStatus.PUBLISHED);

    expect(remark).not.toBeNull();
    expect(remark?.teacherRemark).toBe("Hardworking student");
    expect(remark?.principalRemark).toBe("Keep it up");
  });
});

test.describe("mapLegacyDataset", () => {
  test("generates reconciliation summary with deduplication", () => {
    const students: LegacyStudentDoc[] = [
      { uid: "uid-1", name: "Zainab Bello", class: "Primary 1", gender: "Female" },
      { uid: "uid-2", name: "Usman Danfodio", class: "Primary 2", gender: "Male" },
      { uid: "uid-1", name: "Duplicate Zainab", class: "Primary 1", gender: "Female" }, // duplicate UID
    ];

    const results: LegacyResultDoc[] = [
      {
        studentNumber: "uid-1",
        class: "Primary 1",
        session: "2024/2025",
        term: "1st Term",
        subjects: [{ name: "English Language", caTotal: 30, exam: 50 }],
      },
    ];

    const mapped = mapLegacyDataset({
      branchName: "Primary (English)",
      students,
      results,
    });

    expect(mapped.summary.totalLegacyStudents).toBe(3);
    expect(mapped.summary.mappedStudents).toBe(2);
    expect(mapped.summary.duplicateStudentsSkipped).toBe(1);
    expect(mapped.summary.mappedResults).toBe(1);
    expect(mapped.summary.classesIdentified).toContain("Primary 1");
    expect(mapped.summary.classesIdentified).toContain("Primary 2");
    expect(mapped.summary.subjectsIdentified).toContain("English Language");
    expect(mapped.summary.sessionsIdentified).toContain("2024/2025");
  });
});
