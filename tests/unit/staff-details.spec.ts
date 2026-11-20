import { expect, test } from "@playwright/test";
import {
  NO_STAFF_FILTERS,
  activeStaffFilters,
  displayName,
  filterStaff,
  roleLine,
  type StaffLike,
} from "@/components/academics/staff-model";
import { actionLook } from "@/components/ui/action-look";
import { mapTable } from "@/lib/bulk/table";
import { staffColumns, staffRowSchema } from "@/lib/bulk/staff";
import { staffDetail, staffGender, staffRole, staffTitle } from "@/lib/academics/staff-rules";

// Task 0111 (the maintainer, 2026-11-19): a staff record's title (Mr, Mrs…), gender, job title for non-teaching staff, qualification and NYSC corps member flag; the staff list's
// filters (kind, gender, corps member, sign-in, standing); the line under a name; the bulk file's new columns; and a menu where Terminate has an icon and Manage is not a pencil.

const person = (over: Partial<StaffLike> = {}): StaffLike => ({
  category: "TEACHING",
  gender: null,
  corpsMember: false,
  designation: null,
  qualification: null,
  role: null,
  standing: "ACTIVE",
  account: { state: "none" },
  ...over,
});

test.describe("the staff list's filters", () => {
  const rows = [
    person({ category: "TEACHING", gender: "FEMALE", corpsMember: true }),
    person({ category: "NON_TEACHING", gender: "MALE", account: { state: "linked" }, designation: "Bursar" }),
    person({ category: "TEACHING", gender: null, standing: "SUSPENDED" }),
  ];

  test("nothing set: everyone; each filter narrows; they combine", () => {
    expect(filterStaff(rows, NO_STAFF_FILTERS)).toHaveLength(3);
    expect(filterStaff(rows, { ...NO_STAFF_FILTERS, kind: "NON_TEACHING" })).toEqual([rows[1]]);
    expect(filterStaff(rows, { ...NO_STAFF_FILTERS, gender: "FEMALE" })).toEqual([rows[0]]);
    expect(filterStaff(rows, { ...NO_STAFF_FILTERS, gender: "NONE" })).toEqual([rows[2]]); // "not given"
    expect(filterStaff(rows, { ...NO_STAFF_FILTERS, corps: "yes" })).toEqual([rows[0]]);
    expect(filterStaff(rows, { ...NO_STAFF_FILTERS, corps: "no" })).toEqual([rows[1], rows[2]]);
    expect(filterStaff(rows, { ...NO_STAFF_FILTERS, signIn: "yes" })).toEqual([rows[1]]);
    expect(filterStaff(rows, { ...NO_STAFF_FILTERS, standing: "SUSPENDED" })).toEqual([rows[2]]);
    expect(filterStaff(rows, { ...NO_STAFF_FILTERS, kind: "TEACHING", corps: "no" })).toEqual([rows[2]]);
  });

  test("the count of filters set", () => {
    expect(activeStaffFilters(NO_STAFF_FILTERS)).toBe(0);
    expect(activeStaffFilters({ ...NO_STAFF_FILTERS, kind: "TEACHING", corps: "yes" })).toBe(2);
  });
});

test("the name begins with the title; the line under it is the job title of a non-teaching member, else the kind, then the qualification; role is appended after the base", () => {
  expect(displayName({ title: "Mrs", firstName: "Amina", lastName: "Yusuf" })).toBe("Mrs Amina Yusuf");
  expect(displayName({ title: null, firstName: "Amina", lastName: "Yusuf" })).toBe("Amina Yusuf");
  expect(roleLine({ category: "NON_TEACHING", designation: "Bursar", qualification: null, role: null })).toBe("Bursar");
  expect(roleLine({ category: "NON_TEACHING", designation: null, qualification: "OND", role: null })).toBe("Non-teaching · OND");
  expect(roleLine({ category: "TEACHING", designation: "ignored for a teacher", qualification: "B.Ed. Mathematics", role: null })).toBe(
    "Teaching · B.Ed. Mathematics",
  );
  // role label is shown between base and qualification
  expect(roleLine({ category: "TEACHING", designation: null, qualification: null, role: "Head of Science" })).toBe(
    "Teaching · Head of Science",
  );
  expect(roleLine({ category: "TEACHING", designation: null, qualification: "B.Ed.", role: "Form Tutor" })).toBe(
    "Teaching · Form Tutor · B.Ed.",
  );
});

