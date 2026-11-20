import { expect, test } from "@playwright/test";
import { ALL_BRANCHES, UNPLACED, pickBranch, rememberable } from "@/components/ui/branch-selection";
import { invitationStatus, isLiveInvitation } from "@/lib/invitations/status";
import { invitationBody } from "@/lib/invitations/rules";
import { historyText, isDeletedDraft, type HistoricInvitation } from "@/components/users/model-history";
import { expiryText } from "@/components/users/model";
import { staffColumns, staffEntity, staffEntityFor, staffRowSchema } from "@/lib/bulk/staff";
import { EXPORT_COLUMNS, exportTable, exportValues } from "@/lib/bulk/list-export";
import { accountFitsRecord } from "@/lib/academics/staff-accounts";

// Sweep 2 (task 0118, 2026-11-20): the pure parts. Not placed in a branch (the picker's reserved value), a draft invitation (its status, its body, how history reads a deleted one), the
// Department column of the bulk staff file and of its export.

test.describe("Not placed in a branch (task 0101 D3): the branch picker", () => {
  const ids = ["b1", "b2"];
  test("the reserved value is usable only where the page offers it, and is never remembered", () => {
    expect(pickBranch({ ids, allowUnplaced: true, address: UNPLACED, fallback: "b1" })).toBe(UNPLACED);
    expect(pickBranch({ ids, address: UNPLACED, fallback: "b1" })).toBe("b1"); // not offered: ignored, like any value the person does not have
    expect(pickBranch({ ids, allowAll: true, address: UNPLACED, fallback: "b1" })).toBe("b1"); // "all" being offered does not offer it
    expect(pickBranch({ ids, allowUnplaced: true, allowAll: true, chosen: ALL_BRANCHES, address: UNPLACED, fallback: "b1" })).toBe(
      ALL_BRANCHES,
    );
    expect(rememberable(UNPLACED)).toBeNull();
    expect(rememberable(ALL_BRANCHES)).toBeNull();
    expect(rememberable("b2")).toBe("b2");
  });
  test("a remembered branch is never the reserved value, so another page cannot land on it", () => {
    expect(pickBranch({ ids, allowUnplaced: true, remembered: UNPLACED, fallback: "b1" })).toBe("b1");
  });
});

test.describe("a draft invitation (task 0101 D2)", () => {
  const now = new Date("2026-11-20T10:00:00Z");
  const sentAt = new Date("2026-11-19T10:00:00Z");
  test("no expiry is a draft; it is never accepted-looking, run out or live; revoked and accepted still win", () => {
    const draft = { acceptedAt: null, revokedAt: null, expiresAt: null };
    expect(invitationStatus(draft, now)).toBe("draft");
    expect(isLiveInvitation(draft, now)).toBe(false); // no link, so nothing to accept
    expect(invitationStatus({ ...draft, revokedAt: now }, now)).toBe("revoked"); // a deleted draft
    expect(invitationStatus({ ...draft, acceptedAt: now }, now)).toBe("accepted");
    expect(invitationStatus({ acceptedAt: null, revokedAt: null, expiresAt: new Date(now.getTime() + 1000) }, now)).toBe("pending");
    expect(invitationStatus({ acceptedAt: null, revokedAt: null, expiresAt: sentAt }, now)).toBe("expired");
  });
  test("the screen's words for a draft, and for a deleted one in the history", () => {
    expect(expiryText(null)).toBe("Draft: not sent yet");
    const base: HistoricInvitation = {
      id: "i",
      email: "a@b.co",
      role: "TEACHING_STAFF",
      branchId: "b1",
      branchName: "One",
      invitedByName: null,
      createdAt: sentAt.toISOString(),
      sentAt: null,
      expiresAt: null,
      status: "expired",
      acceptedAt: null,
      revokedAt: now.toISOString(),
      revokedByName: "Ada",
      revokedWhy: "draft deleted",
    };
    expect(isDeletedDraft(base)).toBe(true);
    expect(historyText(base)).toMatch(/^Draft deleted by Ada, /);
    // A sent invitation that was revoked is still "Revoked", never "Draft deleted".
    const sent = { ...base, sentAt: sentAt.toISOString(), expiresAt: now.toISOString(), revokedWhy: "revoked by an administrator" };
    expect(isDeletedDraft(sent)).toBe(false);
    expect(historyText(sent)).toMatch(/^Revoked by Ada, .*\(revoked by an administrator\)$/);
  });
  test("the body takes draft: true, and only a boolean", () => {
    const base = { email: "A@B.co", role: "TEACHING_STAFF", branchId: "b1" };
    expect(invitationBody.safeParse({ ...base, draft: true }).success).toBe(true);
    expect(invitationBody.safeParse({ ...base, draft: false }).success).toBe(true);
    expect(invitationBody.safeParse(base).success).toBe(true);
    expect(invitationBody.safeParse({ ...base, draft: "yes" }).success).toBe(false);
    const parsed = invitationBody.safeParse({ email: "A@B.co", role: "TEACHING_STAFF", branchIds: ["b1", "b2"], draft: true });
    expect(parsed.success && parsed.data.email).toBe("a@b.co");
  });
});

