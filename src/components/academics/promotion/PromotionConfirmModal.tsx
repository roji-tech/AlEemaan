"use client";

import { PromotionDecision } from "@prisma/client";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import type { PromotionPreviewResponse } from "@/lib/promotion/service";
import type { StudentOverrideState } from "./PromotionPreviewTable";

interface PromotionConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  loading: boolean;
  preview: PromotionPreviewResponse;
  overrides: Map<string, StudentOverrideState>;
  sourceSessionLabel: string;
  targetSessionLabel: string;
}

export function PromotionConfirmModal({
  open,
  onClose,
  onConfirm,
  loading,
  preview,
  overrides,
  sourceSessionLabel,
  targetSessionLabel,
}: PromotionConfirmModalProps) {
  // Compute final counts considering overrides
  let finalPromoted = 0;
  let finalRepeated = 0;
  let finalGraduated = 0;
  let finalWithdrawn = 0;

  for (const student of preview.students) {
    const override = overrides.get(student.studentId);
    const decision = override ? override.decision : student.recommendedDecision;

    if (decision === PromotionDecision.PROMOTED) finalPromoted++;
    else if (decision === PromotionDecision.REPEATED) finalRepeated++;
    else if (decision === PromotionDecision.GRADUATED) finalGraduated++;
    else if (decision === PromotionDecision.WITHDRAWN) finalWithdrawn++;
  }

  const overrideCount = overrides.size;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Confirm Academic Rollover & Promotion"
      description={
        <span>
          You are about to execute promotion for <strong>{preview.sourceClassGroup.name}</strong> from <strong>{sourceSessionLabel}</strong>{" "}
          into <strong>{targetSessionLabel}</strong>.
        </span>
      }
    >
      <div className="space-y-4 pt-2">
        <div className="rounded-xl border border-line bg-surface-2 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">Execution Impact Summary</h3>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-fg-muted">Total Students</dt>
              <dd className="font-semibold text-fg">{preview.students.length}</dd>
            </div>
            <div>
              <dt className="text-xs text-fg-muted">Manual Overrides</dt>
              <dd className="font-semibold text-fg">{overrideCount}</dd>
            </div>
            <div>
              <dt className="text-xs text-fg-muted">Promoting to</dt>
              <dd className="font-semibold text-ok-fg">
                {preview.targetClassGroup?.name ?? "Graduated"} ({finalPromoted})
              </dd>
            </div>
            <div>
              <dt className="text-xs text-fg-muted">Repeating in</dt>
              <dd className="font-semibold text-danger-fg">
                {preview.sourceClassGroup.name} ({finalRepeated})
              </dd>
            </div>
            {finalGraduated > 0 && (
              <div>
                <dt className="text-xs text-fg-muted">Graduating</dt>
                <dd className="font-semibold text-info-fg">{finalGraduated}</dd>
              </div>
            )}
            {finalWithdrawn > 0 && (
              <div>
                <dt className="text-xs text-fg-muted">Withdrawing</dt>
                <dd className="font-semibold text-warn-fg">{finalWithdrawn}</dd>
              </div>
            )}
          </dl>
        </div>

        <Alert variant="warning" title="Important Notes:" announce={false}>
          <ul className="mt-1 list-disc pl-4 space-y-1 text-xs">
            <li>
              Existing enrollments in <strong>{sourceSessionLabel}</strong> will be updated to their final promotion status (PROMOTED,
              REPEATED, ALUMNI).
            </li>
            <li>
              New enrollments will be created in <strong>{targetSessionLabel}</strong> for active students.
            </li>
            <li>This operation is idempotent and logged in the immutable promotion audit trail.</li>
          </ul>
        </Alert>

        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading} data-initial-focus>
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={onConfirm} loading={loading}>
            {loading ? "Executing..." : "Confirm & Execute Promotion"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
