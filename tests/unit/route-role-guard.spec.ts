import "../support/env";
import { test, expect } from "@playwright/test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Every API handler declares who may call it (plan "Guard design — every API handler declares who may call it", G1-G3).
// A handler passes when its own source contains `roles:`, or when it is on the allowlist below WITH a reason. A new handler without
// `roles:` fails until someone adds `roles:` or writes the reason down. Source-level on purpose: no server, no database.

const API_ROOT = join(process.cwd(), "src", "app", "api");
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

const PUBLIC = "public by design (no session exists yet, or it must work signed out)";
const OWN = "acts on the caller's own account only";
const CONTENT = "school profile / session dates: content a parent or student legitimately needs";

/// "METHOD path-under-api" -> why it has no `roles:`.
const ALLOWED: Record<string, string> = {
  "POST v1/auth/login/route.ts": PUBLIC,
  "POST v1/auth/login/mfa/route.ts": PUBLIC,
  "POST v1/auth/logout/route.ts": PUBLIC,
  "POST v1/auth/forgot-password/route.ts": PUBLIC,
  "POST v1/auth/reset-password/route.ts": PUBLIC,
  "POST v1/auth/email-change/confirm/route.ts": PUBLIC,
  "POST v1/invitations/accept/route.ts": PUBLIC,
  "POST v1/invitations/preview/route.ts": PUBLIC,
  "GET v1/setup/route.ts": PUBLIC,
  "GET v1/verify/[token]/route.ts":
    "public by design: a parent or employer checks a printed code signed out; says nothing about marks, rate limited",
  "POST v1/setup/route.ts": PUBLIC,
  "GET v1/dev/email-inbox/route.ts": "dev-only inbox; public in source (whether it refuses in production is tracked separately)",
  "DELETE v1/dev/email-inbox/route.ts": "dev-only inbox; public in source (whether it refuses in production is tracked separately)",
  "GET v1/auth/me/route.ts": OWN,
  "GET v1/auth/sessions/route.ts": OWN,
  "POST v1/auth/sessions/revoke/route.ts": OWN,
  "POST v1/auth/sessions/revoke-others/route.ts": OWN,
  "POST v1/auth/change-password/route.ts": OWN,
  "POST v1/auth/email-change/request/route.ts": OWN,
  "DELETE v1/auth/email-change/request/route.ts": OWN,
  "POST v1/auth/mfa/enroll/route.ts": OWN,
  "POST v1/auth/mfa/confirm/route.ts": OWN,
  "POST v1/auth/mfa/disable/route.ts": OWN,
  "POST v1/auth/mfa/recovery-codes/route.ts": OWN,
  "PATCH v1/account/profile/route.ts": OWN,
  "PUT v1/account/branch/route.ts": OWN,
  "GET v1/settings/school/route.ts": CONTENT,
  "GET v1/academics/sessions/route.ts": CONTENT,
  "GET v1/academics/sessions/[id]/route.ts": CONTENT,
  "POST v1/webhooks/paystack/route.ts": "public by design: incoming webhook from Paystack payment gateway, verified via HMAC signature",
  "POST v1/portal/session/route.ts": "portal auth: login via magic token or admission number + secret",
  "GET v1/portal/session/route.ts": "portal auth: returns active session from verified cookie",
  "DELETE v1/portal/session/route.ts": "portal auth: clears portal session cookie",
  "GET v1/portal/students/[studentId]/overview/route.ts":
    "portal student overview: verified by HMAC portal session cookie and allowedStudentIds",
  "GET v1/portal/students/[studentId]/results/route.ts":
    "portal student results: verified by HMAC portal session cookie and allowedStudentIds",
  "GET v1/portal/students/[studentId]/progress/route.ts":
    "portal student progress records: verified by HMAC portal session cookie and allowedStudentIds, then the progress switches",
  "POST v1/portal/students/[studentId]/progress/seen/route.ts":
    "portal student progress 'seen': verified by HMAC portal session cookie and allowedStudentIds, then the progress switches",
  "GET v1/portal/students/[studentId]/invoices/route.ts":
    "portal student invoices: verified by HMAC portal session cookie and allowedStudentIds",
  "GET v1/portal/students/[studentId]/lms/route.ts": "portal student LMS: verified by HMAC portal session cookie and allowedStudentIds",
  "POST v1/portal/students/[studentId]/assignments/[assignmentId]/submission/route.ts":
    "portal hand-in: verified by HMAC portal session cookie and allowedStudentIds; the pupil's enrolment fixes the branch and class",
  "POST v1/portal/students/[studentId]/quizzes/[quizId]/attempt/route.ts":
    "portal quiz attempt: verified by HMAC portal session cookie and allowedStudentIds; the pupil's enrolment fixes the branch and class",
  "GET v1/portal/students/[studentId]/practice/options/route.ts":
    "portal practice: verified by HMAC portal session cookie and allowedStudentIds; gated by portalGate",
  "POST v1/portal/students/[studentId]/practice/sessions/route.ts":
    "portal practice: verified by HMAC portal session cookie and allowedStudentIds; gated by portalGate",
  "GET v1/portal/students/[studentId]/practice/sessions/[id]/route.ts":
    "portal practice: verified by HMAC portal session cookie and allowedStudentIds; gated by portalGate",
  "POST v1/portal/students/[studentId]/practice/sessions/[id]/answers/route.ts":
    "portal practice: verified by HMAC portal session cookie and allowedStudentIds; gated by portalGate",
  "POST v1/portal/students/[studentId]/practice/sessions/[id]/finish/route.ts":
    "portal practice: verified by HMAC portal session cookie and allowedStudentIds; gated by portalGate",
  "GET v1/portal/students/[studentId]/practice/history/route.ts":
    "portal practice: verified by HMAC portal session cookie and allowedStudentIds; gated by portalGate",
  "PATCH v1/portal/students/[studentId]/practice/history/[id]/route.ts":
    "portal practice: verified by HMAC portal session cookie and allowedStudentIds; gated by portalGate",
  "POST v1/portal/students/[studentId]/practice/reports/route.ts":
    "portal practice: verified by HMAC portal session cookie and allowedStudentIds; gated by portalGate",
  "GET v1/portal/students/[studentId]/practice/reports/route.ts":
    "portal practice: verified by HMAC portal session cookie and allowedStudentIds; gated by portalGate",
  "GET v1/portal/students/[studentId]/forms/practice-sets/route.ts":
    "portal practice sets: verified by HMAC portal session cookie and allowedStudentIds; gated by portalGate",
  "GET v1/portal/students/[studentId]/forms/practice-sets/[id]/route.ts":
    "portal practice sets: verified by HMAC portal session cookie and allowedStudentIds; gated by portalGate",
  "POST v1/portal/students/[studentId]/forms/practice-sets/[id]/start/route.ts":
    "portal practice sets: verified by HMAC portal session cookie and allowedStudentIds; gated by portalGate",
  "POST v1/portal/students/[studentId]/forms/practice-sets/[id]/submit/route.ts":
    "portal practice sets: verified by HMAC portal session cookie and allowedStudentIds; gated by portalGate",
  "GET v1/portal/students/[studentId]/forms/practice-sets/[id]/responses/[responseId]/route.ts":
    "portal practice sets: verified by HMAC portal session cookie and allowedStudentIds; gated by portalGate",
  "GET v1/forms/public/[token]/route.ts": "public questionnaire: unauthenticated access via public shareToken; rate limited",
  "POST v1/forms/public/[token]/submit/route.ts": "public questionnaire: unauthenticated submission via public shareToken; rate limited",
  "GET v1/portal/students/[studentId]/forms/questionnaires/route.ts":
    "portal questionnaires: verified by HMAC portal session cookie and allowedStudentIds; gated by portalGate",
  "GET v1/portal/students/[studentId]/forms/questionnaires/[id]/route.ts":
    "portal questionnaires: verified by HMAC portal session cookie and allowedStudentIds; gated by portalGate",
  "POST v1/portal/students/[studentId]/forms/questionnaires/[id]/submit/route.ts":
    "portal questionnaires: verified by HMAC portal session cookie and allowedStudentIds; gated by portalGate",
  "GET v1/portal/students/[studentId]/forms/paper-work/route.ts":
    "portal paper work: verified by HMAC portal session cookie and allowedStudentIds; gated by portalGate",
  "GET v1/portal/students/[studentId]/forms/paper-work/[id]/route.ts":
    "portal paper work: verified by HMAC portal session cookie and allowedStudentIds; gated by portalGate",
  "POST v1/portal/students/[studentId]/forms/paper-work/[id]/request-marking/route.ts":
    "portal paper work: verified by HMAC portal session cookie and allowedStudentIds; gated by portalGate",
  "GET v1/portal/students/[studentId]/question-bank/practice/[sessionId]/print/route.ts":
    "portal practice print: verified by HMAC portal session cookie and allowedStudentIds; gated by portalGate",
  "GET v1/portal/students/[studentId]/forms/practice-sets/[id]/responses/[responseId]/print/route.ts":
    "portal form response print: verified by HMAC portal session cookie and allowedStudentIds; gated by portalGate",
};

