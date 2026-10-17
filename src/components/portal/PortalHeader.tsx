"use client";

import React from "react";

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  admissionNo: string;
  branch: { id: string; name: string };
  enrollments?: Array<{
    className: string;
    arm: string | null;
  }>;
}

interface PortalHeaderProps {
  students: Student[];
  selectedStudentId: string;
  onSelectStudent: (studentId: string) => void;
  onSignOut: () => void;
}

export function PortalHeader({ students, selectedStudentId, onSelectStudent, onSignOut }: PortalHeaderProps) {
  const currentStudent = students.find((s) => s.id === selectedStudentId) || students[0];

  return (
    <header className="w-full bg-surface border-b border-line px-4 sm:px-8 py-3.5 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Brand & Active Branch */}
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-brand-strong text-brand-contrast flex items-center justify-center font-bold text-base shadow-xs">
              AE
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-fg tracking-tight text-sm sm:text-base">AlEemaan Portal</span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-surface-2 text-fg border border-line">
                  {currentStudent?.branch.name || "School"}
                </span>
              </div>
              <p className="text-xs text-fg-muted">Student & Guardian Self-Service</p>
            </div>
          </div>

          {/* Mobile Sign Out */}
          <button
            type="button"
            onClick={onSignOut}
            className="sm:hidden px-2.5 py-1 text-xs font-medium text-danger-text hover:bg-danger-bg rounded-lg border border-danger-line transition-colors"
          >
            Sign Out
          </button>
        </div>

        {/* Multi-Child Sibling Selector & Desktop Sign Out */}
        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          {students.length > 1 && (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <label htmlFor="siblingSelect" className="text-xs font-medium text-fg-muted whitespace-nowrap hidden md:inline">
                Viewing Child:
              </label>
              <select
                id="siblingSelect"
                value={selectedStudentId}
                onChange={(e) => onSelectStudent(e.target.value)}
                className="w-full sm:w-auto px-3 py-1.5 rounded-xl bg-surface-2 border border-line text-fg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
                aria-label="Select student to view"
              >
                {students.map((s) => {
                  const enrollment = s.enrollments?.[0];
                  const classLabel = enrollment ? `${enrollment.className} ${enrollment.arm || ""}` : "";
                  return (
                    <option key={s.id} value={s.id}>
                      {s.firstName} {s.lastName} ({s.admissionNo}) {classLabel ? `· ${classLabel}` : ""}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          <button
            type="button"
            onClick={onSignOut}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-fg-muted hover:text-danger-text hover:bg-danger-bg rounded-xl border border-line transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"
              />
            </svg>
            Sign Out
          </button>
        </div>
      </div>
    </header>
  );
}
