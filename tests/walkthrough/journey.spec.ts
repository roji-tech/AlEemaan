import * as path from "path";
import { test } from "@playwright/test";
import { Walk } from "./support/walk";
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

  walk.saveTimeline(path.join(passDir, "timeline.json"));
  walk.saveFindings(path.join(passDir, "evidence"));
  walk.finish(path.join(passDir, "evidence", "observations.json"), { strict: walk.mode === "strict" });
});
