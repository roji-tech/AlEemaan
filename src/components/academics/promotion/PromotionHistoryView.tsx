"use client";

import { useEffect, useState, useCallback } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { PromotionDecision, PromotionBatchStatus } from "@prisma/client";

/// What `GET /academics/promotion/batches` sends for each batch (listPromotionBatches).
interface BatchItem {
  id: string;
  sourceSession: { id: string; label: string };
  targetSession: { id: string; label: string };
  sourceClassGroup: { id: string; name: string };
  targetClassGroup: { id: string; name: string } | null;
  passMark: string | number;
  totalEvaluated: number;
  totalPromoted: number;
  totalRepeated: number;
  totalGraduated: number;
  status: PromotionBatchStatus;
  createdAt: string;
  executedBy: { id: string; name: string | null; email: string | null };
}

/// What `GET /academics/promotion/batches/[id]` sends for each record (getPromotionBatch): the decision TAKEN, how it was reached, the pupil's average, the enrolment they were
/// moved to, and the decision the rule recommended at that batch's pass mark (worked out from the stored average, because a record keeps the decision taken, not the advice).
interface BatchRecordDetail {
  id: string;
  student: { id: string; firstName: string; lastName: string; admissionNo: string };
  overallAverage: number | null;
  recommendedDecision: PromotionDecision;
  decision: PromotionDecision;
  decisionMode: "AUTOMATIC" | "OVERRIDDEN";
  overrideReason: string | null;
  targetEnrollment: { className: string; arm: string | null } | null;
}

interface BatchDetailResponse {
  id: string;
  sourceSession: { id: string; label: string };
  targetSession: { id: string; label: string };
  sourceClassGroup: { id: string; name: string };
  targetClassGroup: { id: string; name: string } | null;
  passMark: string | number;
  totalEvaluated: number;
  totalPromoted: number;
  totalRepeated: number;
  totalGraduated: number;
  status: PromotionBatchStatus;
  createdAt: string;
  executedBy: { id: string; name: string | null; email: string | null };
  records: BatchRecordDetail[];
}

