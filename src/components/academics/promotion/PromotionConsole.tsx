"use client";

import { useState, useEffect, useCallback } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { type BranchChoice } from "@/components/academics/common";
import { PromotionPreviewTable, type StudentOverrideState } from "./PromotionPreviewTable";
import { PromotionConfirmModal } from "./PromotionConfirmModal";
import { PromotionHistoryView } from "./PromotionHistoryView";
import type { PromotionPreviewResponse } from "@/lib/promotion/service";

interface AcademicSessionItem {
  id: string;
  label: string;
}

interface ClassGroupItem {
  id: string;
  name: string;
  sortOrder: number;
}

export function PromotionConsole({ branches }: { branches: BranchChoice[] }) {
  const [selectedBranchId, setSelectedBranchId] = useState<string>(branches[0]?.id || "");
  const branch = branches.find((b) => b.id === selectedBranchId) ?? branches[0];
  const canManage = branch?.canEdit ?? false;

  const [activeTab, setActiveTab] = useState<"rollover" | "history">("rollover");

  // Selection state for rollover
  const [sessions, setSessions] = useState<AcademicSessionItem[]>([]);
  const [classes, setClasses] = useState<ClassGroupItem[]>([]);
  const [sourceSessionId, setSourceSessionId] = useState<string>("");
  const [targetSessionId, setTargetSessionId] = useState<string>("");
  const [sourceClassGroupId, setSourceClassGroupId] = useState<string>("");
  const [passMark, setPassMark] = useState<number>(50.0);

  // Preview & execution state
  const [loadingStructure, setLoadingStructure] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PromotionPreviewResponse | null>(null);
  const [overrides, setOverrides] = useState<Map<string, StudentOverrideState>>(new Map());

  // Confirm modal & execution
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [executionNotice, setExecutionNotice] = useState<{
    variant: "success" | "error";
    message: string;
  } | null>(null);

  // Load branch structure (sessions and classes)
  const loadBranchStructure = useCallback(async (bId: string) => {
    if (!bId) return;
    setLoadingStructure(true);
    setPreviewError(null);
    setPreview(null);
    setOverrides(new Map());

    try {
      const [sessRes, classRes] = await Promise.all([
        fetch(`/api/v1/academics/sessions?branchId=${encodeURIComponent(bId)}`),
        fetch(`/api/v1/academics/class-groups?branchId=${encodeURIComponent(bId)}`),
      ]);

      if (sessRes.ok) {
        const sessJson = await sessRes.json();
        const sessList: AcademicSessionItem[] = sessJson.data?.sessions || [];
        setSessions(sessList);
        if (sessList.length >= 2) {
          setSourceSessionId(sessList[0].id);
          setTargetSessionId(sessList[1].id);
        } else if (sessList.length === 1) {
          setSourceSessionId(sessList[0].id);
          setTargetSessionId("");
        }
      }

      if (classRes.ok) {
        const classJson = await classRes.json();
        const classList: ClassGroupItem[] = classJson.data?.classGroups || [];
        setClasses(classList);
        if (classList.length > 0) {
          setSourceClassGroupId(classList[0].id);
        }
      }
    } catch (err) {
      console.error(err);
      setPreviewError("Unable to load academic sessions or classes for this branch.");
    } finally {
      setLoadingStructure(false);
    }
  }, []);

  useEffect(() => {
    if (selectedBranchId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- loading structure on branch change
      void loadBranchStructure(selectedBranchId);
    }
  }, [selectedBranchId, loadBranchStructure]);

  // Generate preview
  const handleGeneratePreview = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedBranchId || !sourceSessionId || !targetSessionId || !sourceClassGroupId) {
      setPreviewError("Please select Source Session, Target Session, and Source Class.");
      return;
    }

    if (sourceSessionId === targetSessionId) {
      setPreviewError("Target session must be different from source session.");
      return;
    }

    setPreviewLoading(true);
    setPreviewError(null);
    setExecutionNotice(null);

    try {
      const params = new URLSearchParams({
        branchId: selectedBranchId,
        sourceSessionId,
        targetSessionId,
        sourceClassGroupId,
        passMark: String(passMark),
      });

      const res = await fetch(`/api/v1/academics/promotion/preview?${params.toString()}`);
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error?.message || "Failed to generate promotion preview");
      }

      setPreview(json.data);
      setOverrides(new Map());
    } catch (err) {
      console.error(err);
      setPreviewError(err instanceof Error ? err.message : "Failed to generate preview.");
    } finally {
      setPreviewLoading(false);
    }
  };

  // Override management
  const handleOverrideChange = (studentId: string, override: StudentOverrideState) => {
    setOverrides((prev) => {
      const next = new Map(prev);
      next.set(studentId, override);
      return next;
    });
  };

  const handleClearOverride = (studentId: string) => {
    setOverrides((prev) => {
      const next = new Map(prev);
      next.delete(studentId);
      return next;
    });
  };

  // Selected session objects
  const sourceSession = sessions.find((s) => s.id === sourceSessionId);
  const targetSession = sessions.find((s) => s.id === targetSessionId);

  // Execution
  const handleExecutePromotion = async () => {
    if (!preview) return;
    setExecuting(true);
    setExecutionNotice(null);

    try {
      const studentOverridesPayload = Array.from(overrides.entries()).map(([studentId, o]) => ({
        studentId,
        decision: o.decision,
        targetArmId: o.targetArmId,
        reason: o.reason,
      }));

      const res = await fetch("/api/v1/academics/promotion/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId: selectedBranchId,
          sourceSessionId,
          targetSessionId,
          sourceClassGroupId: preview.sourceClassGroup.id,
          targetClassGroupId: preview.targetClassGroup?.id,
          passMark: preview.passMark,
          overrides: studentOverridesPayload,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || "Promotion execution failed");
      }

      setConfirmOpen(false);
      setExecutionNotice({
        variant: "success",
        message: `Successfully executed promotion for ${preview.sourceClassGroup.name}! ${json.data.totalPromoted} promoted, ${json.data.totalRepeated} repeated.`,
      });
      setPreview(null);
      setOverrides(new Map());
    } catch (err) {
      console.error(err);
      setExecutionNotice({
        variant: "error",
        message: err instanceof Error ? err.message : "Execution failed. Please try again.",
      });
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Branch selector & sub-navigation */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {branches.length > 1 ? (
          <div className="w-full sm:w-72">
            <label htmlFor="promotion-branch-select" className="sr-only">
              Select Branch
            </label>
            <select
              id="promotion-branch-select"
              aria-label="Select branch"
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium text-fg shadow-sm focus-visible:outline-2 focus-visible:outline-ring"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="text-sm font-semibold text-fg">{branch?.name}</div>
        )}

        <div className="inline-flex rounded-xl border border-line bg-surface p-1 shadow-sm" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "rollover"}
            onClick={() => setActiveTab("rollover")}
            className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
              activeTab === "rollover" ? "bg-brand-strong text-white shadow-sm" : "text-fg-muted hover:text-fg"
            }`}
          >
            Rollover Console
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "history"}
            onClick={() => setActiveTab("history")}
            className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
              activeTab === "history" ? "bg-brand-strong text-white shadow-sm" : "text-fg-muted hover:text-fg"
            }`}
          >
            Audit History
          </button>
        </div>
      </div>

      {executionNotice && <Alert variant={executionNotice.variant}>{executionNotice.message}</Alert>}

      {activeTab === "history" ? (
        <PromotionHistoryView branchId={selectedBranchId} />
      ) : (
        <div className="space-y-6">
          {/* Step 1: Configuration Filter Card */}
          <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6 shadow-sm">
            <h3 className="text-base font-semibold text-fg">Promotion Setup</h3>
            <p className="mt-1 text-xs text-fg-muted">
              Select the source academic session to evaluate from, the target academic session to enroll into, and the source class. The
              system automatically evaluates multi-term results against the pass mark.
            </p>

            <form onSubmit={handleGeneratePreview} className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label htmlFor="source-session-select" className="block text-xs font-semibold text-fg-muted uppercase">
                  Source Session (Evaluating)
                </label>
                <select
                  id="source-session-select"
                  value={sourceSessionId}
                  onChange={(e) => {
                    const nextSource = e.target.value;
                    setSourceSessionId(nextSource);
                    if (targetSessionId === nextSource) {
                      setTargetSessionId("");
                    }
                  }}
                  disabled={loadingStructure || previewLoading}
                  className="mt-1.5 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <option value="">Select source session...</option>
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="target-session-select" className="block text-xs font-semibold text-fg-muted uppercase">
                  Target Session (Enrolling Into)
                </label>
                <select
                  id="target-session-select"
                  value={targetSessionId}
                  onChange={(e) => setTargetSessionId(e.target.value)}
                  disabled={loadingStructure || previewLoading}
                  className="mt-1.5 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <option value="">Select target session...</option>
                  {sessions
                    .filter((s) => s.id !== sourceSessionId)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label htmlFor="source-class-select" className="block text-xs font-semibold text-fg-muted uppercase">
                  Source Class Group
                </label>
                <select
                  id="source-class-select"
                  value={sourceClassGroupId}
                  onChange={(e) => setSourceClassGroupId(e.target.value)}
                  disabled={loadingStructure || previewLoading}
                  className="mt-1.5 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="pass-mark-input" className="block text-xs font-semibold text-fg-muted uppercase">
                  Pass Mark Percentage (%)
                </label>
                <input
                  id="pass-mark-input"
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={passMark}
                  onChange={(e) => setPassMark(parseFloat(e.target.value) || 0)}
                  disabled={loadingStructure || previewLoading}
                  className="mt-1.5 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-ring"
                />
              </div>

              <div className="sm:col-span-2 lg:col-span-4 flex justify-end gap-3 pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  loading={previewLoading}
                  disabled={!canManage || loadingStructure || !sourceSessionId || !targetSessionId}
                >
                  {previewLoading ? "Evaluating Performance..." : "Generate Promotion Preview"}
                </Button>
              </div>
            </form>
          </div>

          {previewError && <Alert variant="error">{previewError}</Alert>}

          {/* Step 2: Evaluation Results & Overrides */}
          {preview && (
            <div className="space-y-4">
              <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-fg">
                    Class Progression: <span className="font-bold text-fg">{preview.sourceClassGroup.name}</span> &rarr;{" "}
                    <span className="font-bold text-fg">
                      {preview.targetClassGroup ? preview.targetClassGroup.name : "Graduated (Terminal Class)"}
                    </span>
                  </h4>
                  <p className="text-xs text-fg-muted">
                    Session: {sourceSession?.label || "Source"} &rarr; {targetSession?.label || "Target"} &bull; Pass Mark:{" "}
                    {preview.passMark}%
                  </p>
                </div>

                {canManage && (
                  <Button type="button" variant="primary" onClick={() => setConfirmOpen(true)} disabled={preview.students.length === 0}>
                    Review & Execute Rollover ({preview.students.length})
                  </Button>
                )}
              </div>

              <PromotionPreviewTable
                preview={preview}
                overrides={overrides}
                onOverrideChange={handleOverrideChange}
                onClearOverride={handleClearOverride}
                canManage={canManage}
              />

              {/* Confirmation Modal */}
              <PromotionConfirmModal
                open={confirmOpen}
                onClose={() => setConfirmOpen(false)}
                onConfirm={handleExecutePromotion}
                loading={executing}
                preview={preview}
                overrides={overrides}
                sourceSessionLabel={sourceSession?.label || "Source Session"}
                targetSessionLabel={targetSession?.label || "Target Session"}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
