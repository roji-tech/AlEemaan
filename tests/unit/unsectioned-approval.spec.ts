import { test, expect } from "@playwright/test";
import { resolveUnsectioned, UNSECTIONED_DEFAULT, UNSECTIONED_VALUES } from "../../src/lib/academics/unsectioned-approval";

// The stored value of results.unsectionedClassApproval is read through `resolveUnsectioned`: exactly one of the two names is honoured, anything else is the default, so a
// damaged or hand-edited row can only narrow who approves.

test("the default is the narrow one, and both names are accepted as they are", () => {
  expect(UNSECTIONED_DEFAULT).toBe("GENERAL_OR_CLASS_ONLY");
  expect(UNSECTIONED_VALUES).toEqual(["GENERAL_OR_CLASS_ONLY", "ANY_SECTION_APPROVER"]);
  expect(resolveUnsectioned("ANY_SECTION_APPROVER")).toBe("ANY_SECTION_APPROVER");
  expect(resolveUnsectioned("GENERAL_OR_CLASS_ONLY")).toBe("GENERAL_OR_CLASS_ONLY");
});

test("a missing, mistyped or damaged value is the default", () => {
  for (const stored of [undefined, null, "", "any_section_approver", " ANY_SECTION_APPROVER", "ANY_SECTION_APPROVER ", true, 1, {}, [], ["ANY_SECTION_APPROVER"], { value: "ANY_SECTION_APPROVER" }]) {
    expect(resolveUnsectioned(stored), JSON.stringify(stored)).toBe("GENERAL_OR_CLASS_ONLY");
  }
});
