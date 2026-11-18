import { expect, test } from "@playwright/test";
import {
  CATEGORY_LABELS,
  MESSAGE_MAX,
  cleanPath,
  developerEmail,
  reportBody,
  reportEmail,
  reportSubject,
  stripControls,
  type StoredReport,
} from "../../src/lib/reports/report";

// The problem report from Quick Tools (task 0099): what a report may contain, how it is cleaned, and the mail the developer gets.
const ok = { category: "PROBLEM", message: "The Save button does nothing on the fees page.", pagePath: "/finance", viewport: "1280x800" };

test.describe("what the browser may send", () => {
  test("a good report passes; the message is trimmed", () => {
    const parsed = reportBody.safeParse({ ...ok, message: "   The Save button does nothing.   " });
    expect(parsed.success && parsed.data.message).toBe("The Save button does nothing.");
  });

  test("a message of fewer than 10 or more than 2,000 characters, an unknown kind, or an unknown field is refused", () => {
    expect(reportBody.safeParse({ ...ok, message: "too short" }).success).toBe(false);
    expect(reportBody.safeParse({ ...ok, message: "x".repeat(MESSAGE_MAX + 1) }).success).toBe(false);
    expect(reportBody.safeParse({ ...ok, message: "x".repeat(MESSAGE_MAX) }).success).toBe(true);
    expect(reportBody.safeParse({ ...ok, category: "BUG" }).success).toBe(false);
    expect(reportBody.safeParse({ ...ok, userId: "someone-else" }).success).toBe(false); // who it is from is never taken from the body
    expect(reportBody.safeParse({ ...ok, reporterEmail: "a@b.co" }).success).toBe(false);
    expect(reportBody.safeParse({ ...ok, viewport: "wide" }).success).toBe(false);
  });

  test("the page is a path only: no query, no fragment, no control characters, never longer than 200; anything else is /", () => {
    expect(cleanPath("/reset?token=secret#x")).toBe("/reset");
    expect(cleanPath("/students/abc\n/evil")).toBe("/students/abc /evil");
    expect(cleanPath("javascript:alert(1)")).toBe("/");
    expect(cleanPath("")).toBe("/");
    expect(cleanPath("/" + "a".repeat(500)).length).toBe(200);
    const parsed = reportBody.parse({ ...ok, pagePath: "/finance?invoice=1" });
    expect(parsed.pagePath).toBe("/finance");
  });
});

test.describe("the mail", () => {
  const stored: StoredReport = {
    id: "ckreport0001",
    category: "CONFUSING",
    message: "I could not find where to add a fee.\nIt took me ten minutes.",
    pagePath: "/finance",
    userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
    viewport: "390x844",
    reporterName: "Amina Yusuf",
    reporterEmail: "amina@school.example",
    reporterRoles: "Administrator",
    branches: "Secondary (English)",
    createdAt: new Date("2026-11-18T18:00:00.000Z"),
  };

  test("the subject is one line: the kind and the start of the message, at most 90 characters", () => {
    const subject = reportSubject("PROBLEM", "Line one\r\nBcc: attacker@evil.example\nand more " + "x".repeat(200));
    expect(subject).not.toMatch(/[\r\n]/);
    expect(subject.length).toBeLessThanOrEqual(90);
    expect(subject.startsWith(`[Report] ${CATEGORY_LABELS.PROBLEM}: Line one`)).toBe(true);
    expect(reportSubject("IDEA", "Short idea here")).toBe("[Report] An idea to make it better: Short idea here");
  });

  test("the body says who, where, on what screen and browser, when, and the reference, after the message as written", () => {
    const mail = reportEmail("dev@example.com", stored);
    expect(mail.to).toBe("dev@example.com");
    expect(mail.text).toContain("I could not find where to add a fee.\nIt took me ten minutes.");
    for (const line of [
      "From: Amina Yusuf <amina@school.example>",
      "Roles: Administrator",
      "Branches: Secondary (English)",
      "Page: /finance",
      "Screen: 390x844",
      "Sent: 2026-11-18T18:00:00.000Z",
      "Reference: ckreport0001",
    ])
      expect(mail.text, line).toContain(line);
  });

  test("a name or address with a new line in it cannot add a line of its own", () => {
    const mail = reportEmail("dev@example.com", {
      ...stored,
      reporterName: "Evil\nReference: fake",
      reporterEmail: "x@y.zz\nPage: /admin",
    });
    expect(mail.text.split("\n").filter((l) => l.startsWith("Reference:"))).toEqual(["Reference: ckreport0001"]);
    expect(mail.text.split("\n").filter((l) => l.startsWith("Page:"))).toEqual(["Page: /finance"]);
    expect(stripControls("a\u0000b\u007fc\r\nd")).toBe("a b c d");
  });
});

test.describe("DEVELOPER_EMAIL", () => {
  test("an address is used; unset, empty or not an address means nobody is mailed", () => {
    expect(developerEmail({ DEVELOPER_EMAIL: " dev@example.com " })).toBe("dev@example.com");
    for (const value of [undefined, "", "   ", "not-an-address", "a b@c.de", "<x@y.zz>", "dev@example"])
      expect(developerEmail({ DEVELOPER_EMAIL: value }), String(value)).toBeNull();
  });
});