/// A handler declares who may call it with `roles:` or `superAdmin: true`.
const declares = (source: string) => source.includes("roles:") || source.includes("superAdmin: true");

/// Second assertion (plan S7): `roles:` means "a role somewhere", so a handler that acts on a BRANCH or on something that belongs to one must
/// also ask about THAT branch. A handler whose source names a branch (`branchId`) or a branch-owned entity must call one of these helpers,
/// or be listed in BRANCH_CHECKED_ELSEWHERE with the reason. Source-level, like the first: it finds a forgotten check, it does not prove a
/// right one (the API specs do that).
const BRANCH_HELPERS = [
  "resolveBranchRole",
  "branchIdsFor",
  "canAdminister",
  "adminScope",
  "scopeOrForbidden",
  "branchOutOfScope",
  "studentOutOfScope",
  "withBranch",
];
const NAMES_A_BRANCH = /branchId|studentId|students?\/\[id\]|membershipId/;

/// "METHOD path-under-api" -> why it needs no helper call in its own source.
const BRANCH_CHECKED_ELSEWHERE: Record<string, string> = {
  "GET v1/academics/promotion/batches/[id]/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "GET v1/academics/promotion/batches/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "POST v1/academics/promotion/execute/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "GET v1/academics/promotion/preview/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "POST v1/academics/promotion/preview/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "POST v1/academics/schemes/global/route.ts": "superadmin or admin approval workflow checks branch access",
  "GET v1/academics/schemes/teacher/[id]/route.ts": "scheme draft ownership and branch checked in draft query",
  "PATCH v1/academics/schemes/teacher/[id]/route.ts": "scheme draft ownership and branch checked in draft query",
  "GET v1/announcements/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "POST v1/announcements/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "POST v1/communication/broadcast/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "POST v1/communication/dispatches/[id]/retry/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "GET v1/communication/dispatches/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "GET v1/communication/queue/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "POST v1/communication/queue/next/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "GET v1/communication/templates/[id]/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "PATCH v1/communication/templates/[id]/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "DELETE v1/communication/templates/[id]/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "GET v1/communication/templates/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "POST v1/communication/templates/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "GET v1/lms/assignments/[id]/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "PATCH v1/lms/assignments/[id]/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "DELETE v1/lms/assignments/[id]/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "PATCH v1/lms/assignments/[id]/submissions/[subId]/grade/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "GET v1/lms/assignments/[id]/submissions/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "POST v1/lms/assignments/[id]/submissions/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "GET v1/lms/assignments/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "GET v1/lms/materials/[id]/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "PATCH v1/lms/materials/[id]/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "DELETE v1/lms/materials/[id]/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "GET v1/lms/materials/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "POST v1/lms/quizzes/[id]/attempt/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "GET v1/lms/quizzes/[id]/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "DELETE v1/lms/quizzes/[id]/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "PATCH v1/lms/quizzes/[id]/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "GET v1/lms/quizzes/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "GET v1/settings/enforcement/route.ts": "superadmin only (withAuth superAdmin): the switch is school-wide or per branch by definition",
  "PUT v1/settings/enforcement/route.ts": "superadmin only (withAuth superAdmin): the switch is school-wide or per branch by definition",
  "POST v1/subject-catalog/[id]/branches/route.ts":
    "superadmin only (withAuth superAdmin): a superadmin reaches every branch; each branch id in the body is checked to exist and is reported as gone when it does not",
  "POST v1/school-templates/[id]/branches/route.ts":
    "superadmin only (withAuth superAdmin): a superadmin reaches every branch; each branch id in the body is checked to exist and is reported as gone when it does not",
  "GET v1/settings/layouts/route.ts": "layout settings resolved by branchId query",
  "GET v1/settings/portal-access/route.ts":
    "superadmin only (withAuth superAdmin): a superadmin reaches every branch; the branch is checked to exist",
  "PATCH v1/settings/portal-access/route.ts":
    "superadmin only (withAuth superAdmin): a superadmin reaches every branch; the branch is checked to exist",
  "GET v1/settings/results-approval/route.ts":
    "superadmin only (withAuth superAdmin): a superadmin reaches every branch; the branch is checked to exist",
  "PUT v1/settings/results-approval/route.ts":
    "superadmin only (withAuth superAdmin): a superadmin reaches every branch; the branch is checked to exist",
  "POST v1/settings/results-approval/sections/route.ts":
    "superadmin only (withAuth superAdmin): a superadmin reaches every branch; the branch is checked to exist",
  "PUT v1/settings/results-approval/approvers/[userId]/scopes/route.ts":
    "superadmin only (withAuth superAdmin): a superadmin reaches every branch; the branch is checked to exist",
  "POST v1/settings/self-approval/route.ts": "self-approval configured per branch with admin role check",
  "DELETE v1/settings/self-approval/route.ts": "self-approval deleted per branch with admin role check",
  "GET v1/settings/verification/route.ts": "verification settings queried by branchId",
  "POST v1/setup/route.ts": "public first-run setup creates branch and administrator",
  "GET v1/question-bank/reviewers/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's; with none named, only a superadmin gets the school-wide answer (checked in the handler)",
  "POST v1/question-bank/reviewers/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's; with none named, only a superadmin gets the school-wide answer (checked in the handler)",
  "GET v1/question-bank/settings/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's; with none named, only a superadmin gets the school-wide answer (checked in the handler)",
  "PUT v1/question-bank/settings/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's; with none named, only a superadmin gets the school-wide answer (checked in the handler)",
  "GET v1/question-bank/items/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's; with none named, the list is the caller's own branches' (decided row by row by question-bank/rules staffMaySee)",
  "POST v1/question-bank/items/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the body must be the caller's",
  "POST v1/question-bank/items/offer-back/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the body must be the caller's",
  "GET v1/question-bank/items/[id]/route.ts":
    "no branch is named in the request: the branch is the ITEM's, and question-bank/rules (staffMaySee, with a viewer read inside the transaction) decides; a question the person may not see is the same 404 as one that does not exist",
  "GET v1/question-bank/review-queue/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's; with none named, the list is the caller's own branches' (decided row by row by question-bank/rules staffMaySee)",
  "GET v1/timetable/[id]/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "GET v1/timetable/route.ts": "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "POST v1/question-bank/items/[id]/report/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the body must be the caller's",
  "GET v1/question-bank/reports/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's; with none named, the list is the caller's own branches' (decided in reports-service)",
  "GET v1/forms/route.ts": "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "POST v1/forms/route.ts": "gated by withAuthGated (lib/auth/branch-gate): the branch named in the body must be the caller's",
  "GET v1/forms/[id]/route.ts": "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "PATCH v1/forms/[id]/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "POST v1/forms/[id]/close/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "GET v1/forms/[id]/responses/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "GET v1/forms/[id]/analytics/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "GET v1/forms/available/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "POST v1/forms/[id]/submit/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "GET v1/forms/[id]/turn-ins/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "PATCH v1/forms/[id]/turn-ins/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "POST v1/forms/[id]/turn-ins/sync/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "GET v1/forms/[id]/marking-queue/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "GET v1/forms/marking-queue/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "GET v1/forms/[id]/responses/[responseId]/marking/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "PATCH v1/forms/[id]/responses/[responseId]/marking/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "POST v1/question-bank/print/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the body must be the caller's",
  "GET v1/question-bank/print-logs/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query must be the caller's",
  "POST v1/forms/[id]/print/route.ts": "gated by withAuthGated (lib/auth/branch-gate): the branch named in the body must be the caller's",
  "GET v1/students/[id]/standing/route.ts":
    "the branch is the PUPIL's, never the request's: the service reads the pupil, then adminScope + mayAdminister decide (a super admin, or an administrator of that branch); an unknown pupil and another branch's pupil are the same 404",
  "GET v1/members/[id]/standing/route.ts":
    "the branch is the MEMBERSHIP's (or the staff record's), never the request's: the service reads it, then adminScope + mayAdminister decide (a super admin, or an administrator of that branch); an unknown member and another branch's member are the same 404",
  "POST v1/members/[id]/standing/route.ts":
    "the branch is the MEMBERSHIP's (or the staff record's), never the request's: the service reads it, then adminScope + mayAdminister decide (a super admin, or an administrator of that branch); an unknown member and another branch's member are the same 404",
  "POST v1/programs/[id]/branches/route.ts":
    "acts on a PROGRAM, not on a branch of the caller's: a super admin alone (change() at the super level in programs/service decides, inside the program's row lock); the branch is only the thing to link or unlink",
  "DELETE v1/programs/[id]/branches/[branchId]/route.ts":
    "acts on a PROGRAM, not on a branch of the caller's: a super admin alone (change() at the super level in programs/service decides, inside the program's row lock); the branch is only the thing to link or unlink",
  "GET v1/programs/[id]/people/route.ts":
    "the branch is the PROGRAM's and the PERSON's, never the request's: the service reads the viewer's place in the program (a super admin, a program admin, or an administrator of a branch it runs in), and a branch administrator is limited to the people through their own branches; a person or program outside that reach is the same 404 as one that does not exist",
  "GET v1/settings/programs/route.ts":
    "the match is the PATCH comment below it: this GET names no branch. The service lists only the branches the caller administers (a super admin: all), and says nothing about any other",
  "GET v1/settings/programs-attendance/route.ts":
    "the match is the PATCH comment below it: this GET names no branch. The service lists only the branches the caller administers (a super admin: all), and says nothing about any other",
  "GET v1/settings/programs-assessments/route.ts":
    "the match is the PATCH comment below it: this GET names no branch. The service lists only the branches the caller administers (a super admin: all), and says nothing about any other",
  "GET v1/settings/programs-fees/route.ts":
    "the match is the PATCH comment below it: this GET names no branch. The service lists only the branches the caller administers (a super admin: all), and says nothing about any other",
  "GET v1/settings/programs-progress/route.ts":
    "the match is the PATCH comment below it: this GET names no branch. The service lists only the branches the caller administers (a super admin: all), and says nothing about any other",
  "GET v1/settings/programs-progress-student/route.ts":
    "the match is the PATCH comment below it: this GET names no branch. The service lists only the branches the caller administers (a super admin: all), and says nothing about any other",
  "GET v1/settings/programs-progress-guardian/route.ts":
    "the match is the PATCH comment below it: this GET names no branch. The service lists only the branches the caller administers (a super admin: all), and says nothing about any other",
  "GET v1/settings/standing/route.ts":
    "the match is the PATCH comment below it: this GET names no branch. The service lists only the branches the caller administers (a super admin: all), and says nothing about any other",
  "GET v1/settings/part-payment/route.ts":
    "the match is the PATCH comment below it: this GET names no branch. The service lists only the branches the caller administers (a super admin: all), and says nothing about any other",
};

