"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PortalLoginCard, type PortalStudentRecord } from "@/components/portal/PortalLoginCard";
import { PortalHeader } from "@/components/portal/PortalHeader";
import { PortalOverviewTab } from "@/components/portal/PortalOverviewTab";
import { PortalResultsTab } from "@/components/portal/PortalResultsTab";
import { PortalFinanceTab } from "@/components/portal/PortalFinanceTab";
import { PortalLmsTab, type PortalLms } from "@/components/portal/PortalLmsTab";
import { allowedTabs, type Access, type PortalTab } from "@/lib/portal/access";

interface OverviewState {
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
}

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

interface ReportCardState {
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

interface InvoiceState {
  id: string;
  invoiceNo: string;
  totalAmount: number;
  amountPaid: number;
  status: string;
  dueDate: string | null;
  period: {
    label: string;
    session: { label: string };
  };
  payments: Array<{
    id: string;
    reference: string;
    receiptNo: string | null;
    amount: number;
    provider: string;
    status: string;
    createdAt: string;
  }>;
}

function PortalContent() {
  const searchParams = useSearchParams();
  const tokenParam = searchParams.get("token") || undefined;

  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [students, setStudents] = useState<PortalStudentRecord[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<PortalTab>("overview");
  // What this sign-in may do for each pupil (task 0040), from the server. The screens only decide what to show: every route checks again.
  const [accessByStudent, setAccessByStudent] = useState<Record<string, Access>>({});

  // Tab data states
  const [tabLoading, setTabLoading] = useState(false);
  const [overviewData, setOverviewData] = useState<OverviewState | null>(null);
  const [resultsData, setResultsData] = useState<ReportCardState[]>([]);
  const [resultsBlocked, setResultsBlocked] = useState(false);
  const [resultsBalance, setResultsBalance] = useState<number | undefined>(undefined);
  const [financeData, setFinanceData] = useState<InvoiceState[]>([]);
  const [lmsData, setLmsData] = useState<PortalLms>({ assignments: [], materials: [], quizzes: [] });

  // Initial session check
  useEffect(() => {
    async function checkSession() {
      try {
        const res = await fetch("/api/v1/portal/session");
        if (res.ok) {
          const json = await res.json();
          if (json.data && json.data.students?.length > 0) {
            setStudents(json.data.students);
            setAccessByStudent(json.data.access ?? {});
            setSelectedStudentId(json.data.students[0].id);
            setAuthenticated(true);
          }
        } else {
          // Read (and drop) the body of the "no session" answer: a chunked response nobody reads stays open in the browser, so the page never went idle.
          await res.text().catch(() => "");
        }
      } catch {
        // Not authenticated
      } finally {
        setLoading(false);
      }
    }
    checkSession();
  }, []);

  // The sections this sign-in may open for the pupil shown, and the one on screen: the chosen one if it is allowed, otherwise the first that is.
  const currentAccess = accessByStudent[selectedStudentId];
  const tabs: PortalTab[] = currentAccess ? allowedTabs(currentAccess) : [];
  const shownTab: PortalTab = tabs.includes(activeTab) ? activeTab : (tabs[0] ?? activeTab);

  // Fetch data for selected student and the section on screen
  useEffect(() => {
    if (!authenticated || !selectedStudentId || !currentAccess || tabs.length === 0) return;

    let ignore = false;

    async function fetchData() {
      try {
        if (shownTab === "overview") {
          const res = await fetch(`/api/v1/portal/students/${selectedStudentId}/overview`);
          const json = await res.json();
          if (!ignore && res.ok) setOverviewData(json.data);
        } else if (shownTab === "results") {
          const res = await fetch(`/api/v1/portal/students/${selectedStudentId}/results`);
          const json = await res.json();
          if (!ignore && res.ok) {
            setResultsData(json.data.reportCards || []);
            setResultsBlocked(Boolean(json.data.blockedByUnpaidFees));
            // No amount in the answer means this sign-in may not see fees: it is left undefined, not shown as zero.
            setResultsBalance(json.data.outstandingBalance === undefined ? undefined : Number(json.data.outstandingBalance || 0));
          }
        } else if (shownTab === "finance") {
          const res = await fetch(`/api/v1/portal/students/${selectedStudentId}/invoices`);
          const json = await res.json();
          if (!ignore && res.ok) setFinanceData(json.data.invoices || []);
        } else if (shownTab === "lms") {
          const res = await fetch(`/api/v1/portal/students/${selectedStudentId}/lms`);
          const json = await res.json();
          if (!ignore && res.ok) setLmsData({ quizzes: [], ...json.data });
        }
      } catch {
        // Tab fetch failure
      } finally {
        if (!ignore) setTabLoading(false);
      }
    }

    fetchData();

    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `tabs` and `currentAccess` follow `accessByStudent`, which is listed
  }, [authenticated, selectedStudentId, shownTab, accessByStudent]);

  const handleTabChange = (tab: PortalTab) => {
    setTabLoading(true);
    setActiveTab(tab);
  };

  const handleStudentSelect = (id: string) => {
    setTabLoading(true);
    setSelectedStudentId(id);
    setOverviewData(null);
  };

  const handleLoginSuccess = (data: { student: PortalStudentRecord; siblingStudents: PortalStudentRecord[]; access?: Record<string, Access> }) => {
    const all = data.siblingStudents && data.siblingStudents.length > 0 ? data.siblingStudents : [data.student];
    setStudents(all);
    setAccessByStudent(data.access ?? {});
    setSelectedStudentId(data.student.id);
    setAuthenticated(true);
    setTabLoading(true);
  };

  const handleSignOut = async () => {
    try {
      await fetch("/api/v1/portal/session", { method: "DELETE" });
    } catch {
      // Ignored
    }
    setAuthenticated(false);
    setStudents([]);
    setAccessByStudent({});
    setSelectedStudentId("");
    setOverviewData(null);
    setResultsData([]);
    setFinanceData([]);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center p-4">
        <div className="flex items-center gap-3 text-fg-muted text-sm font-medium">
          <svg className="animate-spin h-5 w-5 text-brand-fg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Loading portal...
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center p-4 sm:p-6">
        <PortalLoginCard onSuccess={handleLoginSuccess} initialToken={tokenParam} />
      </div>
    );
  }

  const currentStudent = students.find((s) => s.id === selectedStudentId) || students[0];

  return (
    <div className="min-h-screen bg-canvas flex flex-col text-fg">
      <PortalHeader
        students={students}
        selectedStudentId={selectedStudentId}
        onSelectStudent={handleStudentSelect}
        onSignOut={handleSignOut}
      />

      {/* Main Navigation & Tab Bar */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-8">
        <div
          role="tablist"
          aria-label="Student Portal Sections"
          className="flex overflow-x-auto rounded-xl bg-surface p-1 border border-line mb-6 gap-1 shadow-xs print:hidden"
        >
          {tabs.includes("overview") && (
          <button
            type="button"
            role="tab"
            aria-selected={shownTab === "overview"}
            onClick={() => handleTabChange("overview")}
            className={`flex-1 min-w-30 py-2.5 px-3 rounded-lg text-xs font-bold transition-all text-center cursor-pointer focus-visible:outline-2 focus-visible:outline-brand ${
              shownTab === "overview" ? "bg-brand-strong text-white shadow-xs" : "text-fg-muted hover:text-fg hover:bg-surface-2"
            }`}
          >
            Overview
          </button>
          )}
          {tabs.includes("results") && (
          <button
            type="button"
            role="tab"
            aria-selected={shownTab === "results"}
            onClick={() => handleTabChange("results")}
            className={`flex-1 min-w-30 py-2.5 px-3 rounded-lg text-xs font-bold transition-all text-center cursor-pointer focus-visible:outline-2 focus-visible:outline-brand ${
              shownTab === "results" ? "bg-brand-strong text-white shadow-xs" : "text-fg-muted hover:text-fg hover:bg-surface-2"
            }`}
          >
            Academic Results
          </button>
          )}
          {tabs.includes("finance") && (
          <button
            type="button"
            role="tab"
            aria-selected={shownTab === "finance"}
            onClick={() => handleTabChange("finance")}
            className={`flex-1 min-w-30 py-2.5 px-3 rounded-lg text-xs font-bold transition-all text-center cursor-pointer focus-visible:outline-2 focus-visible:outline-brand ${
              shownTab === "finance" ? "bg-brand-strong text-white shadow-xs" : "text-fg-muted hover:text-fg hover:bg-surface-2"
            }`}
          >
            Fees & Billing
          </button>
          )}
          {tabs.includes("lms") && (
          <button
            type="button"
            role="tab"
            aria-selected={shownTab === "lms"}
            onClick={() => handleTabChange("lms")}
            className={`flex-1 min-w-30 py-2.5 px-3 rounded-lg text-xs font-bold transition-all text-center cursor-pointer focus-visible:outline-2 focus-visible:outline-brand ${
              shownTab === "lms" ? "bg-brand-strong text-white shadow-xs" : "text-fg-muted hover:text-fg hover:bg-surface-2"
            }`}
          >
            Coursework (LMS)
          </button>
          )}
        </div>

        {/* Tab Body */}
        {tabLoading ? (
          <div className="py-16 text-center text-fg-muted text-sm font-medium flex items-center justify-center gap-2">
            <svg className="animate-spin h-5 w-5 text-brand-fg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Loading student records...
          </div>
        ) : (
          <div>
            {shownTab === "overview" && overviewData && (
              <PortalOverviewTab overview={overviewData} onNavigateTab={(tab) => handleTabChange(tab)} tabs={tabs} />
            )}
            {shownTab === "results" && (
              <PortalResultsTab
                reportCards={resultsData}
                student={currentStudent}
                blockedByUnpaidFees={resultsBlocked}
                outstandingBalance={resultsBalance}
                onNavigateToBilling={tabs.includes("finance") ? () => handleTabChange("finance") : undefined}
              />
            )}
            {shownTab === "finance" && <PortalFinanceTab invoices={financeData} student={currentStudent} />}
            {shownTab === "lms" && <PortalLmsTab
                lms={lmsData}
                student={currentStudent}
                canSubmit={Boolean(currentAccess?.submitWork)}
                canQuiz={Boolean(currentAccess?.takeQuizzes)}
                onChanged={async () => {
                  const res = await fetch(`/api/v1/portal/students/${selectedStudentId}/lms`);
                  if (res.ok) setLmsData({ quizzes: [], ...(await res.json()).data });
                }}
              />}
          </div>
        )}
      </main>
    </div>
  );
}

export default function PortalPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-canvas flex items-center justify-center p-4">
          <div className="text-fg-muted text-sm font-medium">Loading portal...</div>
        </div>
      }
    >
      <PortalContent />
    </Suspense>
  );
}
