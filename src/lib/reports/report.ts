import { z } from "zod";
import type { EmailMessage } from "@/lib/email/transport";

// A problem report from the Quick Tools drawer (task 0099), as pure rules: what a report may contain, how it is cleaned, and the e-mail the developer gets. No database and no React here, so
// every rule is tested without either (tests/unit/problem-report.spec.ts).

export const REPORT_CATEGORIES = ["PROBLEM", "CONFUSING", "IDEA", "OTHER"] as const;
export type ReportCategoryName = (typeof REPORT_CATEGORIES)[number];
export const CATEGORY_LABELS: Record<ReportCategoryName, string> = {
  PROBLEM: "Something is not working",
  CONFUSING: "Something is confusing",
  IDEA: "An idea to make it better",
  OTHER: "Something else",
};

export const MESSAGE_MIN = 10;
export const MESSAGE_MAX = 2000;
/// Reports one person may send in five minutes (the sliding window of the rate limiter).
export const REPORTS_PER_WINDOW = 5;

/// What the browser sends. Who the person is, their roles and branches and their browser come from the server, never from this.
export const reportBody = z.strictObject({
  category: z.enum(REPORT_CATEGORIES),
  message: z
    .string()
    .trim()
    .min(MESSAGE_MIN, `Tell us a little more: at least ${MESSAGE_MIN} characters.`)
    .max(MESSAGE_MAX, `Please keep it to ${MESSAGE_MAX} characters.`),
  // The path only (the page they were on); a query string is dropped because it can hold a token or a name.
  pagePath: z
    .string()
    .max(300)
    .transform((value) => cleanPath(value)),
  viewport: z
    .string()
    .regex(/^\d{2,5}x\d{2,5}$/)
    .optional(),
});
export type ReportBody = z.infer<typeof reportBody>;

/// A page path with no query or fragment, no control characters, at most 200 characters; anything that is not a path becomes "/".
export function cleanPath(value: string): string {
  const path = stripControls(value).split(/[?#]/)[0].trim().slice(0, 200);
  return path.startsWith("/") ? path : "/";
}

/// Control characters (new lines included) removed: a value that goes into a mail subject or a one-line field can never add a header or a fake line.
export function stripControls(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s{2,}/g, " ");
}

/// The first line of the mail: "[Report] Something is not working: The Save button does not…" - the category and the start of the message, on one line, at most 90 characters.
export function reportSubject(category: ReportCategoryName, message: string): string {
  const head = stripControls(message).trim().slice(0, 60);
  const subject = `[Report] ${CATEGORY_LABELS[category]}: ${head}${stripControls(message).trim().length > 60 ? "…" : ""}`;
  return subject.slice(0, 90);
}

export type StoredReport = {
  id: string;
  category: ReportCategoryName;
  message: string;
  pagePath: string;
  userAgent: string | null;
  viewport: string | null;
  reporterName: string | null;
  reporterEmail: string | null;
  reporterRoles: string | null;
  branches: string | null;
  createdAt: Date;
};

/// The developer's address, read from DEVELOPER_EMAIL: null when it is unset or not an address (the report is still recorded, and the record says it was not mailed).
export function developerEmail(env: Record<string, string | undefined> = process.env): string | null {
  const value = env.DEVELOPER_EMAIL?.trim();
  return value && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(value) ? value : null;
}

/// The mail the developer gets: who, where, on what, and the message as the person wrote it. Plain text; the mail renderer escapes it when it draws the page.
export function reportEmail(to: string, report: StoredReport): EmailMessage {
  const lines = [
    `${CATEGORY_LABELS[report.category]}`,
    "",
    report.message,
    "",
    "-----",
    `From: ${stripControls(report.reporterName ?? "(no name)")} <${stripControls(report.reporterEmail ?? "no address")}>`,
    `Roles: ${stripControls(report.reporterRoles ?? "none")}`,
    `Branches: ${stripControls(report.branches ?? "none")}`,
    `Page: ${report.pagePath}`,
    `Screen: ${report.viewport ?? "unknown"}`,
    `Browser: ${stripControls(report.userAgent ?? "unknown")}`,
    `Sent: ${report.createdAt.toISOString()}`,
    `Reference: ${report.id}`,
  ];
  return { to, subject: reportSubject(report.category, report.message), text: lines.join("\n") };
}
