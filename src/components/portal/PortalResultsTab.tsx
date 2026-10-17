"use client";

import React, { useState } from "react";
import type { PortalStudentRecord } from "./PortalLoginCard";

interface ReportCardResult {
  id: string;
  subjectName: string;
  caTotal: number;
  examScore: number;
  total: number;
  maxScore: number;
  gradeLetter: string;
  gradeRemark: string;
  verificationToken?: string | null;
}

interface ReportCard {
  period: {
    id: string;
    label: string;
    session: { label: string };
  };
  classArm: { name: string };
  results: ReportCardResult[];
  remarks: {
    teacherRemark: string | null;
    principalRemark: string | null;
  };
  totalScore: number;
  average: number;
  subjectCount: number;
}

interface PortalResultsTabProps {
  reportCards: ReportCard[];
  student: PortalStudentRecord;
}

export function PortalResultsTab({ reportCards, student }: PortalResultsTabProps) {
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>(
    reportCards[0]?.period.id || ""
  );

  if (reportCards.length === 0) {
    return (
      <div className="bg-surface border border-line rounded-2xl p-12 text-center shadow-sm">
        <div className="w-12 h-12 rounded-2xl bg-surface-2 text-fg-muted mx-auto flex items-center justify-center mb-3">
          <svg
            className="w-6 h-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        </div>
        <h3 className="text-base font-bold text-fg">No Published Results Found</h3>
        <p className="text-xs text-fg-muted mt-1 max-w-sm mx-auto">
          Academic results for this student have not yet been published or approved for the current session.
        </p>
      </div>
    );
  }

  const activeCard =
    reportCards.find((c) => c.period.id === selectedPeriodId) || reportCards[0];

  return (
    <div className="space-y-6">
      {/* Term Selector & Print Action */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-surface border border-line rounded-2xl p-4 shadow-sm print:hidden">
        <div className="flex items-center gap-3">
          <label htmlFor="periodSelect" className="text-xs font-semibold text-fg-muted whitespace-nowrap">
            Select Academic Term:
          </label>
          <select
            id="periodSelect"
            value={activeCard.period.id}
            onChange={(e) => setSelectedPeriodId(e.target.value)}
            className="px-3.5 py-1.5 rounded-xl bg-surface-2 border border-line text-fg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
          >
            {reportCards.map((c) => (
              <option key={c.period.id} value={c.period.id}>
                {c.period.session.label} · {c.period.label} ({c.classArm.name})
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => window.print()}
          className="px-4 py-2 rounded-xl bg-surface-2 hover:bg-line border border-line text-fg text-xs font-semibold transition-colors flex items-center gap-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-brand"
        >
          <svg
            className="w-4 h-4 text-fg-muted"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
            />
          </svg>
          Print Report Card
        </button>
      </div>

      {/* Official Report Card Sheet */}
      <div className="bg-surface border border-line rounded-2xl p-6 sm:p-8 shadow-card-v text-fg print:border-none print:shadow-none print:p-0">
        {/* Header */}
        <div className="text-center border-b border-line pb-6 mb-6">
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-fg uppercase">
            {student.branch.name}
          </h2>
          <p className="text-xs font-medium text-fg-muted mt-0.5">
            Student Terminal Academic Progress Report
          </p>
          <div className="inline-flex items-center gap-3 mt-3 px-3 py-1 rounded-full bg-surface-2 border border-line text-fg text-xs font-semibold">
            <span>{activeCard.period.session.label} Session</span>
            <span>·</span>
            <span>{activeCard.period.label}</span>
          </div>
        </div>

        {/* Student Meta Details */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-surface-2 p-4 rounded-xl border border-line mb-6 text-xs">
          <div>
            <span className="text-fg-muted block uppercase text-[10px] font-semibold tracking-wider">
              Student Name
            </span>
            <span className="font-bold text-fg mt-0.5 block">
              {student.firstName} {student.lastName}
            </span>
          </div>
          <div>
            <span className="text-fg-muted block uppercase text-[10px] font-semibold tracking-wider">
              Admission No
            </span>
            <span className="font-bold text-fg mt-0.5 block">
              {student.admissionNo}
            </span>
          </div>
          <div>
            <span className="text-fg-muted block uppercase text-[10px] font-semibold tracking-wider">
              Class & Arm
            </span>
            <span className="font-bold text-fg mt-0.5 block">
              {activeCard.classArm.name}
            </span>
          </div>
          <div>
            <span className="text-fg-muted block uppercase text-[10px] font-semibold tracking-wider">
              Term Average
            </span>
            <span className="font-black text-brand-fg mt-0.5 block text-sm">
              {activeCard.average}%
            </span>
          </div>
        </div>

        {/* Results Table */}
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-surface-2 border-b border-line text-fg-muted font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Subject</th>
                <th className="py-3 px-4 text-center">CA</th>
                <th className="py-3 px-4 text-center">Exam</th>
                <th className="py-3 px-4 text-center">Total</th>
                <th className="py-3 px-4 text-center">Grade</th>
                <th className="py-3 px-4">Remark</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {activeCard.results.map((res) => (
                <tr key={res.id} className="hover:bg-surface-2/50 transition-colors">
                  <td className="py-3 px-4 font-medium text-fg">{res.subjectName}</td>
                  <td className="py-3 px-4 text-center text-fg-2">{res.caTotal}</td>
                  <td className="py-3 px-4 text-center text-fg-2">{res.examScore}</td>
                  <td className="py-3 px-4 text-center font-bold text-fg">{res.total}</td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`inline-flex items-center justify-center w-7 h-6 rounded-md font-black text-xs ${
                        ["A", "A1", "B", "B2", "B3"].some((g) => res.gradeLetter.startsWith(g))
                          ? "bg-ok-bg text-ok-fg"
                          : ["C", "C4", "C5", "C6"].some((g) => res.gradeLetter.startsWith(g))
                          ? "bg-info-bg text-info-fg"
                          : ["D", "E"].some((g) => res.gradeLetter.startsWith(g))
                          ? "bg-warn-bg text-warn-fg"
                          : "bg-danger-bg text-danger-text"
                      }`}
                    >
                      {res.gradeLetter}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-fg-muted">{res.gradeRemark}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-surface-2 font-bold text-fg border-t border-line">
                <td className="py-3 px-4">
                  Summary ({activeCard.subjectCount} Subjects)
                </td>
                <td colSpan={2} className="py-3 px-4 text-right text-fg-muted font-normal">
                  Cumulative Total:
                </td>
                <td className="py-3 px-4 text-center font-black text-sm">
                  {activeCard.totalScore}
                </td>
                <td colSpan={2} className="py-3 px-4 font-black text-brand-fg">
                  Term Average: {activeCard.average}%
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Remarks Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <div className="p-4 rounded-xl border border-line bg-surface-2">
            <span className="text-xs font-bold text-fg-muted uppercase tracking-wider block mb-1">
              Class Teacher&apos;s Remark
            </span>
            <p className="text-xs text-fg leading-relaxed italic">
              &quot;{activeCard.remarks.teacherRemark || "Commendable performance and active classroom participation."}&quot;
            </p>
          </div>

          <div className="p-4 rounded-xl border border-line bg-surface-2">
            <span className="text-xs font-bold text-fg-muted uppercase tracking-wider block mb-1">
              Principal&apos;s Remark
            </span>
            <p className="text-xs text-fg leading-relaxed italic">
              &quot;{activeCard.remarks.principalRemark || "Promising results. Keep working hard in subsequent terms."}&quot;
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
