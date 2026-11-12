import "../support/env";
import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { BROADCAST_TAGS, audienceWords, findUnfillableTags, messageDate, tagGroupOf, tagsFor, tagsIn } from "@/lib/communication/tags";
import { BroadcastMessageSchema } from "@/lib/communication/validation";

// Task 0055: the Broadcast Composer offers only tags the server fills, and the input check refuses what cannot work (a tag nobody fills, an In-App message nobody can read, a phone message to
// a pupil who has no phone number) before anything is created. The values themselves are tested through the API (tests/api/communication-tags-recipients.spec.ts).

const base = { channel: "EMAIL", targetAudience: "ALL_PARENTS", body: "Hello" } as const;

test.describe("which tags exist, and for whom", () => {
  test("guardians get the pupil's name and class and the school's name and date; staff and pupils get the school's name and date", () => {
    expect(tagsFor("ALL_PARENTS").map((t) => t.token)).toEqual(["student_name", "class_arm", "school_name", "date"]);
    expect(tagsFor("CLASS_GROUP_PARENTS").map((t) => t.token)).toEqual(tagsFor("ALL_PARENTS").map((t) => t.token));
    expect(tagsFor("CLASS_ARM_PARENTS").map((t) => t.token)).toEqual(tagsFor("ALL_PARENTS").map((t) => t.token));
    expect(tagsFor("STAFF").map((t) => t.token)).toEqual(["school_name", "date"]);
    expect(tagsFor("STUDENTS").map((t) => t.token)).toEqual(["school_name", "date"]);
  });

  test("an unknown audience is treated as guardians (the broader set is never given to staff by accident)", () => {
    expect(tagGroupOf("ANYTHING")).toBe("GUARDIANS");
    expect(tagGroupOf("STAFF")).toBe("STAFF");
    expect(tagGroupOf("STUDENTS")).toBe("STUDENTS");
  });

  test("there is no Due Date tag: a free-text broadcast has no due date to fill it with", () => {
    expect(BROADCAST_TAGS.map((t) => t.token)).not.toContain("due_date");
  });

  test("a tag the composer can offer is one the server fills (the service source names every one)", () => {
    const service = fs.readFileSync(path.resolve(__dirname, "../../src/lib/communication/service.ts"), "utf-8");
    for (const tag of BROADCAST_TAGS)
      expect(service, `broadcastMessage does not fill {{${tag.token}}}`).toMatch(new RegExp(`\\b${tag.token}\\b\\s*:`));
  });
});

test.describe("finding the tags in a text", () => {
  test("tagsIn lists each tag once, in order, with or without spaces inside the braces", () => {
    expect(tagsIn("Dear Guardian, {{student_name}} of {{ class_arm }} - {{student_name}} again {{date}}")).toEqual([
      "student_name",
      "class_arm",
      "date",
    ]);
    expect(tagsIn("no tags here, only {single} and {{ }} and {{two words}}")).toEqual([]);
    expect(tagsIn(null)).toEqual([]);
    expect(tagsIn(undefined)).toEqual([]);
    expect(tagsIn("")).toEqual([]);
  });

  test("findUnfillableTags names what no one would fill, in the body or the subject, and honours a supplied key", () => {
    expect(findUnfillableTags(["Hi {{student_name}} on {{date}}"], "ALL_PARENTS")).toEqual([]);
    expect(findUnfillableTags(["Hi {{student_name}} on {{date}}"], "STAFF")).toEqual(["student_name"]);
    expect(findUnfillableTags(["Pay by {{due_date}}", "Re {{class_arm}} {{due_date}}"], "STUDENTS")).toEqual(["due_date", "class_arm"]);
    expect(findUnfillableTags(["Pay by {{due_date}}"], "ALL_PARENTS", ["due_date"])).toEqual([]);
    expect(findUnfillableTags([null, undefined, "plain"], "STAFF")).toEqual([]);
  });

  test("the audience is named in words for the message", () => {
    expect(audienceWords("ALL_PARENTS")).toBe("guardians");
    expect(audienceWords("CLASS_ARM_PARENTS")).toBe("guardians");
    expect(audienceWords("STAFF")).toBe("staff");
    expect(audienceWords("STUDENTS")).toBe("pupils");
  });
});