test.describe("the Department column of the bulk staff file (task 0101 D7)", () => {
  const base = { category: "Teaching", firstName: "Amina", lastName: "Yusuf" };
  test("it is the last column, optional, and read as text", () => {
    const last = staffColumns[staffColumns.length - 1];
    expect(last).toMatchObject({ key: "department", label: "Department", required: false });
    expect(staffRowSchema.safeParse({ ...base, department: "Sciences" })).toMatchObject({
      success: true,
      data: { department: "Sciences" },
    });
    const blank = staffRowSchema.safeParse({ ...base, department: "  " });
    expect(blank.success && blank.data.department).toBeUndefined();
    expect(staffRowSchema.safeParse({ ...base, department: "x".repeat(81) }).success).toBe(false);
  });
  test("the branch's own departments are offered as a dropdown only when it uses them", () => {
    expect(staffEntityFor(null)).toBe(staffEntity);
    expect(staffEntityFor([])).toBe(staffEntity);
    const withNames = staffEntityFor(["Sciences", "Languages"]);
    const column = withNames.columns.find((c) => c.key === "department")!;
    expect(column.options).toEqual([
      { value: "Sciences", label: "Sciences" },
      { value: "Languages", label: "Languages" },
    ]);
    // Every other column is exactly as it was.
    expect(withNames.columns.filter((c) => c.key !== "department")).toEqual(staffColumns.filter((c) => c.key !== "department"));
  });
  test("the export has the same columns, and writes the department names joined", () => {
    expect(EXPORT_COLUMNS.staff).toBe(staffColumns);
    const row = {
      category: "TEACHING",
      firstName: "A",
      lastName: "B",
      phone: null,
      email: null,
      title: null,
      gender: null,
      designation: null,
      qualification: null,
      corpsMember: false,
    };
    expect(exportValues.staff({ ...row, departments: ["Languages", "Sciences"] }).department).toBe("Languages; Sciences");
    expect(exportValues.staff(row).department).toBe("");
    const table = exportTable("staff", [exportValues.staff({ ...row, departments: ["Sciences"] })]);
    expect(table.headers.at(-1)).toBe("Department");
    expect(table.rows[0].at(-1)).toBe("Sciences");
  });
});

test.describe("the accept rule keeps its role pairing (task 0112 D9, unchanged by drafts)", () => {
  test("an administrator fits either kind; a teacher only teaching", () => {
    expect(accountFitsRecord("ADMIN", "TEACHING")).toBe(true);
    expect(accountFitsRecord("ADMIN", "NON_TEACHING")).toBe(true);
    expect(accountFitsRecord("TEACHING_STAFF", "TEACHING")).toBe(true);
    expect(accountFitsRecord("TEACHING_STAFF", "NON_TEACHING")).toBe(false);
  });
});
