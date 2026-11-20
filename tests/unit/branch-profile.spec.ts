import { expect, test } from "@playwright/test";
import { PROFILE_FIELDS, cardPreview, mergeProfile, setValue, type ProfileValues } from "@/lib/settings/branch-profile-rules";

// School details per branch (task 0115): the pure rule that decides what a branch shows. No database, no browser.

const SCHOOL: ProfileValues = {
  schoolName: "Al-Eeman Schools",
  principal: "Mrs School",
  phone: "0803 000 0001",
  motto: "Faith and knowledge",
  address: "12 Example Road",
  email: "info@school.example",
  website: "https://school.example",
};
const NOTHING: ProfileValues = { schoolName: null, principal: null, phone: null, motto: null, address: null, email: null, website: null };

test.describe("setValue", () => {
  test("trims; nothing, blank and only spaces are not set", () => {
    expect(setValue("  Mrs Bello  ")).toBe("Mrs Bello");
    expect(setValue("")).toBeNull();
    expect(setValue("   \t\n ")).toBeNull();
    expect(setValue(null)).toBeNull();
    expect(setValue(undefined)).toBeNull();
  });
});

test.describe("mergeProfile", () => {
  test("a branch with nothing of its own shows the school's, every source the school", () => {
    const merged = mergeProfile(SCHOOL, NOTHING);
    expect(merged.values).toEqual(SCHOOL);
    for (const f of PROFILE_FIELDS) expect(merged.source[f], f).toBe("school");
  });

  test("a missing branch row is the same as an empty one", () => {
    expect(mergeProfile(SCHOOL, null)).toEqual(mergeProfile(SCHOOL, NOTHING));
    expect(mergeProfile(SCHOOL, undefined)).toEqual(mergeProfile(SCHOOL, NOTHING));
  });

  test("the branch's own value wins, field by field; the rest come from the school", () => {
    const merged = mergeProfile(SCHOOL, { ...NOTHING, principal: "Mr Branch", address: "5 Branch Lane" });
    expect(merged.values).toEqual({ ...SCHOOL, principal: "Mr Branch", address: "5 Branch Lane" });
    expect(merged.source).toEqual({
      schoolName: "school",
      principal: "branch",
      phone: "school",
      motto: "school",
      address: "branch",
      email: "school",
      website: "school",
    });
  });

  test("a branch value that is blank or only spaces counts as not set, so the school's shows (and is never printed as an empty line)", () => {
    const merged = mergeProfile(SCHOOL, { ...NOTHING, principal: "", motto: "   ", phone: "\t" });
    expect(merged.values.principal).toBe(SCHOOL.principal);
    expect(merged.values.motto).toBe(SCHOOL.motto);
    expect(merged.values.phone).toBe(SCHOOL.phone);
    expect(merged.source.principal).toBe("school");
    expect(merged.source.motto).toBe("school");
  });

  test("the branch's value is trimmed, and wins even when it equals the school's", () => {
    const merged = mergeProfile(SCHOOL, { ...NOTHING, principal: "  Mrs School  " });
    expect(merged.values.principal).toBe("Mrs School");
    expect(merged.source.principal).toBe("branch");
  });

  test("a field set nowhere is null, from the school; a blank school value is nothing too", () => {
    const merged = mergeProfile({ ...SCHOOL, motto: "   ", website: null }, NOTHING);
    expect(merged.values.motto).toBeNull();
    expect(merged.values.website).toBeNull();
    expect(merged.source.motto).toBe("school");
    expect(mergeProfile(null, null).values).toEqual(NOTHING);
  });

  test("a partial row (a field left out) is read as not set", () => {
    const merged = mergeProfile(SCHOOL, { principal: "Mr Branch" });
    expect(merged.values).toEqual({ ...SCHOOL, principal: "Mr Branch" });
  });
});

test.describe("cardPreview", () => {
  test("names the motto, then the address and phone as the card prints them, then the principal", () => {
    expect(cardPreview(SCHOOL)).toBe('motto "Faith and knowledge"; 12 Example Road · 0803 000 0001; principal Mrs School');
  });
  test("leaves out what is not set", () => {
    expect(cardPreview({ ...NOTHING, address: "5 Branch Lane" })).toBe("5 Branch Lane");
    expect(cardPreview({ ...NOTHING, phone: "0803" })).toBe("0803");
  });
  test("says so when nothing is set anywhere", () => {
    expect(cardPreview(NOTHING)).toBe("no motto, address, phone or principal, because none is set");
  });
});

test.describe("the school name of a branch's report cards", () => {
  test("a branch's own name wins; a branch with none shows the school's", () => {
    const own = mergeProfile(SCHOOL, { ...NOTHING, schoolName: "Al-Eeman Nursery and Primary School" });
    expect(own.values.schoolName).toBe("Al-Eeman Nursery and Primary School");
    expect(own.source.schoolName).toBe("branch");
    const none = mergeProfile(SCHOOL, NOTHING);
    expect(none.values.schoolName).toBe("Al-Eeman Schools");
    expect(none.source.schoolName).toBe("school");
  });

  test("a blank branch name is the school's again (a stray space never prints a blank header)", () => {
    expect(mergeProfile(SCHOOL, { ...NOTHING, schoolName: "   " }).values.schoolName).toBe("Al-Eeman Schools");
  });
});
