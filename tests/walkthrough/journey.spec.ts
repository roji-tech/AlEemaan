import * as path from "path";
import { test } from "@playwright/test";
import { Walk } from "./support/walk";
import { resume } from "./chapters/resume";
import { c01Start } from "./chapters/c01-start";
import { c02School } from "./chapters/c02-school";
import { c03PeopleAccept, c03PeopleInvite, c03PeopleRoles } from "./chapters/c03-people";
import { c04Academics } from "./chapters/c04-academics";
import { c05Grading } from "./chapters/c05-grading";
import { c06Students } from "./chapters/c06-students";
import { c07Attendance } from "./chapters/c07-attendance";
import { c08Announcements } from "./chapters/c08-announcements";
import { c09Timetable } from "./chapters/c09-timetable";
import { c10Communication } from "./chapters/c10-communication";
import { c11Finance } from "./chapters/c11-finance";
import { c12Portal } from "./chapters/c12-portal";
import { c13Coursework } from "./chapters/c13-coursework";
import { c14Results } from "./chapters/c14-results";
import { c15Approvals } from "./chapters/c15-approvals";
import { c16Users } from "./chapters/c16-users";
import { c17Discipline } from "./chapters/c17-discipline";
import { c18Account } from "./chapters/c18-account";
import { c19Recovery } from "./chapters/c19-recovery";
import { c20FormsStaff } from "./chapters/c20-forms-staff";
import { c21FormsPublic } from "./chapters/c21-forms-public";
import { c22QuestionBank } from "./chapters/c22-question-bank";
import { c23QuestionBankReview } from "./chapters/c23-question-bank-review";
import { c24QuestionBankTools } from "./chapters/c24-question-bank-tools";
import { c25Programs } from "./chapters/c25-programs";
import { c26ProgramPeople } from "./chapters/c26-program-people";
import { c27ProgramAttendance } from "./chapters/c27-program-attendance";
import { c28ProgramAssessments } from "./chapters/c28-program-assessments";
import { c29ProgramFees } from "./chapters/c29-program-fees";
import { c30ProgramCompletion } from "./chapters/c30-program-completion";
import { c31ProgramProgress } from "./chapters/c31-program-progress";
import { c32ProgramPortal } from "./chapters/c32-program-portal";
import { c33PortalPractice } from "./chapters/c33-portal-practice";
import { c34FormsPortal } from "./chapters/c34-forms-portal";

// The journey of one pass (task 0033). One browser context, one recording, chapters in the order the data is made (section 6.6). The pass is the project that runs it (desktop-light,
// desktop-dark, phone); the chapters are the same in each. WALKTHROUGH_MODE=recon records a chapter that stops early as a finding and goes on; the default, strict, stops at the first failure.

const outputRoot = process.env.WALKTHROUGH_OUTPUT_ROOT ?? path.resolve("out", "walkthrough", "aleemaan");

test("the walkthrough", async ({ page }, testInfo) => {
  const pass = testInfo.project.name;
  const passDir = path.join(outputRoot, pass);
  const walk = new Walk(page, path.join(passDir, "screenshots"));
  await walk.init();
  await walk.goto("/");

  // the app starts dark and does not follow the system setting: the light and phone passes click the toggle, the dark pass shows it working and comes back
  const theme = pass === "desktop-dark" ? "dark" : "light";

  // Each chapter's timeline and findings are written as soon as it ends (and written again, over the same files, when the next ends): a run that is stopped, or that outgrows its time
  // limit, keeps what it had. The last call below is the same write.
  const chapter = async (name: string, run: () => Promise<void>) => {
    await walk.chapter(name, run);
    walk.saveTimeline(path.join(passDir, "timeline.json"));
    walk.saveFindings(path.join(passDir, "evidence"));
  };

  // a resumed recon (WALKTHROUGH_ONLY): sign in again, and run only the chapters named; a whole run skips this
  await chapter("Resume", () => resume(walk, page, theme));
  await chapter("C01 Start and sign in", () => c01Start(walk, page, theme));
  await chapter("C02 The school", () => c02School(walk, page));
  await chapter("C03 People", async () => {
    await c03PeopleInvite(walk, page);
    await c03PeopleAccept(walk, page);
    await c03PeopleRoles(walk, page);
  });
  await chapter("C04 Academics", () => c04Academics(walk, page));
  await chapter("C05 Assessment and grading", () => c05Grading(walk, page));
  await chapter("C06 Students", () => c06Students(walk, page));
  await chapter("C07 Attendance", () => c07Attendance(walk, page));
  await chapter("C08 Announcements", () => c08Announcements(walk, page));
  await chapter("C09 Timetable", () => c09Timetable(walk, page));
  await chapter("C10 Communication", () => c10Communication(walk, page));
  await chapter("C11 Finance", () => c11Finance(walk, page));
  await chapter("C12 The portal", () => c12Portal(walk, page));
  await chapter("C13 Coursework", () => c13Coursework(walk, page));
  await chapter("C14 Results", () => c14Results(walk, page));
  await chapter("C15 Approvals", () => c15Approvals(walk, page));
  await chapter("C16 Users", () => c16Users(walk, page));
  await chapter("C17 Discipline", () => c17Discipline(walk, page));
  await chapter("C18 Account", () => c18Account(walk, page));
  await chapter("C19 Recovery and two-step sign-in", () => c19Recovery(walk, page));
  await chapter("C20 Forms (staff)", () => c20FormsStaff(walk, page));
  await chapter("C21 Forms (public questionnaire)", () => c21FormsPublic(walk, page));
  await chapter("C22 Question bank", () => c22QuestionBank(walk, page));
  await chapter("C23 Question bank review and reports", () => c23QuestionBankReview(walk, page));
  await chapter("C24 Question bank tools", () => c24QuestionBankTools(walk, page));
  await chapter("C25 Programs", () => c25Programs(walk, page));
  await chapter("C26 Program people", () => c26ProgramPeople(walk, page));
  await chapter("C27 Program attendance", () => c27ProgramAttendance(walk, page));
  await chapter("C28 Program assessments", () => c28ProgramAssessments(walk, page));
  await chapter("C29 Program fees", () => c29ProgramFees(walk, page));
  await chapter("C30 Program completion", () => c30ProgramCompletion(walk, page));
  await chapter("C31 Program progress", () => c31ProgramProgress(walk, page));
  await chapter("C32 Program portal", () => c32ProgramPortal(walk, page));
  await chapter("C33 Portal practice", () => c33PortalPractice(walk, page));
  await chapter("C34 Forms portal", () => c34FormsPortal(walk, page));

  walk.saveTimeline(path.join(passDir, "timeline.json"));
  walk.saveFindings(path.join(passDir, "evidence"));
  walk.finish(path.join(passDir, "evidence", "observations.json"), { strict: walk.mode === "strict" });
});