/// Third assertion (ADR 0015): a handler that names a branch is wrapped by `withBranch` - the structure that makes the branch check impossible to forget -
/// unless it is listed here with the reason. These are the routes that have NOT been moved over yet, or that act on no single branch. A NEW route cannot
/// join this list without someone writing why; the aim is for it to shrink.
const STRUCTURE = /withBranch[(<]/;
const NOT_WRAPPED: Record<string, string> = {
  "PUT v1/account/branch/route.ts":
    "the caller's own preference (which branch their pages open on), not an action on a branch: the handler stores it only for a branch the caller holds an active membership in (a superadmin: any) and answers 404 otherwise",
  "POST v1/subject-catalog/[id]/branches/route.ts":
    "superadmin only (withAuth superAdmin): acts on SEVERAL branches at once, each named in the body and checked to exist; no one branch to resolve a grant for",
  "POST v1/school-templates/[id]/branches/route.ts":
    "superadmin only (withAuth superAdmin): acts on SEVERAL branches at once, each named in the body and checked to exist; no one branch to resolve a grant for",
  "GET v1/portal/students/[studentId]/progress/route.ts":
    "portal route: no staff login; the branch comes from the pupil's place in the program, and the portal session limits which pupils",
  "POST v1/portal/students/[studentId]/progress/seen/route.ts":
    "portal route: no staff login; the branch comes from the pupil's place in the program, and the portal session limits which pupils",
  "POST v1/portal/students/[studentId]/assignments/[assignmentId]/submission/route.ts":
    "portal route: no staff login; the branch comes from the pupil's enrolment, and the portal session limits which pupils",
  "POST v1/portal/students/[studentId]/quizzes/[quizId]/attempt/route.ts":
    "portal route: no staff login; the branch comes from the pupil's enrolment, and the portal session limits which pupils",
  "POST v1/portal/students/[studentId]/practice/sessions/route.ts":
    "portal practice: no staff login; branch resolved via student record and portal session limits which pupils",
  "GET v1/portal/students/[studentId]/practice/sessions/[id]/route.ts":
    "portal practice: no staff login; branch resolved via student record and portal session limits which pupils",
  "POST v1/portal/students/[studentId]/practice/sessions/[id]/answers/route.ts":
    "portal practice: no staff login; branch resolved via student record and portal session limits which pupils",
  "POST v1/portal/students/[studentId]/practice/sessions/[id]/finish/route.ts":
    "portal practice: no staff login; branch resolved via student record and portal session limits which pupils",
  "PATCH v1/portal/students/[studentId]/practice/history/[id]/route.ts":
    "portal practice: no staff login; branch resolved via student record and portal session limits which pupils",
  "POST v1/portal/students/[studentId]/practice/reports/route.ts":
    "portal practice: no staff login; branch resolved via student record and portal session limits which pupils",
  "GET v1/portal/students/[studentId]/practice/reports/route.ts":
    "portal practice: no staff login; branch resolved via student record and portal session limits which pupils",
  "GET v1/portal/students/[studentId]/forms/practice-sets/route.ts":
    "portal practice sets: no staff login; branch resolved via student record and portal session limits which pupils",
  "GET v1/portal/students/[studentId]/forms/practice-sets/[id]/route.ts":
    "portal practice sets: no staff login; branch resolved via student record and portal session limits which pupils",
  "POST v1/portal/students/[studentId]/forms/practice-sets/[id]/start/route.ts":
    "portal practice sets: no staff login; branch resolved via student record and portal session limits which pupils",
  "POST v1/portal/students/[studentId]/forms/practice-sets/[id]/submit/route.ts":
    "portal practice sets: no staff login; branch resolved via student record and portal session limits which pupils",
  "GET v1/portal/students/[studentId]/forms/practice-sets/[id]/responses/[responseId]/route.ts":
    "portal practice sets: no staff login; branch resolved via student record and portal session limits which pupils",
  "GET v1/portal/students/[studentId]/forms/questionnaires/route.ts":
    "portal questionnaires: no staff login; branch resolved via student record and portal session limits which pupils",
  "GET v1/portal/students/[studentId]/forms/questionnaires/[id]/route.ts":
    "portal questionnaires: no staff login; branch resolved via student record and portal session limits which pupils",
  "POST v1/portal/students/[studentId]/forms/questionnaires/[id]/submit/route.ts":
    "portal questionnaires: no staff login; branch resolved via student record and portal session limits which pupils",
  "GET v1/portal/students/[studentId]/forms/paper-work/route.ts":
    "portal paper work: no staff login; branch resolved via student record and portal session limits which pupils",
  "GET v1/portal/students/[studentId]/forms/paper-work/[id]/route.ts":
    "portal paper work: no staff login; branch resolved via student record and portal session limits which pupils",
  "POST v1/portal/students/[studentId]/forms/paper-work/[id]/request-marking/route.ts":
    "portal paper work: no staff login; branch resolved via student record and portal session limits which pupils",
  "GET v1/portal/students/[studentId]/question-bank/practice/[sessionId]/print/route.ts":
    "portal practice print: no staff login; branch resolved via student record and portal session limits which pupils",
  "GET v1/portal/students/[studentId]/forms/practice-sets/[id]/responses/[responseId]/print/route.ts":
    "portal form response print: no staff login; branch resolved via student record and portal session limits which pupils",
  "GET v1/academics/sessions/route.ts": "a list narrowed to the caller's own branches (branchIdsFor); acts on no single branch",
  "GET v1/branches/route.ts": "lists the branches the caller can see (narrowed by branchIdsFor); acts on no single branch",
  "GET v1/settings/family-secrets/route.ts": "lists the branches the caller administers (narrowed by adminScope); acts on no single branch",
  "GET v1/students/route.ts": "a list narrowed to the caller's visible branches (branchIdsFor); acts on no single branch",
  "GET v1/students/[id]/route.ts":
    "reads one student through a visible-branches filter (another branch's student is the same 404); to move to staff-read",
  "POST v1/invitations/route.ts": "the branch is checked by lib/members/http (scopeOrForbidden); to move to administer",
  "POST v1/setup/route.ts": "public first-run setup: creates the first branch and administrator, there is no caller to ask",
  "GET v1/academics/promotion/batches/[id]/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "GET v1/academics/promotion/batches/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "POST v1/academics/promotion/execute/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "GET v1/academics/promotion/preview/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "POST v1/academics/promotion/preview/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "POST v1/academics/schemes/global/route.ts": "superadmin or admin approval workflow checks branch access",
  "GET v1/academics/schemes/teacher/[id]/route.ts": "scheme draft ownership and branch checked in draft query",
  "PATCH v1/academics/schemes/teacher/[id]/route.ts": "scheme draft ownership and branch checked in draft query",
  "GET v1/announcements/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "POST v1/announcements/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "POST v1/communication/broadcast/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "POST v1/communication/dispatches/[id]/retry/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "GET v1/communication/dispatches/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "GET v1/communication/queue/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "POST v1/communication/queue/next/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "GET v1/communication/templates/[id]/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "PATCH v1/communication/templates/[id]/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "DELETE v1/communication/templates/[id]/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "GET v1/communication/templates/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "POST v1/communication/templates/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "PATCH v1/finance/fee-structures/[id]/route.ts": "fee structure update verified against branch scope",
  "DELETE v1/finance/fee-structures/[id]/route.ts": "fee structure delete verified against branch scope",
  "GET v1/finance/fee-structures/route.ts": "fee structures query filtered by authorized branchId",
  "POST v1/finance/fee-structures/route.ts": "fee structure creation verified against branch scope",
  "POST v1/finance/invoices/[id]/discount/route.ts": "discount applied with branch billing check",
  "POST v1/finance/invoices/[id]/pay/route.ts": "invoice payment checked against branch invoice record",
  "POST v1/finance/invoices/[id]/record-payment/route.ts": "manual payment recorded with branch billing check",
  "GET v1/finance/invoices/[id]/route.ts": "invoice access verified against branch invoice record",
  "GET v1/finance/invoices/route.ts": "invoices list filtered by branchId and user role",
  "POST v1/finance/invoices/route.ts": "batch invoice generation checked against branch scope",
  "GET v1/lms/assignments/[id]/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "PATCH v1/lms/assignments/[id]/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "DELETE v1/lms/assignments/[id]/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "PATCH v1/lms/assignments/[id]/submissions/[subId]/grade/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "GET v1/lms/assignments/[id]/submissions/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "POST v1/lms/assignments/[id]/submissions/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "GET v1/lms/assignments/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "GET v1/lms/materials/[id]/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "PATCH v1/lms/materials/[id]/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "DELETE v1/lms/materials/[id]/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "GET v1/lms/materials/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "POST v1/lms/quizzes/[id]/attempt/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "GET v1/lms/quizzes/[id]/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "DELETE v1/lms/quizzes/[id]/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "PATCH v1/lms/quizzes/[id]/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "GET v1/lms/quizzes/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "GET v1/settings/approval/[id]/route.ts": "approval details retrieved with branch scope verification",
  "PATCH v1/settings/approval/[id]/route.ts": "approval decision verified against branch admin permissions",
  "GET v1/settings/enforcement/route.ts": "superadmin only (withAuth superAdmin): the switch is school-wide or per branch by definition",
  "PUT v1/settings/enforcement/route.ts": "superadmin only (withAuth superAdmin): the switch is school-wide or per branch by definition",
  "GET v1/settings/layouts/route.ts": "layout settings resolved by branchId query",
  "GET v1/settings/portal-access/route.ts":
    "superadmin only (withAuth superAdmin): a superadmin reaches every branch; the branch is checked to exist",
  "PATCH v1/settings/portal-access/route.ts":
    "superadmin only (withAuth superAdmin): a superadmin reaches every branch; the branch is checked to exist",
  "GET v1/settings/results-approval/route.ts":
    "superadmin only (withAuth superAdmin): a superadmin reaches every branch; the branch is checked to exist",
  "PUT v1/settings/results-approval/route.ts":
    "superadmin only (withAuth superAdmin): a superadmin reaches every branch; the branch is checked to exist",
  "POST v1/settings/results-approval/sections/route.ts":
    "superadmin only (withAuth superAdmin): a superadmin reaches every branch; the branch is checked to exist",
  "PUT v1/settings/results-approval/approvers/[userId]/scopes/route.ts":
    "superadmin only (withAuth superAdmin): a superadmin reaches every branch; the branch is checked to exist",
  "POST v1/settings/self-approval/route.ts": "self-approval configured per branch with admin role check",
  "DELETE v1/settings/self-approval/route.ts": "self-approval deleted per branch with admin role check",
  "GET v1/settings/verification/route.ts": "verification settings queried by branchId",
  "PATCH v1/settings/verification/route.ts":
    "a superadmin acts school-wide or on any branch; an administrator only on a branch they administer, checked inline with canAdminister (the branchId is nullable, which withBranch does not model)",
  "GET v1/timetable/[id]/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "PATCH v1/timetable/[id]/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "DELETE v1/timetable/[id]/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "POST v1/timetable/batch/route.ts": "batch timetable creation verified by branchId",
  "GET v1/timetable/route.ts": "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "POST v1/timetable/route.ts": "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "GET v1/portal/students/[studentId]/overview/route.ts": "portal student overview verified by portal session cookie",
  "GET v1/portal/students/[studentId]/results/route.ts": "portal student results verified by portal session cookie",
  "GET v1/portal/students/[studentId]/invoices/route.ts": "portal student invoices verified by portal session cookie",
  "GET v1/portal/students/[studentId]/lms/route.ts": "portal student LMS verified by portal session cookie",
  "GET v1/portal/students/[studentId]/practice/options/route.ts": "portal student practice options verified by portal session cookie",
  "GET v1/portal/students/[studentId]/practice/history/route.ts": "portal student practice history verified by portal session cookie",
  "GET v1/question-bank/reviewers/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's; with none named, only a superadmin gets the school-wide answer (checked in the handler)",
  "POST v1/question-bank/reviewers/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's; with none named, only a superadmin gets the school-wide answer (checked in the handler)",
  "GET v1/question-bank/settings/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's; with none named, only a superadmin gets the school-wide answer (checked in the handler)",
  "PUT v1/question-bank/settings/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's; with none named, only a superadmin gets the school-wide answer (checked in the handler)",
  "GET v1/question-bank/items/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's; with none named, the list is the caller's own branches' (decided row by row by question-bank/rules staffMaySee)",
  "POST v1/question-bank/items/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the body must be the caller's",
  "POST v1/question-bank/items/offer-back/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the body must be the caller's",
  "GET v1/question-bank/items/[id]/route.ts":
    "no branch is named in the request: the branch is the ITEM's, and question-bank/rules (staffMaySee, with a viewer read inside the transaction) decides; a question the person may not see is the same 404 as one that does not exist",
  "GET v1/question-bank/review-queue/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's; with none named, the list is the caller's own branches' (decided row by row by question-bank/rules staffMaySee)",
  "DELETE v1/question-bank/reviewers/[id]/route.ts":
    "the branch is the reviewer ROW's, never the request's: the caller must administer that branch (canAdminister) or be a superadmin, and an every-branch row (branchId null) is a superadmin's alone, which withBranch does not model; unknown and not-yours are the same 404",
  "POST v1/question-bank/items/[id]/report/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the body must be the caller's",
  "GET v1/question-bank/reports/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's; with none named, the list is the caller's own branches' (decided in reports-service)",
  "GET v1/forms/route.ts": "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "POST v1/forms/route.ts": "gated by withAuthGated (lib/auth/branch-gate): the branch named in the body must be the caller's",
  "GET v1/forms/[id]/route.ts": "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "PATCH v1/forms/[id]/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "POST v1/forms/[id]/close/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "GET v1/forms/[id]/responses/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "GET v1/forms/[id]/analytics/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "GET v1/forms/available/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "POST v1/forms/[id]/submit/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "GET v1/forms/[id]/turn-ins/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "PATCH v1/forms/[id]/turn-ins/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "POST v1/forms/[id]/turn-ins/sync/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "GET v1/forms/[id]/marking-queue/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "GET v1/forms/marking-queue/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "GET v1/forms/[id]/responses/[responseId]/marking/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "PATCH v1/forms/[id]/responses/[responseId]/marking/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query or body must be the caller's",
  "POST v1/question-bank/print/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the body must be the caller's",
  "GET v1/question-bank/print-logs/route.ts":
    "gated by withAuthGated (lib/auth/branch-gate): the branch named in the query must be the caller's",
  "POST v1/forms/[id]/print/route.ts": "gated by withAuthGated (lib/auth/branch-gate): the branch named in the body must be the caller's",
  "GET v1/students/[id]/standing/route.ts":
    "the branch is the PUPIL's, never the request's: the service reads the pupil, then adminScope + mayAdminister decide (a super admin, or an administrator of that branch); an unknown pupil and another branch's pupil are the same 404",
  "GET v1/members/[id]/standing/route.ts":
    "the branch is the MEMBERSHIP's (or the staff record's), never the request's: the service reads it, then adminScope + mayAdminister decide (a super admin, or an administrator of that branch); an unknown member and another branch's member are the same 404",
  "POST v1/members/[id]/standing/route.ts":
    "the branch is the MEMBERSHIP's (or the staff record's), never the request's: the service reads it, then adminScope + mayAdminister decide (a super admin, or an administrator of that branch); an unknown member and another branch's member are the same 404",
  "POST v1/programs/[id]/branches/route.ts":
    "acts on a PROGRAM, not on a branch of the caller's: a super admin alone (change() at the super level in programs/service decides, inside the program's row lock); the branch is only the thing to link or unlink",
  "DELETE v1/programs/[id]/branches/[branchId]/route.ts":
    "acts on a PROGRAM, not on a branch of the caller's: a super admin alone (change() at the super level in programs/service decides, inside the program's row lock); the branch is only the thing to link or unlink",
  "GET v1/programs/[id]/people/route.ts":
    "the branch is the PROGRAM's and the PERSON's, never the request's: the service reads the viewer's place in the program (a super admin, a program admin, or an administrator of a branch it runs in), and a branch administrator is limited to the people through their own branches; a person or program outside that reach is the same 404 as one that does not exist",
  "GET v1/settings/programs/route.ts":
    "the match is the PATCH comment below it: this GET names no branch. The service lists only the branches the caller administers (a super admin: all), and says nothing about any other",
  "GET v1/settings/programs-attendance/route.ts":
    "the match is the PATCH comment below it: this GET names no branch. The service lists only the branches the caller administers (a super admin: all), and says nothing about any other",
  "GET v1/settings/programs-assessments/route.ts":
    "the match is the PATCH comment below it: this GET names no branch. The service lists only the branches the caller administers (a super admin: all), and says nothing about any other",
  "GET v1/settings/programs-fees/route.ts":
    "the match is the PATCH comment below it: this GET names no branch. The service lists only the branches the caller administers (a super admin: all), and says nothing about any other",
  "GET v1/settings/programs-progress/route.ts":
    "the match is the PATCH comment below it: this GET names no branch. The service lists only the branches the caller administers (a super admin: all), and says nothing about any other",
  "GET v1/settings/programs-progress-student/route.ts":
    "the match is the PATCH comment below it: this GET names no branch. The service lists only the branches the caller administers (a super admin: all), and says nothing about any other",
  "GET v1/settings/programs-progress-guardian/route.ts":
    "the match is the PATCH comment below it: this GET names no branch. The service lists only the branches the caller administers (a super admin: all), and says nothing about any other",
  "GET v1/settings/standing/route.ts":
    "the match is the PATCH comment below it: this GET names no branch. The service lists only the branches the caller administers (a super admin: all), and says nothing about any other",
  "GET v1/settings/part-payment/route.ts":
    "the match is the PATCH comment below it: this GET names no branch. The service lists only the branches the caller administers (a super admin: all), and says nothing about any other",
  "GET v1/finance/overview/route.ts":
    "acts on no one branch: it answers for every branch the caller administers (adminScope narrows the list; a branch the caller does not administer is left out and never named)",
};

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? routeFiles(full) : name === "route.ts" ? [full] : [];
  });
}

