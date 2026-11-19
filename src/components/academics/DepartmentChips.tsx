"use client";

import { Pill } from "@/components/academics/StaffDetails";
import type { StaffDepartment } from "@/components/academics/staff-model";

// The departments a person is in, drawn on the staff card and row (task 0101 D7): one label per department and an "HOD" label beside each department they head. Nothing while the branch
// does not use departments or the person is in none. Presentation only: the staff API sends `departments`, the branch's switch decides whether they are shown.

const hod = (
  <Pill tone="ok">
    <abbr title="Head of department" className="no-underline">
      HOD
    </abbr>
  </Pill>
);

/// For a card: a group under the name. (Not a list: the staff list's own items are counted by their role.)
export function DepartmentChips({ departments, on }: { departments: readonly StaffDepartment[]; on: boolean }) {
  if (!on || departments.length === 0) return null;
  return (
    <div role="group" aria-label="Departments" className="mt-2 flex flex-wrap items-center gap-1.5">
      {departments.map((d) => (
        <span key={d.id} className="inline-flex items-center gap-1">
          <Pill tone="neutral">{d.name}</Pill>
          {d.isHead && hod}
        </span>
      ))}
    </div>
  );
}

/// For a row: the same labels among the row's other badges.
export function DepartmentBadges({ departments, on }: { departments: readonly StaffDepartment[]; on: boolean }) {
  if (!on || departments.length === 0) return null;
  return (
    <>
      {departments.map((d) => (
        <span key={d.id} className="inline-flex items-center gap-1">
          <Pill tone="neutral">{d.name}</Pill>
          {d.isHead && hod}
        </span>
      ))}
    </>
  );
}
