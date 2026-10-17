"use client";

import React from "react";
import type { PortalStudentRecord } from "./PortalLoginCard";

interface PortalOverviewTabProps {
  overview: {
    student: PortalStudentRecord;
    attendance: {
      totalDays: number;
      presentDays: number;
      lateDays: number;
      absentDays: number;
      percentage: number;
      recent: Array<{ status: string; date: string }>;
    };
    finance: {
      totalInvoiced: number;
      totalPaid: number;
      outstandingBalance: number;
      hasOutstanding: boolean;
    };
    announcements: Array<{
      id: string;
      title: string;
      body: string;
      publishedAt: string;
    }>;
  };
  onNavigateTab: (tabId: "results" | "finance" | "lms") => void;
}

export function PortalOverviewTab({ overview, onNavigateTab }: PortalOverviewTabProps) {
  const { student, attendance, finance, announcements } = overview;
  const enrollment = student.enrollments?.[0];

  return (
    <div className="space-y-6">
      {/* Student Profile Card */}
      <div className="bg-surface border border-line rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-brand-strong text-brand-contrast flex items-center justify-center font-bold text-2xl shrink-0 shadow-xs">
            {student.firstName[0]}
            {student.lastName[0]}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-fg">
                {student.firstName} {student.lastName}
              </h2>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-surface-2 text-fg-2 border border-line">
                {student.admissionNo}
              </span>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-surface-2 text-fg-muted border border-line capitalize">
                {student.gender.toLowerCase()}
              </span>
            </div>
            <p className="text-sm text-fg-muted mt-1">
              {enrollment ? (
                <>
                  <span className="font-medium text-fg">
                    {enrollment.className} {enrollment.arm || ""}
                  </span>{" "}
                  · {enrollment.session.label} Session
                </>
              ) : (
                "Enrollment record pending"
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto">
          <button
            type="button"
            onClick={() => onNavigateTab("results")}
            className="flex-1 md:flex-none px-4 py-2 rounded-xl bg-brand-strong hover:bg-brand-strong-hover text-brand-contrast text-xs font-semibold transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-brand"
          >
            View Report Card
          </button>
          <button
            type="button"
            onClick={() => onNavigateTab("finance")}
            className="flex-1 md:flex-none px-4 py-2 rounded-xl bg-surface-2 hover:bg-line border border-line text-fg text-xs font-semibold transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-brand"
          >
            Fees & Billing
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Attendance KPI */}
        <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-fg-muted text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Attendance Rate</span>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                attendance.percentage >= 80 ? "bg-ok-bg text-ok-fg" : "bg-warn-bg text-warn-fg"
              }`}
            >
              {attendance.percentage}%
            </span>
          </div>
          <div className="text-2xl font-black text-fg mt-1">
            {attendance.presentDays} <span className="text-sm font-medium text-fg-muted">/ {attendance.totalDays} Days Present</span>
          </div>
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-line text-xs text-fg-muted">
            <span>
              Absent: <strong className="text-fg">{attendance.absentDays}</strong>
            </span>
            <span>
              Late: <strong className="text-fg">{attendance.lateDays}</strong>
            </span>
          </div>
        </div>

        {/* Finance KPI */}
        <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-fg-muted text-xs font-semibold uppercase tracking-wider mb-2">
            <span>School Fee Balance</span>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                finance.outstandingBalance === 0 ? "bg-ok-bg text-ok-fg" : "bg-danger-bg text-danger-text"
              }`}
            >
              {finance.outstandingBalance === 0 ? "Clear" : "Balance Due"}
            </span>
          </div>
          <div className="text-2xl font-black text-fg mt-1">₦{finance.outstandingBalance.toLocaleString()}</div>
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-line text-xs text-fg-muted">
            <span>
              Paid: <strong className="text-fg">₦{finance.totalPaid.toLocaleString()}</strong>
            </span>
            <span>
              Total: <strong className="text-fg">₦{finance.totalInvoiced.toLocaleString()}</strong>
            </span>
          </div>
        </div>

        {/* Academic Session KPI */}
        <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm sm:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between text-fg-muted text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Academic Standing</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-info-bg text-info-fg">Active Term</span>
          </div>
          <div className="text-lg font-bold text-fg mt-1">
            {enrollment?.className || "Class"} {enrollment?.arm || ""}
          </div>
          <p className="text-xs text-fg-muted mt-1">Branch: {student.branch.name}</p>
          <div className="mt-3 pt-3 border-t border-line text-xs text-fg-muted flex items-center justify-between">
            <span>
              Guardian: <strong className="text-fg">{student.guardianName || "N/A"}</strong>
            </span>
            <button
              type="button"
              onClick={() => onNavigateTab("lms")}
              className="text-xs font-semibold text-brand-fg hover:underline cursor-pointer"
            >
              LMS Homework →
            </button>
          </div>
        </div>
      </div>

      {/* Announcements */}
      <div className="bg-surface border border-line rounded-2xl p-5 sm:p-6 shadow-sm">
        <h3 className="text-base font-bold text-fg mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-brand-fg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"
            />
          </svg>
          School Announcements
        </h3>

        {announcements.length === 0 ? (
          <p className="text-sm text-fg-muted py-4 text-center">No active announcements broadcast at this time.</p>
        ) : (
          <div className="divide-y divide-line">
            {announcements.map((ann) => (
              <div key={ann.id} className="py-3.5 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-fg">{ann.title}</h4>
                  <span className="text-xs text-fg-muted whitespace-nowrap">
                    {new Date(ann.publishedAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
                <p className="text-xs text-fg-2 mt-1 leading-relaxed">{ann.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
