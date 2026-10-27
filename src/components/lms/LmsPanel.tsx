"use client";

import { useState, useEffect, useCallback, useRef, type KeyboardEvent } from "react";
import { AssignmentsList } from "./AssignmentsList";
import { MaterialsList } from "./MaterialsList";
import { QuizConsole } from "./QuizConsole";

export interface LmsPanelProps {
  branches: { id: string; name: string }[];
  /** The caller's role in each branch: `ADMIN`, `TEACHING_STAFF`, `NON_TEACHING_STAFF`, `STUDENT` or `PARENT`. */
  rolesByBranch: Record<string, string>;
  userBranchId?: string | null;
}

type TabType = "assignments" | "materials" | "quizzes";

export function LmsPanel({ branches, rolesByBranch, userBranchId }: LmsPanelProps) {
  const [selectedBranchId, setSelectedBranchId] = useState<string>(userBranchId || branches[0]?.id || "");
  const [activeTab, setActiveTab] = useState<TabType>("assignments");
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  const [classGroups, setClassGroups] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const userRole = rolesByBranch[selectedBranchId] ?? "STUDENT";

  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const loadAcademicsMeta = useCallback(async (branchId: string) => {
    if (!branchId) return;
    setLoading(true);
    try {
      const [subRes, cgRes] = await Promise.all([
        fetch(`/api/v1/academics/subjects?branchId=${branchId}`),
        fetch(`/api/v1/academics/class-groups?branchId=${branchId}`),
      ]);

      if (subRes.ok) {
        const subData = await subRes.json();
        setSubjects(subData.data?.subjects || subData.data || []);
      }
      if (cgRes.ok) {
        const cgData = await cgRes.json();
        setClassGroups(cgData.data?.classGroups || cgData.data || []);
      }
    } catch {
      // fallback to empty arrays on network or fetch error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedBranchId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- load academics metadata when branch changes
      void loadAcademicsMeta(selectedBranchId);
    }
  }, [selectedBranchId, loadAcademicsMeta]);

  const tabs: { id: TabType; label: string }[] = [
    { id: "assignments", label: "Assignments & Coursework" },
    { id: "materials", label: "Study Materials & Notes" },
    { id: "quizzes", label: "Quizzes & Assessments" },
  ];

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    let nextIndex = currentIndex;
    if (e.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (e.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (e.key === "Home") {
      nextIndex = 0;
    } else if (e.key === "End") {
      nextIndex = tabs.length - 1;
    } else {
      return;
    }

    e.preventDefault();
    const nextTab = tabs[nextIndex];
    if (nextTab) {
      setActiveTab(nextTab.id);
      tabsRef.current[nextIndex]?.focus();
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Bar: Branch Selector */}
      {branches.length > 1 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-surface border border-line rounded-xl">
          <label htmlFor="lms-branch-select" className="text-sm font-semibold text-fg">
            Current Branch:
          </label>
          <select
            id="lms-branch-select"
            value={selectedBranchId}
            onChange={(e) => setSelectedBranchId(e.target.value)}
            className="rounded-lg border border-line-strong bg-field px-3 py-1.5 text-sm font-medium shadow-sm focus:border-brand-fg focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Accessible Tab Navigation */}
      <div className="border-b border-line">
        <div role="tablist" aria-label="Coursework sections" className="flex space-x-4 overflow-x-auto">
          {tabs.map((tab, idx) => {
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                ref={(el) => {
                  tabsRef.current[idx] = el;
                }}
                id={`lms-tab-${tab.id}`}
                role="tab"
                type="button"
                aria-selected={isSelected}
                aria-controls={`lms-panel-${tab.id}`}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(e) => handleKeyDown(e, idx)}
                className={`py-3 px-4 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-t-md ${
                  isSelected
                    ? "border-brand-fg text-brand-fg"
                    : "border-transparent text-fg-muted hover:text-fg hover:border-line"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Panels */}
      {loading ? (
        <div className="py-12 text-center text-sm text-fg-muted animate-pulse">Loading coursework data...</div>
      ) : (
        <div>
          <div
            id="lms-panel-assignments"
            role="tabpanel"
            aria-labelledby="lms-tab-assignments"
            hidden={activeTab !== "assignments"}
            className={activeTab === "assignments" ? "block" : "hidden"}
          >
            {activeTab === "assignments" && (
              <AssignmentsList branchId={selectedBranchId} subjects={subjects} classGroups={classGroups} userRole={userRole} />
            )}
          </div>

          <div
            id="lms-panel-materials"
            role="tabpanel"
            aria-labelledby="lms-tab-materials"
            hidden={activeTab !== "materials"}
            className={activeTab === "materials" ? "block" : "hidden"}
          >
            {activeTab === "materials" && (
              <MaterialsList branchId={selectedBranchId} subjects={subjects} classGroups={classGroups} userRole={userRole} />
            )}
          </div>

          <div
            id="lms-panel-quizzes"
            role="tabpanel"
            aria-labelledby="lms-tab-quizzes"
            hidden={activeTab !== "quizzes"}
            className={activeTab === "quizzes" ? "block" : "hidden"}
          >
            {activeTab === "quizzes" && (
              <QuizConsole branchId={selectedBranchId} subjects={subjects} classGroups={classGroups} userRole={userRole} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
