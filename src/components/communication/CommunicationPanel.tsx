"use client";

import { useState, useRef, type KeyboardEvent } from "react";
import { BroadcastComposer } from "./BroadcastComposer";
import { DispatchLogsView } from "./DispatchLogsView";
import { TemplatesManager } from "./TemplatesManager";

export interface CommunicationPanelProps {
  branches: { id: string; name: string }[];
  userRole?: string;
  userBranchId?: string | null;
}

type TabType = "broadcast" | "logs" | "templates";

export function CommunicationPanel({ branches, userBranchId }: CommunicationPanelProps) {
  const [selectedBranchId, setSelectedBranchId] = useState<string>(userBranchId || branches[0]?.id || "");
  const [activeTab, setActiveTab] = useState<TabType>("broadcast");

  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const tabs: { id: TabType; label: string }[] = [
    { id: "broadcast", label: "Broadcast Composer" },
    { id: "logs", label: "Message Logs & Dispatches" },
    { id: "templates", label: "Notification Templates" },
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
          <label htmlFor="comm-branch-select" className="text-sm font-semibold text-fg">
            Current Branch:
          </label>
          <select
            id="comm-branch-select"
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
        <div role="tablist" aria-label="Communication modules" className="flex space-x-4 overflow-x-auto">
          {tabs.map((tab, idx) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                ref={(el) => {
                  tabsRef.current[idx] = el;
                }}
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={isActive}
                aria-controls={`panel-${tab.id}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(e) => handleKeyDown(e, idx)}
                className={`py-3 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded-t ${
                  isActive
                    ? "border-brand-fg text-brand-fg font-semibold"
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
      <div role="tabpanel" id={`panel-${activeTab}`} aria-labelledby={`tab-${activeTab}`} tabIndex={0} className="focus:outline-none">
        {activeTab === "broadcast" && <BroadcastComposer branchId={selectedBranchId} onSuccess={() => setActiveTab("logs")} />}

        {activeTab === "logs" && <DispatchLogsView branchId={selectedBranchId} />}

        {activeTab === "templates" && <TemplatesManager branchId={selectedBranchId} />}
      </div>
    </div>
  );
}