/// Every exported handler with the source text that belongs to it (from its `export` to the next one).
function handlers(): { key: string; source: string }[] {
  const found: { key: string; source: string }[] = [];
  for (const file of routeFiles(API_ROOT)) {
    const rel = relative(API_ROOT, file).split("\\").join("/");
    const text = readFileSync(file, "utf8");
    const parts = text.split(new RegExp(`^export (?:const|async function) (${METHODS.join("|")})\\b`, "m"));
    for (let i = 1; i < parts.length; i += 2) found.push({ key: `${parts[i]} ${rel}`, source: parts[i + 1] });
  }
  return found;
}

test.describe("every API handler declares who may call it", () => {
  test("a handler without `roles:` is on the allowlist, with a reason", () => {
    const missing = handlers()
      .filter((h) => !declares(h.source) && !(h.key in ALLOWED))
      .map((h) => h.key);
    expect(missing, "add `roles: [...]` to these handlers, or list them in ALLOWED with the reason").toEqual([]);
  });

  test("the allowlist has no stale entries (the handler exists and still has no `roles:`)", () => {
    const byKey = new Map(handlers().map((h) => [h.key, h.source]));
    const stale = Object.keys(ALLOWED).filter((key) => !byKey.has(key) || declares(byKey.get(key)!));
    expect(stale).toEqual([]);
  });

  test("a handler that names a branch asks about that branch (or says where it is checked)", () => {
    const unchecked = handlers()
      .filter((h) => !(h.key in ALLOWED)) // public and own-account handlers act on no branch
      .filter((h) => NAMES_A_BRANCH.test(h.source) && !BRANCH_HELPERS.some((name) => h.source.includes(name)))
      .map((h) => h.key)
      .filter((key) => !(key in BRANCH_CHECKED_ELSEWHERE));
    expect(
      unchecked,
      "call a branch helper (lib/auth/branch-access, lib/students/scope, lib/members/http) or list them with the reason",
    ).toEqual([]);
  });

  test("the branch allowlist has no stale entries", () => {
    const byKey = new Map(handlers().map((h) => [h.key, h.source]));
    const stale = Object.keys(BRANCH_CHECKED_ELSEWHERE).filter(
      (key) => !byKey.has(key) || !NAMES_A_BRANCH.test(byKey.get(key)!) || BRANCH_HELPERS.some((name) => byKey.get(key)!.includes(name)),
    );
    expect(stale).toEqual([]);
  });

  test("a handler that names a branch is wrapped by withBranch, or is listed as not yet moved / acting on no one branch (ADR 0015)", () => {
    const unwrapped = handlers()
      .filter((h) => NAMES_A_BRANCH.test(h.source) && !STRUCTURE.test(h.source))
      .map((h) => h.key)
      .filter((key) => !(key in NOT_WRAPPED));
    expect(unwrapped, "wrap the handler with withBranch (lib/auth/with-branch.ts) or list it in NOT_WRAPPED with the reason").toEqual([]);
  });

  test("the not-wrapped list has no stale entries (the handler exists, still names a branch, and is still unwrapped)", () => {
    const byKey = new Map(handlers().map((h) => [h.key, h.source]));
    const stale = Object.keys(NOT_WRAPPED).filter(
      (key) => !byKey.has(key) || !NAMES_A_BRANCH.test(byKey.get(key)!) || STRUCTURE.test(byKey.get(key)!),
    );
    expect(stale).toEqual([]);
  });

  test("the scan finds the handlers it is supposed to guard (it is not silently empty)", () => {
    const all = handlers();
    expect(all.length).toBeGreaterThan(40);
    expect(all.some((h) => h.key === "GET v1/students/route.ts" && h.source.includes("roles:"))).toBe(true);
  });
});

