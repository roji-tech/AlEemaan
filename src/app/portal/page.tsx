"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PortalLoginCard, type PortalStudentRecord } from "@/components/portal/PortalLoginCard";
import { PortalHeader } from "@/components/portal/PortalHeader";
import { PortalOverviewTab } from "@/components/portal/PortalOverviewTab";
import { PortalResultsTab } from "@/components/portal/PortalResultsTab";
import { PortalFinanceTab } from "@/components/portal/PortalFinanceTab";
import { PortalLmsTab } from "@/components/portal/PortalLmsTab";

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

interface LmsState {
  assignments: Array<{
    id: string;
    title: string;
    description: string | null;
    subjectName: string;
    dueDate: string | null;
    totalPoints: number;
    submission: {
      status: string;
      score: number | null;
      feedback: string | null;
    } | null;
  }>;
  materials: Array<{
    id: string;
    title: string;
    description: string | null;
    subjectName: string;
    content: string | null;
    attachments: unknown;
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
  const [activeTab, setActiveTab] = useState<"overview" | "results" | "finance" | "lms">("overview");

  // Tab data states
  const [tabLoading, setTabLoading] = useState(false);
  const [overviewData, setOverviewData] = useState<OverviewState | null>(null);
  const [resultsData, setResultsData] = useState<ReportCardState[]>([]);
  const [resultsBlocked, setResultsBlocked] = useState(false);
  const [resultsBalance, setResultsBalance] = useState(0);
  const [financeData, setFinanceData] = useState<InvoiceState[]>([]);
  const [lmsData, setLmsData] = useState<LmsState>({ assignments: [], materials: [] });

  // Initial session check
  useEffect(() => {
    async function checkSession() {
      try {
        const res = await fetch("/api/v1/portal/session");
        if (res.ok) {
          const json = await res.json();
          if (json.data && json.data.students?.length > 0) {
            setStudents(json.data.students);
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

  // Fetch data for selected student and active tab
  useEffect(() => {
    if (!authenticated || !selectedStudentId) return;

    let ignore = false;

    async function fetchData() {
      try {
        if (activeTab === "overview") {
          const res = await fetch(`/api/v1/portal/students/${selectedStudentId}/overview`);
          const json = await res.json();
          if (!ignore && res.ok) setOverviewData(json.data);
        } else if (activeTab === "results") {
          const res = await fetch(`/api/v1/portal/students/${selectedStudentId}/results`);
          const json = await res.json();
          if (!ignore && res.ok) {
            setResultsData(json.data.reportCards || []);
            setResultsBlocked(Boolean(json.data.blockedByUnpaidFees));
            setResultsBalance(Number(json.data.outstandingBalance || 0));
          }
        } else if (activeTab === "finance") {
          const res = await fetch(`/api/v1/portal/students/${selectedStudentId}/invoices`);
          const json = await res.json();
          if (!ignore && res.ok) setFinanceData(json.data.invoices || []);
        } else if (activeTab === "lms") {
          const res = await fetch(`/api/v1/portal/students/${selectedStudentId}/lms`);
          const json = await res.json();
          if (!ignore && res.ok) setLmsData(json.data);
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
  }, [authenticated, selectedStudentId, activeTab]);

  const handleTabChange = (tab: "overview" | "results" | "finance" | "lms") => {
    setTabLoading(true);
    setActiveTab(tab);
  };

  const handleStudentSelect = (id: string) => {
    setTabLoading(true);
    setSelectedStudentId(id);
    setOverviewData(null);
  };

  const handleLoginSuccess = (data: { student: PortalStudentRecord; siblingStudents: PortalStudentRecord[] }) => {
    const all = data.siblingStudents && data.siblingStudents.length > 0 ? data.siblingStudents : [data.student];
    setStudents(all);
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
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "overview"}
            onClick={() => handleTabChange("overview")}
            className={`flex-1 min-w-30 py-2.5 px-3 rounded-lg text-xs font-bold transition-all text-center cursor-pointer focus-visible:outline-2 focus-visible:outline-brand ${
              activeTab === "overview" ? "bg-brand-strong text-brand-contrast shadow-xs" : "text-fg-muted hover:text-fg hover:bg-surface-2"
            }`}
          >
            Overview
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "results"}
            onClick={() => handleTabChange("results")}
            className={`flex-1 min-w-30 py-2.5 px-3 rounded-lg text-xs font-bold transition-all text-center cursor-pointer focus-visible:outline-2 focus-visible:outline-brand ${
              activeTab === "results" ? "bg-brand-strong text-brand-contrast shadow-xs" : "text-fg-muted hover:text-fg hover:bg-surface-2"
            }`}
          >
            Academic Results
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "finance"}
            onClick={() => handleTabChange("finance")}
            className={`flex-1 min-w-30 py-2.5 px-3 rounded-lg text-xs font-bold transition-all text-center cursor-pointer focus-visible:outline-2 focus-visible:outline-brand ${
              activeTab === "finance" ? "bg-brand-strong text-brand-contrast shadow-xs" : "text-fg-muted hover:text-fg hover:bg-surface-2"
            }`}
          >
            Fees & Billing
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "lms"}
            onClick={() => handleTabChange("lms")}
            className={`flex-1 min-w-30 py-2.5 px-3 rounded-lg text-xs font-bold transition-all text-center cursor-pointer focus-visible:outline-2 focus-visible:outline-brand ${
              activeTab === "lms" ? "bg-brand-strong text-brand-contrast shadow-xs" : "text-fg-muted hover:text-fg hover:bg-surface-2"
            }`}
          >
            Coursework (LMS)
          </button>
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
            {activeTab === "overview" && overviewData && (
              <PortalOverviewTab overview={overviewData} onNavigateTab={(tab) => handleTabChange(tab)} />
            )}
            {activeTab === "results" && (
              <PortalResultsTab
                reportCards={resultsData}
                student={currentStudent}
                blockedByUnpaidFees={resultsBlocked}
                outstandingBalance={resultsBalance}
                onNavigateToBilling={() => handleTabChange("finance")}
              />
            )}
            {activeTab === "finance" && <PortalFinanceTab invoices={financeData} student={currentStudent} />}
            {activeTab === "lms" && <PortalLmsTab lms={lmsData} student={currentStudent} />}
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
