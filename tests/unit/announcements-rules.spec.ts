import "../support/env";
import { test, expect } from "@playwright/test";
import {
  isAnnouncementActive,
  matchesAudience,
  isAnnouncementVisible,
  sortAnnouncements,
  canAuthorAnnouncements,
  canManageAnnouncement,
  Role,
  AnnouncementStatus,
  AnnouncementLike,
} from "@/lib/announcements/rules";

test.describe("Announcements Rules — Active Publication Window", () => {
  const baseAnnouncement: AnnouncementLike = {
    id: "ann_1",
    status: AnnouncementStatus.PUBLISHED,
    targetRoles: [],
    authorUserId: "user_author",
    isPinned: false,
    publishedAt: new Date("2026-10-15T10:00:00Z"),
    expiresAt: new Date("2026-10-20T10:00:00Z"),
  };

  test("active when current time is within publishedAt and expiresAt", () => {
    const now = new Date("2026-10-16T12:00:00Z");
    expect(isAnnouncementActive(baseAnnouncement, now)).toBe(true);
  });

  test("inactive when status is DRAFT or ARCHIVED", () => {
    const now = new Date("2026-10-16T12:00:00Z");
    expect(isAnnouncementActive({ ...baseAnnouncement, status: AnnouncementStatus.DRAFT }, now)).toBe(false);
    expect(isAnnouncementActive({ ...baseAnnouncement, status: AnnouncementStatus.ARCHIVED }, now)).toBe(false);
  });

  test("inactive before publishedAt", () => {
    const beforePub = new Date("2026-10-14T10:00:00Z");
    expect(isAnnouncementActive(baseAnnouncement, beforePub)).toBe(false);
  });

  test("inactive after expiresAt", () => {
    const afterExp = new Date("2026-10-21T10:00:00Z");
    expect(isAnnouncementActive(baseAnnouncement, afterExp)).toBe(false);
  });

  test("active indefinitely when expiresAt is null", () => {
    const farFuture = new Date("2030-01-01T00:00:00Z");
    expect(isAnnouncementActive({ ...baseAnnouncement, expiresAt: null }, farFuture)).toBe(true);
  });
});

test.describe("Announcements Rules — Audience Targeting", () => {
  test("empty targetRoles matches any role", () => {
    const announcement = { targetRoles: [], branchId: null, classArmId: null };
    expect(matchesAudience(announcement, { userId: "u1", role: Role.STUDENT })).toBe(true);
    expect(matchesAudience(announcement, { userId: "u2", role: Role.TEACHING_STAFF })).toBe(true);
  });

  test("specific targetRoles filters out non-matching roles", () => {
    const announcement = { targetRoles: [Role.TEACHING_STAFF, Role.ADMIN], branchId: null, classArmId: null };
    expect(matchesAudience(announcement, { userId: "u1", role: Role.TEACHING_STAFF })).toBe(true);
    expect(matchesAudience(announcement, { userId: "u2", role: Role.STUDENT })).toBe(false);
  });

  test("branchId matches branch or school-wide", () => {
    const schoolWide = { targetRoles: [], branchId: null, classArmId: null };
    const branchSpecific = { targetRoles: [], branchId: "branch_pri", classArmId: null };

    const viewer1 = { userId: "u1", role: Role.STUDENT, branchId: "branch_pri" };
    const viewer2 = { userId: "u2", role: Role.STUDENT, branchId: "branch_sec" };

    expect(matchesAudience(schoolWide, viewer1)).toBe(true);
    expect(matchesAudience(schoolWide, viewer2)).toBe(true);
    expect(matchesAudience(branchSpecific, viewer1)).toBe(true);
    expect(matchesAudience(branchSpecific, viewer2)).toBe(false);
  });

  test("classArmId filters by class arm", () => {
    const armSpecific = { targetRoles: [], branchId: "branch_sec", classArmId: "arm_jss1a" };
    expect(matchesAudience(armSpecific, { userId: "u1", role: Role.STUDENT, branchId: "branch_sec", classArmId: "arm_jss1a" })).toBe(true);
    expect(matchesAudience(armSpecific, { userId: "u2", role: Role.STUDENT, branchId: "branch_sec", classArmId: "arm_jss1b" })).toBe(false);
  });
});

test.describe("Announcements Rules — Visibility & Sorting", () => {
  const ann = {
    id: "ann_1",
    status: AnnouncementStatus.DRAFT,
    targetRoles: [Role.TEACHING_STAFF],
    branchId: "branch_1",
    classArmId: null,
    authorUserId: "author_1",
    isPinned: false,
    publishedAt: new Date("2026-10-15T00:00:00Z"),
  };

  test("superadmins can see drafts and all announcements", () => {
    expect(isAnnouncementVisible(ann, { userId: "super_1", role: Role.ADMIN, isSuperAdmin: true })).toBe(true);
  });

  test("authors can see their own drafts", () => {
    expect(isAnnouncementVisible(ann, { userId: "author_1", role: Role.TEACHING_STAFF })).toBe(true);
  });

  test("sorts pinned announcements to top, then publishedAt descending", () => {
    const items = [
      { id: "1", isPinned: false, publishedAt: new Date("2026-10-15T00:00:00Z") },
      { id: "2", isPinned: true, publishedAt: new Date("2026-10-10T00:00:00Z") },
      { id: "3", isPinned: false, publishedAt: new Date("2026-10-16T00:00:00Z") },
    ];
    const sorted = sortAnnouncements(items);
    expect(sorted[0].id).toBe("2"); // Pinned
    expect(sorted[1].id).toBe("3"); // Later date
    expect(sorted[2].id).toBe("1"); // Earlier date
  });

  test("evaluates author and management permissions", () => {
    expect(canAuthorAnnouncements(Role.ADMIN)).toBe(true);
    expect(canAuthorAnnouncements(Role.TEACHING_STAFF)).toBe(true);
    expect(canAuthorAnnouncements(Role.STUDENT)).toBe(false);
    expect(canAuthorAnnouncements(Role.STUDENT, true)).toBe(true); // Superadmin

    const item = { authorUserId: "user_a", branchId: "branch_1" };
    expect(canManageAnnouncement(item, { userId: "user_a", role: Role.TEACHING_STAFF })).toBe(true);
    expect(canManageAnnouncement(item, { userId: "user_b", role: Role.TEACHING_STAFF })).toBe(false);
    expect(canManageAnnouncement(item, { userId: "user_b", role: Role.ADMIN, branchId: "branch_1" })).toBe(true);
    expect(canManageAnnouncement(item, { userId: "user_b", role: Role.ADMIN, isSuperAdmin: true })).toBe(true);
  });
});
