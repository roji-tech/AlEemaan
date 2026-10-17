import "../support/env";
import { test, expect } from "@playwright/test";
import {
  parseTimeToMinutes,
  formatMinutesToTime,
  isValidTimeString,
  isValidTimeRange,
  isTimeOverlap,
  findSlotClashes,
  detectAnyClash,
  findBatchClashes,
  validateTimetableSlot,
  groupSlotsByDay,
} from "@/lib/timetable/rules";

test.describe("Timetable Rules — Time Calculations and Overlap", () => {
  test("validates time strings accurately", () => {
    expect(isValidTimeString("08:00")).toBe(true);
    expect(isValidTimeString("23:59")).toBe(true);
    expect(isValidTimeString("00:00")).toBe(true);
    expect(isValidTimeString("24:00")).toBe(false);
    expect(isValidTimeString("8:00")).toBe(false);
    expect(isValidTimeString("invalid")).toBe(false);
  });

  test("parses time string to elapsed minutes", () => {
    expect(parseTimeToMinutes("00:00")).toBe(0);
    expect(parseTimeToMinutes("01:30")).toBe(90);
    expect(parseTimeToMinutes("08:45")).toBe(525);
    expect(parseTimeToMinutes("23:59")).toBe(1439);
    expect(() => parseTimeToMinutes("bad")).toThrow();
  });

  test("formats elapsed minutes back to HH:MM", () => {
    expect(formatMinutesToTime(0)).toBe("00:00");
    expect(formatMinutesToTime(90)).toBe("01:30");
    expect(formatMinutesToTime(525)).toBe("08:45");
    expect(formatMinutesToTime(1439)).toBe("23:59");
    expect(() => formatMinutesToTime(-5)).toThrow();
    expect(() => formatMinutesToTime(1440)).toThrow();
  });

  test("validates time ranges", () => {
    expect(isValidTimeRange("08:00", "09:00")).toBe(true);
    expect(isValidTimeRange("09:00", "08:00")).toBe(false);
    expect(isValidTimeRange("08:00", "08:00")).toBe(false);
    expect(isValidTimeRange("invalid", "09:00")).toBe(false);
  });

  test("calculates half-open time overlaps correctly", () => {
    // Exact overlap
    expect(isTimeOverlap("08:00", "09:00", "08:00", "09:00")).toBe(true);
    // Partial interior overlap
    expect(isTimeOverlap("08:00", "09:30", "08:30", "10:00")).toBe(true);
    // Fully enclosed
    expect(isTimeOverlap("08:00", "11:00", "09:00", "10:00")).toBe(true);
    // Adjacent intervals do NOT overlap
    expect(isTimeOverlap("08:00", "09:00", "09:00", "10:00")).toBe(false);
    expect(isTimeOverlap("09:00", "10:00", "08:00", "09:00")).toBe(false);
    // Non-adjacent disjoint intervals
    expect(isTimeOverlap("08:00", "09:00", "10:00", "11:00")).toBe(false);
  });
});

