"use client";

import { useState } from "react";
import { ALUMNI_FIELDS, type Alumnus } from "@/lib/school-site/alumni";
import { SiteIcon } from "./icons";

/// The alumni list with a filter by field. With no records (the list is empty until the school confirms real people) it says so; the filter appears only when there is something to filter.
export function AlumniGrid({ alumni }: { alumni: Alumnus[] }) {
  const [field, setField] = useState<string>("all");
  const shown = field === "all" ? alumni : alumni.filter((a) => a.field === field);

  if (alumni.length === 0) {
    return (
      <div className="rounded-[15px] bg-white px-6 py-16 text-center shadow-[0_4px_12px_rgba(0,0,0,0.12)]">
        <SiteIcon name="award" className="mx-auto mb-4 size-12 text-[#2a7f4f]" />
        <h3 className="mb-2 text-xl font-bold">Alumni Records Coming Soon</h3>
        <p className="text-[#666]">We are compiling achievements of our distinguished former students.</p>
      </div>
    );
  }
  return (
    <div>
      <div role="group" aria-label="Filter by field" className="mb-8 flex flex-wrap items-center justify-center gap-3">
        {[{ value: "all", label: "All Fields" }, ...ALUMNI_FIELDS].map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={field === f.value}
            onClick={() => setField(f.value)}
            className={`rounded-full border-2 border-[#2a7f4f] px-5 py-2 font-semibold transition-colors ${field === f.value ? "bg-[#2a7f4f] text-white" : "bg-white text-[#2a7f4f] hover:bg-[#2a7f4f]/10"}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((a) => (
          <li key={a.name} className="rounded-[15px] bg-white p-6 shadow-[0_4px_12px_rgba(0,0,0,0.12)]">
            <p className="mb-1 text-sm font-semibold text-[#2a7f4f]">
              Class of {a.year} · {ALUMNI_FIELDS.find((f) => f.value === a.field)?.label}
            </p>
            <h3 className="mb-2 text-lg font-bold">{a.name}</h3>
            <p className="flex items-start gap-2 text-sm text-[#555]">
              <SiteIcon name="star" className="mt-0.5 size-4 shrink-0 text-[#2a7f4f]" />
              {a.achievement}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
