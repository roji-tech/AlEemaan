"use client";

import { useId } from "react";
import { PromotionDecision } from "@prisma/client";
import type { PromotionPreviewResponse, StudentPreviewRow } from "@/lib/promotion/service";
import { resolveTargetArm } from "@/lib/promotion/rules";

export interface StudentOverrideState {
  decision: PromotionDecision;
  targetArmId?: string;
  reason?: string;
}

interface PromotionPreviewTableProps {
  preview: PromotionPreviewResponse;
  overrides: Map<string, StudentOverrideState>;
  onOverrideChange: (studentId: string, override: StudentOverrideState) => void;
  onClearOverride: (studentId: string) => void;
  canManage: boolean;
}

export function PromotionPreviewTable({ preview, overrides, onOverrideChange, onClearOverride, canManage }: PromotionPreviewTableProps) {
  const tableId = useId();

  const getDecisionBadge = (decision: PromotionDecision) => {
    switch (decision) {
      case PromotionDecision.PROMOTED:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-ok-line bg-ok-bg px-2.5 py-0.5 text-xs font-semibold text-ok-fg">
            <span className="h-1.5 w-1.5 rounded-full bg-ok-icon" aria-hidden="true" />
            Promoted
          </span>
        );
      case PromotionDecision.REPEATED:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-danger-line bg-danger-bg px-2.5 py-0.5 text-xs font-semibold text-danger-fg">
            <span className="h-1.5 w-1.5 rounded-full bg-danger-icon" aria-hidden="true" />
            Repeated
          </span>
        );
      case PromotionDecision.GRADUATED:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-info-line bg-info-bg px-2.5 py-0.5 text-xs font-semibold text-info-fg">
            <span className="h-1.5 w-1.5 rounded-full bg-info-icon" aria-hidden="true" />
            Graduated
          </span>
        );
      case PromotionDecision.WITHDRAWN:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-warn-line bg-warn-bg px-2.5 py-0.5 text-xs font-semibold text-warn-fg">
            <span className="h-1.5 w-1.5 rounded-full bg-warn-icon" aria-hidden="true" />
            Withdrawn
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-fg-muted">
            {decision}
          </span>
        );
    }
  };

  const overrideCount = overrides.size;

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
          <p className="text-xs font-medium text-fg-muted uppercase tracking-wider">Total Evaluated</p>
          <p className="mt-1 text-2xl font-bold text-fg">{preview.summary.totalEvaluated}</p>
        </div>
        <div className="rounded-xl border border-ok-line bg-ok-bg p-4 shadow-sm">
          <p className="text-xs font-medium text-fg-muted uppercase tracking-wider">Promoted</p>
          <p className="mt-1 text-2xl font-bold text-ok-fg">{preview.summary.totalPromoted}</p>
        </div>
        <div className="rounded-xl border border-danger-line bg-danger-bg p-4 shadow-sm">
          <p className="text-xs font-medium text-fg-muted uppercase tracking-wider">Repeated</p>
          <p className="mt-1 text-2xl font-bold text-danger-fg">{preview.summary.totalRepeated}</p>
        </div>
        <div className="rounded-xl border border-info-line bg-info-bg p-4 shadow-sm">
          <p className="text-xs font-medium text-fg-muted uppercase tracking-wider">Graduated / Alumni</p>
          <p className="mt-1 text-2xl font-bold text-info-fg">{preview.summary.totalGraduated}</p>
        </div>
      </div>

      {overrideCount > 0 && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-between rounded-xl border border-warn-line bg-warn-bg px-4 py-2.5 text-xs text-warn-fg"
        >
          <span>
            <strong>{overrideCount}</strong> manual decision {overrideCount === 1 ? "override" : "overrides"} applied.
          </span>
          <button
            type="button"
            onClick={() => {
              for (const student of preview.students) {
                onClearOverride(student.studentId);
              }
            }}
            className="font-semibold underline hover:no-underline focus-visible:outline-2 focus-visible:outline-ring"
          >
            Reset all overrides
          </button>
        </div>
      )}

      {/* Responsive Accessible Table Container */}
      <div
        role="region"
        aria-label="Promotion preview"
        tabIndex={0}
        className="overflow-x-auto rounded-xl border border-line bg-surface shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <table id={tableId} className="w-full text-left text-sm text-fg" aria-label="Student promotion preview">
          <caption className="sr-only">
            Student academic performance, term scores, overall average, system recommendation, and promotion decision controls.
          </caption>
          <thead className="border-b border-line bg-surface-2 text-xs font-semibold text-fg-muted uppercase">
            <tr>
              <th scope="col" className="px-4 py-3">
                Student
              </th>
              <th scope="col" className="px-4 py-3">
                Current Arm
              </th>
              <th scope="col" className="px-4 py-3 text-center">
                Term Scores
              </th>
              <th scope="col" className="px-4 py-3 text-right">
                Session Avg
              </th>
              <th scope="col" className="px-4 py-3 text-center">
                Recommendation
              </th>
              <th scope="col" className="px-4 py-3">
                Final Decision
              </th>
              <th scope="col" className="px-4 py-3">
                Target Arm
              </th>
              <th scope="col" className="px-4 py-3">
                Override Reason
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {preview.students.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-fg-muted">
                  No active enrolled students found in {preview.sourceClassGroup.name}.
                </td>
              </tr>
            ) : (
              preview.students.map((student: StudentPreviewRow) => {
                const currentOverride = overrides.get(student.studentId);
                const effectiveDecision = currentOverride?.decision ?? student.recommendedDecision;
                // Only an arm the admin CHOSE is sent to the server; the arm shown otherwise is the one the final decision leads to (the matching arm of the next class for a
                // promotion, the pupil's own arm for a repeat), which the server works out itself.
                const explicitArmId = currentOverride?.targetArmId;
                const shownArmId =
                  explicitArmId ??
                  (effectiveDecision === PromotionDecision.PROMOTED
                    ? resolveTargetArm(student.currentArmName, preview.targetArms)
                    : student.currentArmId) ??
                  undefined;
                const isOverridden = !!currentOverride;

                return (
                  <tr key={student.studentId} className={`transition-colors hover:bg-surface-2/50 ${isOverridden ? "bg-warn-bg" : ""}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-fg">
                        {student.firstName} {student.lastName}
                      </div>
                      <div className="text-xs text-fg-muted">{student.admissionNo}</div>
                    </td>
                    <td className="px-4 py-3 text-fg-muted">{student.currentArmName || "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-wrap justify-center gap-1.5">
                        {preview.academicPeriods.map((period) => {
                          const avg = student.termAverages[period.ordinal];
                          return (
                            <span
                              key={period.ordinal}
                              className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-mono font-medium ${
                                avg !== null && avg !== undefined
                                  ? avg >= preview.passMark
                                    ? "border-ok-line bg-ok-bg text-ok-fg"
                                    : "border-danger-line bg-danger-bg text-danger-fg"
                                  : "border-line bg-surface-2 text-fg-muted"
                              }`}
                              title={`${period.label}: ${avg !== null && avg !== undefined ? `${avg.toFixed(1)}%` : "N/A"}`}
                            >
                              T{period.ordinal}: {avg !== null && avg !== undefined ? `${avg.toFixed(1)}%` : "—"}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {student.overallAverage !== null ? (
                        <span
                          className={`font-semibold font-mono ${
                            student.overallAverage >= preview.passMark ? "text-ok-fg" : "text-danger-fg"
                          }`}
                        >
                          {student.overallAverage.toFixed(2)}%
                        </span>
                      ) : (
                        <span className="text-fg-muted">N/A</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">{getDecisionBadge(student.recommendedDecision)}</td>
                    <td className="px-4 py-3">
                      {canManage ? (
                        <select
                          aria-label={`Final decision for ${student.firstName} ${student.lastName}`}
                          value={effectiveDecision}
                          onChange={(e) => {
                            const newDecision = e.target.value as PromotionDecision;
                            if (newDecision === student.recommendedDecision && !currentOverride?.targetArmId && !currentOverride?.reason) {
                              onClearOverride(student.studentId);
                            } else {
                              onOverrideChange(student.studentId, {
                                decision: newDecision,
                                targetArmId: explicitArmId,
                                reason: currentOverride?.reason,
                              });
                            }
                          }}
                          className={`rounded-lg border px-2.5 py-1 text-xs font-medium focus-visible:outline-2 focus-visible:outline-ring ${
                            isOverridden ? "border-warn-line bg-warn-bg text-warn-fg" : "border-line bg-surface text-fg"
                          }`}
                        >
                          <option value={PromotionDecision.PROMOTED}>Promote</option>
                          <option value={PromotionDecision.REPEATED}>Repeat</option>
                          <option value={PromotionDecision.GRADUATED}>Graduate</option>
                          <option value={PromotionDecision.WITHDRAWN}>Withdraw</option>
                        </select>
                      ) : (
                        getDecisionBadge(effectiveDecision)
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {effectiveDecision === PromotionDecision.PROMOTED && preview.targetClassGroup ? (
                        canManage && preview.targetArms.length > 0 ? (
                          <select
                            aria-label={`Target arm for ${student.firstName} ${student.lastName}`}
                            value={shownArmId || ""}
                            onChange={(e) => {
                              onOverrideChange(student.studentId, {
                                decision: effectiveDecision,
                                targetArmId: e.target.value || undefined,
                                reason: currentOverride?.reason,
                              });
                            }}
                            className="rounded-lg border border-line bg-surface px-2 py-1 text-xs text-fg focus-visible:outline-2 focus-visible:outline-ring"
                          >
                            {preview.targetArms.map((arm) => (
                              <option key={arm.id} value={arm.id}>
                                {arm.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs font-medium text-fg">
                            {preview.targetArms.find((a) => a.id === shownArmId)?.name ?? "—"}
                          </span>
                        )
                      ) : (
                        <span className="text-xs text-fg-muted">
                          {effectiveDecision === PromotionDecision.REPEATED ? "Same class" : "N/A"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {canManage && isOverridden ? (
                        <input
                          type="text"
                          aria-label={`Reason for overriding ${student.firstName} ${student.lastName}`}
                          placeholder="Override reason..."
                          value={currentOverride?.reason || ""}
                          onChange={(e) => {
                            onOverrideChange(student.studentId, {
                              decision: effectiveDecision,
                              targetArmId: explicitArmId,
                              reason: e.target.value,
                            });
                          }}
                          className="w-full min-w-28 rounded-lg border border-warn-line bg-surface px-2 py-1 text-xs text-fg placeholder:text-fg-muted focus-visible:outline-2 focus-visible:outline-ring"
                        />
                      ) : (
                        <span className="text-xs text-fg-muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
