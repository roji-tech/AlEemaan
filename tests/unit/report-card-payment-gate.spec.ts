import { test, expect } from "@playwright/test";
import { generateReportCardHtml } from "../../src/lib/academics/report-card-export";
import type { Card } from "../../src/components/results/ReportCard";

test.describe("generateReportCardHtml", () => {
  const mockCard: Card = {
    school: {
      name: "Al-Eemaan Model Academy",
      principal: "Dr. A. Rahman",
      motto: "Knowledge & Piety",
      address: "12 Education Way, Kaduna",
      phone: "+234 800 000 0000",
    },
    branch: { id: "br-1", name: "Main Campus" },
    student: {
      id: "std-1",
      name: "Zainab Abdullahi",
      admissionNo: "ADM/2026/042",
      gender: "FEMALE",
    },
    class: { group: "JSS 2", arm: "A" },
    period: { id: "prd-1", label: "First Term", session: "2026/2027" },
    subjects: [
      {
        subjectId: "sub-1",
        name: "Mathematics",
        caTotal: 28,
        exam: 54,
        total: 82,
        max: 100,
        percent: 82,
        gradeLetter: "A",
        gradeRemark: "Distinction",
        status: "PUBLISHED",
        verificationToken: "token_abc_123_456_7890",
      },
      {
        subjectId: "sub-2",
        name: "English Studies",
        caTotal: 25,
        exam: 45,
        total: 70,
        max: 100,
        percent: 70,
        gradeLetter: "B",
        gradeRemark: "Credit",
        status: "PUBLISHED",
        verificationToken: "token_def_456_789_0123",
      },
    ],
    summary: {
      subjectCount: 2,
      totalScore: 152,
      totalMax: 200,
      average: 76,
      position: 1,
      classSize: 30,
    },
    remarks: {
      teacher: "Excellent performance, keep it up.",
      principal: "Commendable achievement.",
    },
    legend: [
      { min: 75, max: 100, letter: "A", remark: "Distinction" },
      { min: 65, max: 74, letter: "B", remark: "Credit" },
    ],
    allPublished: true,
    preview: false,
  };

  test("produces standalone HTML document with A4 page rules and escaped entities", () => {
    const html = generateReportCardHtml(mockCard, "https://school.aleemaan.edu.ng");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("@page {");
    expect(html).toContain("size: A4 portrait");
    expect(html).toContain("Al-Eemaan Model Academy");
    expect(html).toContain("Zainab Abdullahi");
    expect(html).toContain("ADM/2026/042");
    expect(html).toContain("Mathematics");
    expect(html).toContain("English Studies");
    expect(html).toContain("1st");
    expect(html).toContain("of 30");
    expect(html).toContain("https://school.aleemaan.edu.ng/verify/token_abc_123_456_7890");
    expect(html).toContain("window.print()");
  });

  test("escapes malicious scripts in student name or subject name", () => {
    const maliciousCard: Card = {
      ...mockCard,
      student: {
        ...mockCard.student,
        name: "<script>alert('xss')</script> Fatima",
      },
      subjects: [
        {
          ...mockCard.subjects[0],
          name: "<img src=x onerror=alert(1)> Physics",
        },
      ],
    };
    const html = generateReportCardHtml(maliciousCard, "https://school.aleemaan.edu.ng");
    expect(html).not.toContain("<script>alert('xss')</script>");
    expect(html).toContain("&lt;script&gt;alert(&#039;xss&#039;)&lt;/script&gt;");
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });
});
