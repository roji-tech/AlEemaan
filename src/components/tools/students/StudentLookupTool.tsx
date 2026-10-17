"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getJson } from "@/components/auth/postJson";

interface StudentApiItem {
  id: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  gender: string;
  admissionNo: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  guardianEmail?: string | null;
  branch?: { id: string; name: string } | null;
  enrollments?: Array<{
    className?: string | null;
    arm?: string | null;
    session?: { label: string } | null;
  }>;
}

export function StudentLookupTool() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [students, setStudents] = useState<StudentApiItem[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentApiItem | null>(null);

  const visibleStudents = searchQuery.trim().length >= 2 ? students : [];

  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await getJson(
          `/api/v1/students?q=${encodeURIComponent(searchQuery.trim())}&status=live&limit=10`,
        );
        if (res.ok && res.data && typeof res.data === "object" && "students" in res.data) {
          setStudents((res.data as { students: StudentApiItem[] }).students);
        }
      } catch {
        // Ignore network errors in search
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  if (selectedStudent) {
    const fullName = [
      selectedStudent.firstName,
      selectedStudent.middleName,
      selectedStudent.lastName,
    ]
      .filter(Boolean)
      .join(" ");

    const activeEnrollment = selectedStudent.enrollments?.[0];

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-line pb-2">
          <span className="text-xs font-bold text-fg">Student Profile</span>
          <button
            type="button"
            onClick={() => setSelectedStudent(null)}
            className="text-xs font-semibold text-brand hover:underline"
          >
            ← Back to search
          </button>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-4 space-y-3 text-xs">
          <div>
            <h3 className="text-sm font-bold text-fg">{fullName}</h3>
            <p className="font-mono text-fg-muted text-[11px]">
              {selectedStudent.admissionNo || "No Admission Number"}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 border-t border-line pt-2 text-[11px]">
            <div>
              <span className="text-fg-muted block">Branch:</span>
              <span className="font-semibold text-fg">
                {selectedStudent.branch?.name || "Main Branch"}
              </span>
            </div>
            <div>
              <span className="text-fg-muted block">Gender:</span>
              <span className="font-semibold text-fg">{selectedStudent.gender}</span>
            </div>
            {activeEnrollment && (
              <>
                <div>
                  <span className="text-fg-muted block">Class & Arm:</span>
                  <span className="font-semibold text-fg">
                    {activeEnrollment.className || "—"} {activeEnrollment.arm || ""}
                  </span>
                </div>
                <div>
                  <span className="text-fg-muted block">Session:</span>
                  <span className="font-semibold text-fg">
                    {activeEnrollment.session?.label || "Active"}
                  </span>
                </div>
              </>
            )}
          </div>

          {(selectedStudent.guardianName || selectedStudent.guardianPhone) && (
            <div className="border-t border-line pt-2 text-[11px] space-y-1">
              <span className="text-fg-muted font-semibold block">Guardian Information:</span>
              {selectedStudent.guardianName && (
                <p className="text-fg">{selectedStudent.guardianName}</p>
              )}
              {selectedStudent.guardianPhone && (
                <p>
                  <a
                    href={`tel:${selectedStudent.guardianPhone}`}
                    className="font-mono text-brand hover:underline"
                  >
                    📞 {selectedStudent.guardianPhone}
                  </a>
                </p>
              )}
              {selectedStudent.guardianEmail && (
                <p>
                  <a
                    href={`mailto:${selectedStudent.guardianEmail}`}
                    className="font-mono text-brand hover:underline"
                  >
                    ✉️ {selectedStudent.guardianEmail}
                  </a>
                </p>
              )}
            </div>
          )}
        </div>

        <div className="pt-1">
          <Link
            href={`/students/${selectedStudent.id}`}
            className="flex w-full items-center justify-center rounded-xl bg-brand py-2 text-xs font-semibold text-white hover:bg-brand/90 transition-colors"
          >
            Open Full Student File →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <label htmlFor="student-lookup-input" className="sr-only">
          Search student by name or admission number
        </label>
        <input
          id="student-lookup-input"
          type="search"
          placeholder="Search student by name or admission #..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-xl border border-line bg-canvas px-4 py-2.5 text-xs text-fg placeholder:text-fg-muted focus:border-brand-strong focus:outline-none"
          autoFocus
        />
        {searching && (
          <span className="absolute right-3 top-3 text-[11px] text-fg-muted">Searching...</span>
        )}
      </div>

      {visibleStudents.length > 0 && (
        <div className="max-h-64 overflow-y-auto rounded-xl border border-line bg-surface divide-y divide-line shadow-sm">
          {visibleStudents.map((s) => {
            const fullName = [s.firstName, s.middleName, s.lastName].filter(Boolean).join(" ");
            const arm = s.enrollments?.[0]?.arm;
            const cls = s.enrollments?.[0]?.className;

            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedStudent(s)}
                className="flex w-full items-center justify-between p-3 text-left text-xs transition-colors hover:bg-surface-2/60"
              >
                <div>
                  <p className="font-semibold text-fg">{fullName}</p>
                  <p className="text-[11px] font-mono text-fg-muted">
                    {s.admissionNo || "No ID"} {cls ? `· ${cls} ${arm || ""}` : ""}
                  </p>
                </div>
                {s.branch?.name && (
                  <span className="rounded-md bg-surface-2 px-2 py-0.5 text-[10px] text-fg-muted">
                    {s.branch.name}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {searchQuery.length >= 2 && !searching && visibleStudents.length === 0 && (
        <div className="rounded-xl border border-line bg-surface p-6 text-center text-xs text-fg-muted">
          No students found matching &quot;{searchQuery}&quot;.
        </div>
      )}

      {searchQuery.length < 2 && (
        <div className="rounded-xl border border-line bg-canvas p-6 text-center text-xs text-fg-muted">
          Type at least 2 letters or numbers to search student records.
        </div>
      )}
    </div>
  );
}