test.describe("today's date in a message", () => {
  test("is written in full and follows the school's time zone, not the server's", () => {
    const late = new Date("2026-11-12T23:30:00Z"); // 00:30 on the 13th in Lagos (UTC+1), still the 12th in UTC
    expect(messageDate(late, "UTC")).toBe("12 November 2026");
    expect(messageDate(late, "Africa/Lagos")).toBe("13 November 2026");
    expect(messageDate(new Date("2026-03-01T10:00:00Z"), "UTC")).toBe("1 March 2026");
  });
});

test.describe("the broadcast input check", () => {
  test("a normal message passes, with the tags of its audience", () => {
    expect(BroadcastMessageSchema.safeParse(base).success).toBe(true);
    expect(
      BroadcastMessageSchema.safeParse({ ...base, body: "Dear Guardian, {{student_name}} ({{class_arm}}) - {{school_name}}, {{date}}" })
        .success,
    ).toBe(true);
    expect(
      BroadcastMessageSchema.safeParse({ ...base, channel: "SMS", targetAudience: "STAFF", body: "{{school_name}} closes on {{date}}" })
        .success,
    ).toBe(true);
    expect(BroadcastMessageSchema.safeParse({ ...base, targetAudience: "STUDENTS", channel: "EMAIL" }).success).toBe(true);
    expect(
      BroadcastMessageSchema.safeParse({ ...base, channel: "WHATSAPP", targetAudience: "CLASS_ARM_PARENTS", classArmId: "x" }).success,
    ).toBe(true);
  });

  test("In-App is refused, and the message points to Announcements", () => {
    const result = BroadcastMessageSchema.safeParse({ ...base, channel: "IN_APP" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["channel"]);
      expect(result.error.issues[0].message).toBe("In-App messages are sent from Announcements: nothing here shows them to the person.");
    }
  });

  test("SMS and WhatsApp to pupils are refused (a login has no phone number); Email to pupils and a phone channel to anyone else are not", () => {
    for (const channel of ["SMS", "WHATSAPP"]) {
      const result = BroadcastMessageSchema.safeParse({ ...base, channel, targetAudience: "STUDENTS" });
      expect(result.success, channel).toBe(false);
      if (!result.success)
        expect(result.error.issues[0].message).toBe("Pupils have no phone number on file. Use Email, or send to guardians.");
    }
    for (const targetAudience of ["ALL_PARENTS", "STAFF"]) {
      expect(BroadcastMessageSchema.safeParse({ ...base, channel: "SMS", targetAudience }).success, targetAudience).toBe(true);
    }
  });

  test("a tag nobody would fill is refused, naming it and the audience; a supplied variable makes it fillable", () => {
    const body = BroadcastMessageSchema.safeParse({ ...base, body: "Fees are due {{due_date}} for {{student_name}}" });
    expect(body.success).toBe(false);
    if (!body.success) {
      expect(body.error.issues[0].path).toEqual(["body"]);
      expect(body.error.issues[0].message).toBe(
        "These tags cannot be filled for guardians: {{due_date}}. Remove them or choose another audience.",
      );
    }
    const staff = BroadcastMessageSchema.safeParse({
      ...base,
      targetAudience: "STAFF",
      subject: "About {{student_name}}",
      body: "Hello {{class_arm}}",
    });
    expect(staff.success).toBe(false);
    if (!staff.success)
      expect(staff.error.issues[0].message).toBe(
        "These tags cannot be filled for staff: {{class_arm}}, {{student_name}}. Remove them or choose another audience.",
      );
    expect(BroadcastMessageSchema.safeParse({ ...base, body: "Due {{due_date}}", variables: { due_date: "1 December" } }).success).toBe(
      true,
    );
  });

  test("the first rule that fails is the one reported (the channel before the tags)", () => {
    const result = BroadcastMessageSchema.safeParse({ ...base, channel: "IN_APP", body: "{{nothing}}" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues).toHaveLength(1);
  });
});
