"use client";

import React, { useState } from "react";
import { downloadReportCardHtml } from "@/lib/academics/report-card-export";
import { ReportCard, type Card } from "@/components/results/ReportCard";
import { Button } from "@/components/ui/Button";

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

interface PortalReportCard {
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
  /// The card the school hands out (task 0072): the same one the staff read, built from the published results only. Null only if it could not be built.
  card: Card | null;
}

interface PortalResultsTabProps {
  reportCards: PortalReportCard[];
  blockedByUnpaidFees?: boolean;
  outstandingBalance?: number;
  onNavigateToBilling?: () => void;
}

export function PortalResultsTab({ reportCards, blockedByUnpaidFees, outstandingBalance, onNavigateToBilling }: PortalResultsTabProps) {
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>(reportCards[0]?.period.id || "");

  if (blockedByUnpaidFees) {
    return (
      <div className="bg-surface border border-line rounded-2xl p-8 sm:p-12 text-center shadow-sm">
        <div className="w-14 h-14 rounded-2xl bg-warn-bg text-warn-fg mx-auto flex items-center justify-center mb-4">
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-fg">Report Card Access Restricted</h3>
        <p className="text-xs sm:text-sm text-fg-muted mt-2 max-w-md mx-auto">
          {outstandingBalance === undefined ? (
            // This sign-in may not see fees (task 0040): no amount, and no way to the invoices.
            <>This report card is not available yet. Please ask your guardian or the school office.</>
          ) : (
            <>
              Academic report cards for this student are temporarily unavailable online due to an outstanding fee balance of{" "}
              <strong className="text-fg">₦{outstandingBalance.toLocaleString()}</strong>.
            </>
          )}
        </p>
        {onNavigateToBilling && outstandingBalance !== undefined && (
          <div className="mt-6">
            <button
              type="button"
              onClick={onNavigateToBilling}
              className="px-5 py-2.5 rounded-xl bg-brand-strong text-white text-xs font-bold shadow-xs hover:bg-brand-strong/90 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-brand"
            >
              View Invoices &amp; Pay Fees
            </button>
          </div>
        )}
      </div>
    );
  }

  if (reportCards.length === 0) {
    return (
      <div className="bg-surface border border-line rounded-2xl p-12 text-center shadow-sm">
        <div className="w-12 h-12 rounded-2xl bg-surface-2 text-fg-muted mx-auto flex items-center justify-center mb-3">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
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

  const activeCard = reportCards.find((c) => c.period.id === selectedPeriodId) || reportCards[0];
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const classOf = (c: PortalReportCard) => (c.card?.class ? `${c.card.class.group} ${c.card.class.arm}` : c.classArm.name);

  return (
    <div className="space-y-6">
      {/* Term selector and actions: not printed */}
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
                {c.period.session.label} · {c.period.label} ({classOf(c)})
              </option>
            ))}
          </select>
        </div>

        {activeCard.card && (
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => downloadReportCardHtml(activeCard.card!, origin)}>
              Download Card
            </Button>
            <Button variant="secondary" onClick={() => window.print()}>
              Print Card
            </Button>
          </div>
        )}
      </div>

      {/* The report card itself: the component the school's staff read, so the two cannot differ (task 0072) */}
      {activeCard.card ? (
        <ReportCard card={activeCard.card} origin={origin} />
      ) : (
        <p role="status" className="rounded-2xl border border-dashed border-line-strong p-6 text-center text-sm text-fg-muted">
          This report card could not be loaded. Please try again later, or ask the school office.
        </p>
      )}
    </div>
  );
}