test.describe("Timetable Rules — Clash Detection Engine", () => {
  const existingSlot = {
    id: "slot_1",
    branchId: "branch_1",
    classArmId: "arm_1",
    subjectId: "sub_math",
    staffRecordId: "staff_ahmed",
    dayOfWeek: 1, // Monday
    startTime: "08:00",
    endTime: "09:00",
    room: "Lab 1",
  };

  test("detects teacher double-booking on same day & overlapping time", () => {
    const candidate = {
      id: "slot_2",
      branchId: "branch_1",
      classArmId: "arm_2", // Different arm
      subjectId: "sub_chem",
      staffRecordId: "staff_ahmed", // Same teacher
      dayOfWeek: 1,
      startTime: "08:30",
      endTime: "09:30",
      room: "Lab 2",
    };

    const clashes = findSlotClashes(candidate, [existingSlot]);
    expect(clashes).toHaveLength(1);
    expect(clashes[0].type).toBe("TEACHER_CLASH");
  });

  test("detects class arm double-booking on same day & overlapping time", () => {
    const candidate = {
      id: "slot_3",
      branchId: "branch_1",
      classArmId: "arm_1", // Same arm
      subjectId: "sub_phys",
      staffRecordId: "staff_zainab", // Different teacher
      dayOfWeek: 1,
      startTime: "08:30",
      endTime: "09:30",
      room: "Room 101",
    };

    const clashes = findSlotClashes(candidate, [existingSlot]);
    expect(clashes).toHaveLength(1);
    expect(clashes[0].type).toBe("CLASS_ARM_CLASH");
  });

  test("detects room conflict on same day & overlapping time", () => {
    const candidate = {
      id: "slot_4",
      branchId: "branch_1",
      classArmId: "arm_2",
      subjectId: "sub_bio",
      staffRecordId: "staff_zainab",
      dayOfWeek: 1,
      startTime: "08:30",
      endTime: "09:30",
      room: "lab 1 ", // Case & whitespace insensitive match
    };

    const clashes = findSlotClashes(candidate, [existingSlot]);
    expect(clashes).toHaveLength(1);
    expect(clashes[0].type).toBe("ROOM_CLASH");
  });

  test("ignores conflicts on different days of the week", () => {
    const candidate = {
      id: "slot_5",
      branchId: "branch_1",
      classArmId: "arm_1",
      subjectId: "sub_math",
      staffRecordId: "staff_ahmed",
      dayOfWeek: 2, // Tuesday
      startTime: "08:00",
      endTime: "09:00",
      room: "Lab 1",
    };

    const clashes = findSlotClashes(candidate, [existingSlot]);
    expect(clashes).toHaveLength(0);
    expect(detectAnyClash(candidate, [existingSlot])).toBeNull();
  });

  test("skips self-comparison on slot update", () => {
    const clashes = findSlotClashes(existingSlot, [existingSlot]);
    expect(clashes).toHaveLength(0);
  });

  test("detects internal batch clashes", () => {
    const batch = [
      {
        classArmId: "arm_1",
        subjectId: "sub_math",
        staffRecordId: "staff_1",
        dayOfWeek: 3,
        startTime: "10:00",
        endTime: "11:00",
      },
      {
        classArmId: "arm_2",
        subjectId: "sub_eng",
        staffRecordId: "staff_1", // Same teacher
        dayOfWeek: 3,
        startTime: "10:30",
        endTime: "11:30",
      },
    ];

    const clashes = findBatchClashes(batch);
    expect(clashes).toHaveLength(1);
    expect(clashes[0].type).toBe("TEACHER_CLASH");
  });

  test("validates schema invariants", () => {
    expect(validateTimetableSlot({}).valid).toBe(false);
    expect(
      validateTimetableSlot({
        classArmId: "arm_1",
        subjectId: "sub_1",
        staffRecordId: "staff_1",
        dayOfWeek: 1,
        startTime: "08:00",
        endTime: "09:00",
      }).valid,
    ).toBe(true);
  });

  test("groups slots by day of week chronologically", () => {
    const slots = [
      { classArmId: "a", subjectId: "s", staffRecordId: "t", dayOfWeek: 2, startTime: "10:00", endTime: "11:00" },
      { classArmId: "a", subjectId: "s", staffRecordId: "t", dayOfWeek: 1, startTime: "12:00", endTime: "13:00" },
      { classArmId: "a", subjectId: "s", staffRecordId: "t", dayOfWeek: 1, startTime: "08:00", endTime: "09:00" },
    ];
    const grouped = groupSlotsByDay(slots);
    expect(grouped[1]).toHaveLength(2);
    expect(grouped[1][0].startTime).toBe("08:00");
    expect(grouped[1][1].startTime).toBe("12:00");
    expect(grouped[2]).toHaveLength(1);
    expect(grouped[3]).toHaveLength(0);
  });
});
