import { expect, test } from "@playwright/test";
import {
  DEPARTMENT_NAME_MAX,
  departmentName,
  descriptionOrNull,
  headChange,
  headLine,
  mayDoToDepartment,
  peopleText,
  subjectsText,
  type DepartmentAction,
} from "@/lib/academics/department-rules";
import { resolveUsesDepartments } from "@/lib/academics/departments-setting";
import {
  NO_STAFF_FILTERS,
  activeStaffFilters,
  departmentFilterOptions,
  departmentsText,
  filterStaff,
  type StaffLike,
} from "@/components/academics/staff-model";

// Task 0101 D7 (departments and heads of department), the rules that need no database: the name, who may do what, what choosing a head changes, the switch's safe reading, and the staff
// list's department filter.

const person = (over: Partial<StaffLike> = {}): StaffLike => ({
  category: "TEACHING",
  gender: null,
  corpsMember: false,
  designation: null,
  qualification: null,
  role: null,
  standing: "ACTIVE",
  account: { state: "none" },
  departments: [],
  ...over,
});

test.describe("a department's name", () => {
  test("is trimmed and its inner spaces collapsed", () => {
    expect(departmentName.parse("  Arabic   and  Islamic Studies ")).toBe("Arabic and Islamic Studies");
  });
  test("is 1 to 80 characters", () => {
    expect(departmentName.safeParse("   ").success).toBe(false);
    expect(departmentName.safeParse("").success).toBe(false);
    expect(departmentName.safeParse("x".repeat(DEPARTMENT_NAME_MAX)).success).toBe(true);
    expect(departmentName.safeParse("x".repeat(DEPARTMENT_NAME_MAX + 1)).success).toBe(false);
    // spaces that collapse are not counted twice
    expect(departmentName.safeParse(`${"x".repeat(40)}${" ".repeat(60)}${"y".repeat(39)}`).success).toBe(true);
  });
  test("a blank description is not stored", () => {
    expect(descriptionOrNull("  ")).toBeNull();
    expect(descriptionOrNull(null)).toBeNull();
    expect(descriptionOrNull(undefined)).toBeNull();
    expect(descriptionOrNull(" Sciences and maths ")).toBe("Sciences and maths");
  });
});

test.describe("who may do what to a department", () => {
  const ALL: DepartmentAction[] = ["read", "members", "subjects", "rename", "archive", "head", "switch"];
  const may = (who: Parameters<typeof mayDoToDepartment>[0]) => ALL.filter((a) => mayDoToDepartment(who, a));

  test("an administrator does everything", () => {
    expect(may({ administers: true, staff: true, headOfThis: false })).toEqual(ALL);
  });
  test("the head of THIS department reads and changes its members and subjects, nothing else", () => {
    expect(may({ administers: false, staff: true, headOfThis: true })).toEqual(["read", "members", "subjects"]);
  });
  test("another member of staff only reads", () => {
    expect(may({ administers: false, staff: true, headOfThis: false })).toEqual(["read"]);
  });
  test("someone with no staff role in the branch can do nothing, even if the head flag were somehow true", () => {
    expect(may({ administers: false, staff: false, headOfThis: false })).toEqual([]);
    expect(may({ administers: false, staff: false, headOfThis: true })).toEqual([]);
  });
});

test.describe("choosing a head", () => {
  const members = [
    { staffRecordId: "a", isHead: true },
    { staffRecordId: "b", isHead: false },
  ];
  test("another member replaces the head; the old head stays a member", () => {
    expect(headChange(members, "b")).toEqual({ oldHeadId: "a", newHeadId: "b", changed: true, addsMember: false });
  });
  test("someone who is not yet a member becomes one", () => {
    expect(headChange(members, "c")).toEqual({ oldHeadId: "a", newHeadId: "c", changed: true, addsMember: true });
  });
  test("choosing the head again changes nothing", () => {
    expect(headChange(members, "a").changed).toBe(false);
  });
  test("no head to start with, and removing the head", () => {
    expect(headChange([{ staffRecordId: "a", isHead: false }], "a")).toEqual({
      oldHeadId: null,
      newHeadId: "a",
      changed: true,
      addsMember: false,
    });
    expect(headChange(members, null)).toEqual({ oldHeadId: "a", newHeadId: null, changed: true, addsMember: false });
    expect(headChange([], null).changed).toBe(false);
  });
});

test("the words", () => {
  expect(headLine("Mrs Amina Yusuf")).toBe("HOD: Mrs Amina Yusuf");
  expect(headLine(null)).toBe("No head yet");
  expect(peopleText(1)).toBe("1 person");
  expect(peopleText(3)).toBe("3 people");
  expect(subjectsText(1)).toBe("1 subject");
  expect(subjectsText(2)).toBe("2 subjects");
});

test("only exactly true switches departments on (a damaged value hides the feature, never shows it)", () => {
  expect(resolveUsesDepartments(true)).toBe(true);
  for (const bad of [false, null, undefined, "true", 1, {}, []]) expect(resolveUsesDepartments(bad)).toBe(false);
});

test.describe("the staff list's department filter", () => {
  const sciences = { id: "d1", name: "Sciences", isHead: true };
  const languages = { id: "d2", name: "Languages", isHead: false };
  const rows = [
    person({ departments: [sciences, languages] }),
    person({ departments: [languages] }),
    person({ departments: [] }),
    person({ departments: undefined }),
  ];

  test("a department, or no department", () => {
    expect(filterStaff(rows, { ...NO_STAFF_FILTERS, department: "d1" })).toEqual([rows[0]]);
    expect(filterStaff(rows, { ...NO_STAFF_FILTERS, department: "d2" })).toEqual([rows[0], rows[1]]);
    expect(filterStaff(rows, { ...NO_STAFF_FILTERS, department: "NONE" })).toEqual([rows[2], rows[3]]);
    expect(filterStaff(rows, NO_STAFF_FILTERS)).toHaveLength(4);
  });
  test("it counts as one filter, with the others", () => {
    expect(activeStaffFilters({ ...NO_STAFF_FILTERS, department: "d1" })).toBe(1);
    expect(activeStaffFilters({ ...NO_STAFF_FILTERS, department: "d1", kind: "TEACHING" })).toBe(2);
  });
  test("the options are the departments someone is in, by name, then No department", () => {
    expect(departmentFilterOptions(rows)).toEqual([
      { value: "", label: "Every department" },
      { value: "d2", label: "Languages" },
      { value: "d1", label: "Sciences" },
      { value: "NONE", label: "No department" },
    ]);
    expect(departmentFilterOptions([])).toEqual([
      { value: "", label: "Every department" },
      { value: "NONE", label: "No department" },
    ]);
  });
  test("the departments as text: the head's first, marked", () => {
    expect(departmentsText([languages, sciences])).toBe("Sciences (head), Languages");
    expect(departmentsText([])).toBe("");
  });
});
