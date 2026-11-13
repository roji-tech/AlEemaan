import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, db, resetDatabase } from "../support/db";
import { api } from "../support/http";
import { portalCookie } from "../support/progress";
import { GUARDIAN_PHONE, PUPIL_SECRET, REMARKS, SCHOOL, asRole, publishedWorld } from "../support/published-result";

// The report card in the portal (task 0072): what a pupil or a guardian is sent is the card the school's staff read (`getReportCard`), not a smaller one of the portal's own. Found by the
// walkthrough's chapter C14: the heading was the branch's name, the class said only the arm, and the downloaded card had no principal, position, class size or legend.

const SHEETS = "/api/v1/academics/result-sheets";

test.afterAll(async () => {
  await resetDatabase();
});

test.describe("the portal's report card is the school's report card", () => {
  test("a pupil is sent the card the staff read: the school, the class group and arm, the parts, the position, the legend and the remarks", async () => {
    const { home, w } = await publishedWorld();
    const teacher = await asRole(Role.TEACHING_STAFF, home.id);
    const staff = (await api(`/api/v1/students/${w.student.id}/report-card?periodId=${w.period.id}`, { cookie: teacher.cookie })).json.data
      .card;

    const cookie = await portalCookie(w.student.admissionNo, PUPIL_SECRET);
    const res = await api(`/api/v1/portal/students/${w.student.id}/results`, { cookie });
    expect(res.status).toBe(200);
    const { reportCards } = res.json.data;
    expect(reportCards).toHaveLength(1);
    const card = reportCards[0].card;

    // the school, not the branch
    expect(card.school).toEqual(SCHOOL);
    // the class group AND the arm
    expect(card.class).toEqual({ group: w.group.name, arm: "A" });
    // the parts, the summary with a position, the legend and the remarks
    expect(card.subjects[0].parts).toEqual([
      { name: "Test 1", max: 20, score: 15 },
      { name: "Test 2", max: 20, score: 10 },
    ]);
    expect(card.summary).toMatchObject({ subjectCount: 1, totalScore: 65, average: 65, position: 1, classSize: 1 });
    expect(card.legend).toHaveLength(3);
    expect(card.remarks).toEqual({ teacher: REMARKS.teacher, principal: REMARKS.principal });
    expect(card.preview).toBe(false);
    // and it is the same card, down to the last field, that a teacher is given for the same pupil and term
    expect(card).toEqual(staff);
    // the old fields are still there beside it
    expect(reportCards[0]).toMatchObject({ subjectCount: 1, totalScore: 65, average: 65 });
  });

  test("a guardian is sent the same card, and a pupil asking for another pupil's results is refused", async () => {
    const { home, w } = await publishedWorld();
    const other = await db.studentRecord.create({
      data: {
        branchId: home.id,
        firstName: "Other",
        lastName: "Pupil",
        gender: "MALE",
        dateOfBirth: new Date("2012-02-02"),
        admissionNo: `ADM/${w.student.admissionNo}/2`,
      },
    });
    const pupil = await portalCookie(w.student.admissionNo, PUPIL_SECRET);
    const guardian = await portalCookie(w.student.admissionNo, GUARDIAN_PHONE);
    const asPupil = (await api(`/api/v1/portal/students/${w.student.id}/results`, { cookie: pupil })).json.data.reportCards[0].card;
    const asGuardian = (await api(`/api/v1/portal/students/${w.student.id}/results`, { cookie: guardian })).json.data.reportCards[0].card;
    expect(asGuardian).toEqual(asPupil);
    expect(asGuardian.school.name).toBe(SCHOOL.name);
    const refused = await api(`/api/v1/portal/students/${other.id}/results`, { cookie: pupil });
    expect(refused.status).toBe(403);
  });

  test("a term whose results are not published has no card: nothing but published results ever reaches the portal, and the card is never a preview", async () => {
    const { home, w } = await publishedWorld();
    // a second term with a draft result only
    const term2 = await db.academicPeriod.create({
      data: {
        branchId: home.id,
        sessionId: w.session.id,
        ordinal: 2,
        label: "2nd Term",
        startDate: new Date("2027-01-10"),
        isCurrent: false,
      },
    });
    const a = await asRole(Role.ADMIN, home.id);
    const put = await api(SHEETS, {
      method: "PUT",
      cookie: a.cookie,
      body: {
        periodId: term2.id,
        classArmId: w.arm.id,
        subjectId: w.subject.id,
        entries: [{ studentId: w.student.id, parts: { "Test 1": 5, "Test 2": 5 }, exam: 10 }],
      },
    });
    expect(put.status).toBe(200);
    const cookie = await portalCookie(w.student.admissionNo, PUPIL_SECRET);
    const { reportCards } = (await api(`/api/v1/portal/students/${w.student.id}/results`, { cookie })).json.data;
    expect(reportCards).toHaveLength(1);
    expect(reportCards[0].card.period.label).toBe("1st Term");
    expect(reportCards[0].card.preview).toBe(false);
  });
});