test("the field rules the form, the API and the bulk file share: a title is at most 30 characters, a job title or qualification at most 120, trimmed; a role label at most 80; gender is Male or Female", () => {
  expect(staffTitle.parse(" Mallam ")).toBe("Mallam");
  expect(staffTitle.safeParse("x".repeat(31)).success).toBe(false);
  expect(staffDetail.parse("  B.Ed. Mathematics ")).toBe("B.Ed. Mathematics");
  expect(staffDetail.safeParse("x".repeat(121)).success).toBe(false);
  expect(staffRole.parse(" Head of Science ")).toBe("Head of Science");
  expect(staffRole.safeParse("x".repeat(81)).success).toBe(false);
  expect(staffGender.safeParse("MALE").success).toBe(true);
  expect(staffGender.safeParse("OTHER").success).toBe(false);
});

test.describe("the bulk staff file", () => {
  test("new optional columns, after the old ones: Title, Gender, Job title, Qualification, Corps member; Role and Position are other names for Job title", () => {
    expect(staffColumns.map((c) => c.label)).toEqual([
      "Category",
      "First name",
      "Last name",
      "Phone",
      "Email",
      "Title",
      "Gender",
      "Job title",
      "Qualification",
      "Corps member",
      "Department",
    ]);
    const t = mapTable(
      [
        ["Title", "First name", "Surname", "Category", "Sex", "Role", "Qualification", "NYSC"],
        ["Mrs", "Amina", "Yusuf", "NT", "F", "Bursar", "HND", "Yes"],
        ["", "Bala", "Musa", "Teaching", "", "", "", ""],
      ],
      staffColumns,
    );
    expect(t.problems).toEqual([]);
    expect(t.rows[0].values).toMatchObject({ title: "Mrs", gender: "F", designation: "Bursar", qualification: "HND", corpsMember: "Yes" });
    const amina = staffRowSchema.safeParse(t.rows[0].values);
    expect(amina.success).toBe(true);
    expect(amina.data).toMatchObject({
      category: "NON_TEACHING",
      title: "Mrs",
      gender: "FEMALE",
      designation: "Bursar",
      qualification: "HND",
      corpsMember: true,
    });
    const bala = staffRowSchema.safeParse(t.rows[1].values);
    expect(bala.success).toBe(true);
    expect(bala.data?.corpsMember).toBeUndefined(); // an empty cell is absent, as in every optional column; the save stores it as No
    expect(bala.data?.title).toBeUndefined();
  });

  test("Corps member takes Yes/No, Y/N, True/False, 1/0 in any capitals; anything else is refused", () => {
    const row = (corpsMember: unknown) => staffRowSchema.safeParse({ category: "Teaching", firstName: "A", lastName: "B", corpsMember });
    for (const yes of ["Yes", "y", "TRUE", "1", true, 1]) expect(row(yes).data?.corpsMember, String(yes)).toBe(true);
    for (const no of ["No", "n", "false", "0", false, 0]) expect(row(no).data?.corpsMember, String(no)).toBe(false);
    expect(row("").data?.corpsMember).toBeUndefined();
    expect(row("maybe").success).toBe(false);
  });
});

test.describe("the row menu's icons", () => {
  // The icon's component name, read off `type` directly: in this runner the element objects come from Playwright's own JSX runtime, so React's isValidElement says no.
  const iconName = (id: string) => (actionLook({ id }).icon as { type?: { name?: string } } | null)?.type?.name ?? null;

  test("Terminate has an icon and is red; Expel and Withdraw share it (a person leaves, nothing is deleted); Remove keeps the bin", () => {
    expect(actionLook({ id: "terminate" }).tone).toBe("danger");
    expect(iconName("terminate")).toBe("LogOutIcon");
    expect(iconName("expel")).toBe("LogOutIcon");
    expect(iconName("withdraw")).toBe("LogOutIcon");
    expect(iconName("remove")).toBe("TrashIcon");
  });

  test("Manage is not a pencil like Edit; View is an eye", () => {
    expect(iconName("manage")).toBe("SlidersIcon");
    expect(iconName("edit")).toBe("PencilIcon");
    expect(iconName("view")).toBe("EyeIcon");
  });
});