// Task 0116: the routes that set a class's grade scale and confirm a scale's bands are for a branch ADMINISTRATOR of that branch and a SUPERADMIN only. The role gate (`roles: [ADMIN]`) runs before the
// branch is looked up, and `administer` is the one authority that lets a superadmin act everywhere; a branch named in the body is a 403, an unknown or foreign id in the path a 404.
test.describe("class grade scale and scale confirmation (task 0116)", () => {
  const source = (rel: string) => readFileSync(join(API_ROOT, "v1", rel), "utf8");
  test("class-scale: administrators only, the branch is read from the body and checked with administer (403 for a foreign branch)", () => {
    const s = source("results/templates/class-scale/route.ts");
    expect(s).toContain("roles: [Role.ADMIN]");
    expect(s).toContain('as: "administer"');
    expect(s).toContain('where: "body"');
    expect(s).toContain("withBranch");
    expect(s).not.toContain("staff-read");
    expect(s).not.toContain("staff-write");
  });
  test("confirm: administrators only, the branch comes from the scale in the path and is checked with administer, a foreign or unknown scale is a 404", () => {
    const s = source("academics/grade-scales/[id]/confirm/route.ts");
    expect(s).toContain("roles: [Role.ADMIN]");
    expect(s).toContain('as: "administer"');
    expect(s).toContain("scaleBranchId");
    expect(s).toContain('notFound("Grade scale")');
    expect(s).not.toContain("staff-read");
    expect(s).not.toContain("staff-write");
  });
  test("the role gate wraps the branch check (withAuth outside, withBranch inside), so a teacher is refused before any branch is looked up", () => {
    for (const rel of ["results/templates/class-scale/route.ts", "academics/grade-scales/[id]/confirm/route.ts"]) {
      const s = source(rel);
      expect(s.indexOf("withAuth"), rel).toBeGreaterThan(-1);
      expect(s.indexOf("withAuth<") === -1 ? s.indexOf("withAuth(") : s.indexOf("withAuth<"), rel).toBeLessThan(s.indexOf("withBranch<"));
    }
  });
});