export function PromotionHistoryView({ branchId }: { branchId: string }) {
  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [batchDetail, setBatchDetail] = useState<BatchDetailResponse | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const loadBatches = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/academics/promotion/batches?branchId=${encodeURIComponent(branchId)}`);
      if (!res.ok) {
        throw new Error("Failed to load promotion history");
      }
      const json = await res.json();
      setBatches(json.data?.batches || []);
    } catch (err) {
      console.error(err);
      setError("Unable to load promotion history. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load of batches on branch change
    void loadBatches();
  }, [loadBatches]);

  const viewDetails = async (id: string) => {
    setSelectedBatchId(id);
    setBatchDetail(null);
    setDetailError(null);
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/v1/academics/promotion/batches/${encodeURIComponent(id)}?branchId=${encodeURIComponent(branchId)}`);
      if (!res.ok) throw new Error("Failed to load batch details");
      const json = await res.json();
      setBatchDetail(json.data);
    } catch (err) {
      console.error(err);
      setDetailError("Unable to load this batch's records. Please try again.");
    } finally {
      setLoadingDetail(false);
    }
  };

  const closeDetails = () => {
    setSelectedBatchId(null);
    setBatchDetail(null);
    setDetailError(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-fg">Promotion Audit Log</h3>
          <p className="text-xs text-fg-muted">Historical rollover runs, evaluated student totals, and manual override records.</p>
        </div>
        <Button variant="ghost" className="min-h-9 px-3 py-1.5 text-xs" onClick={loadBatches} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {loading ? (
        <div className="rounded-xl border border-line bg-surface p-8 text-center text-sm text-fg-muted">Loading promotion history...</div>
      ) : batches.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-fg-muted">
          No promotion batches have been executed for this branch yet.
        </div>
      ) : (
        <div
          role="region"
          aria-label="Promotion history"
          tabIndex={0}
          className="overflow-x-auto rounded-xl border border-line bg-surface shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <table className="w-full text-left text-sm text-fg" aria-label="Promotion history batches">
            <thead className="border-b border-line bg-surface-2 text-xs font-semibold uppercase text-fg-muted">
              <tr>
                <th scope="col" className="px-4 py-3">
                  Date
                </th>
                <th scope="col" className="px-4 py-3">
                  Class Transition
                </th>
                <th scope="col" className="px-4 py-3">
                  Sessions
                </th>
                <th scope="col" className="px-4 py-3 text-center">
                  Evaluated
                </th>
                <th scope="col" className="px-4 py-3 text-center">
                  Promoted
                </th>
                <th scope="col" className="px-4 py-3 text-center">
                  Repeated
                </th>
                <th scope="col" className="px-4 py-3">
                  Executed By
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {batches.map((b) => (
                <tr key={b.id} className="transition-colors hover:bg-surface-2/50">
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-fg-muted">
                    {new Date(b.createdAt).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-fg">{b.sourceClassGroup.name}</div>
                    <div className="text-xs text-fg-muted">&rarr; {b.targetClassGroup ? b.targetClassGroup.name : "Graduated"}</div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <span className="font-medium text-fg">{b.sourceSession.label}</span>
                    <span className="text-fg-muted"> &rarr; {b.targetSession.label}</span>
                  </td>
                  <td className="px-4 py-3 text-center font-mono font-medium">{b.totalEvaluated}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center rounded-full bg-ok-bg px-2 py-0.5 font-mono text-xs font-semibold text-ok-fg">
                      {b.totalPromoted}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center rounded-full bg-danger-bg px-2 py-0.5 font-mono text-xs font-semibold text-danger-fg">
                      {b.totalRepeated}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-fg-muted">
                    <div className="font-medium text-fg">{b.executedBy.name ?? b.executedBy.email}</div>
                    {b.executedBy.name && b.executedBy.email ? <div>{b.executedBy.email}</div> : null}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" className="min-h-9 px-3 py-1.5 text-xs" onClick={() => viewDetails(b.id)}>
                      View Details
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Batch Details Modal */}
      <Dialog
        open={!!selectedBatchId}
        onClose={closeDetails}
        title="Promotion Batch Details"
        description={
          batchDetail ? (
            <span>
              {batchDetail.sourceClassGroup.name} &rarr; {batchDetail.targetClassGroup?.name ?? "Graduated"} (
              {batchDetail.sourceSession.label} &rarr; {batchDetail.targetSession.label})
            </span>
          ) : undefined
        }
        wide
      >
        <div className="space-y-4 pt-2">
          {detailError ? (
            <div className="space-y-3">
              <Alert variant="error">{detailError}</Alert>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={closeDetails}>
                  Close
                </Button>
                <Button onClick={() => selectedBatchId && viewDetails(selectedBatchId)}>Try again</Button>
              </div>
            </div>
          ) : loadingDetail || !batchDetail ? (
            <div className="p-8 text-center text-sm text-fg-muted">Loading records...</div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div className="rounded-lg border border-line bg-surface p-2">
                  <span className="text-fg-muted">Total: </span>
                  <strong className="text-fg">{batchDetail.totalEvaluated}</strong>
                </div>
                <div className="rounded-lg border border-ok-line bg-ok-bg p-2 text-ok-fg">
                  <span>Promoted: </span>
                  <strong>{batchDetail.totalPromoted}</strong>
                </div>
                <div className="rounded-lg border border-danger-line bg-danger-bg p-2 text-danger-fg">
                  <span>Repeated: </span>
                  <strong>{batchDetail.totalRepeated}</strong>
                </div>
                <div className="rounded-lg border border-info-line bg-info-bg p-2 text-info-fg">
                  <span>Graduated: </span>
                  <strong>{batchDetail.totalGraduated}</strong>
                </div>
              </div>

              {/* A region that scrolls must take keyboard focus, or a keyboard user cannot reach the rows past the edge. */}
              <div
                role="region"
                aria-label="Records of this batch"
                tabIndex={0}
                className="max-h-96 overflow-auto rounded-xl border border-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <table className="w-full text-left text-xs" aria-label="Batch student records">
                  <thead className="sticky top-0 border-b border-line bg-surface-2 font-semibold uppercase text-fg-muted">
                    <tr>
                      <th scope="col" className="px-3 py-2">
                        Student
                      </th>
                      <th scope="col" className="px-3 py-2 text-right">
                        Session Avg
                      </th>
                      <th scope="col" className="px-3 py-2 text-center">
                        Recommended
                      </th>
                      <th scope="col" className="px-3 py-2 text-center">
                        Final Decision
                      </th>
                      <th scope="col" className="px-3 py-2">
                        Moved To
                      </th>
                      <th scope="col" className="px-3 py-2">
                        Override Notes
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line bg-surface">
                    {batchDetail.records.map((r) => (
                      <tr key={r.id}>
                        <td className="px-3 py-2">
                          <div className="font-medium text-fg">
                            {r.student.firstName} {r.student.lastName}
                          </div>
                          <div className="text-fg-muted">{r.student.admissionNo}</div>
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-medium">
                          {r.overallAverage !== null ? `${Number(r.overallAverage).toFixed(2)}%` : "N/A"}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className="font-medium text-fg-muted">{r.recommendedDecision}</span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span
                            className={`font-semibold ${
                              r.decision === PromotionDecision.PROMOTED
                                ? "text-ok-fg"
                                : r.decision === PromotionDecision.REPEATED
                                  ? "text-danger-fg"
                                  : "text-info-fg"
                            }`}
                          >
                            {r.decision}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-fg">
                          {r.targetEnrollment ? [r.targetEnrollment.className, r.targetEnrollment.arm].filter(Boolean).join(" ") : "—"}
                        </td>
                        <td className="px-3 py-2 text-fg-muted">
                          {r.decisionMode === "OVERRIDDEN" ? (
                            <span className="text-warn-fg">Override: {r.overrideReason || "Manual adjustment"}</span>
                          ) : (
                            <span className="text-fg-muted">Automatic</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end pt-2">
                <Button variant="ghost" onClick={closeDetails}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </div>
      </Dialog>
    </div>
  );
}