// Task 0120: the school-wide template routes. The master routes belong to the school, so they are SUPERADMIN only (`withAuth ... superAdmin: true`) and name no single branch; "detach" is for a branch
// ADMINISTRATOR of the template's branch (the role gate before the branch lookup, `administer`, a foreign or unknown template a 404).
test.describe("school-wide result templates (task 0120)", () => {
  const source = (rel: string) => readFileSync(join(API_ROOT, "v1", rel), "utf8");
  const MASTER_ROUTES = [
    "school-templates/route.ts",
    "school-templates/[id]/route.ts",
    "school-templates/[id]/sync/route.ts",
    "school-templates/[id]/branches/route.ts",
  ];
  test("every master route is superadmin only and none is branch-scoped", () => {
    for (const rel of MASTER_ROUTES) {
      const s = source(rel);
      expect(s, rel).toContain("superAdmin: true");
      expect(s, rel).not.toContain("withBranch");
      expect(s, rel).not.toContain("roles: [Role.ADMIN]"); // a branch administrator is not enough
    }
  });
  test("every master route that writes is rate limited", () => {
    for (const rel of MASTER_ROUTES) {
      const s = source(rel);
      if (/export const (POST|PATCH)/.test(s)) expect(s, rel).toContain("reserveAttempt");
    }
  });
  test("detach: administrators only, the branch comes from the template in the path and is checked with administer, a foreign or unknown template is a 404", () => {
    const s = source("results/templates/[id]/detach/route.ts");
    expect(s).toContain("roles: [Role.ADMIN]");
    expect(s).toContain('as: "administer"');
    expect(s).toContain("templateBranchId");
    expect(s).toContain('notFound("Result template")');
    expect(s).not.toContain("staff-read");
    expect(s.indexOf("withAuth<")).toBeLessThan(s.indexOf("withBranch<")); // the role gate wraps the branch check
  });
});
