"use client";

import { useMemo, useState } from "react";
import { BulkImportDialog } from "@/components/bulk/BulkImportDialog";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { SelectField } from "@/components/ui/SelectField";
import { invitationEntityFor } from "@/lib/bulk/invitations";
import { roleOptionsFor, type BranchOption, type RoleName } from "./model";

/// Invite many people at once (task 0084): the branch is chosen first and holds for the whole file; the role dropdown offers what this caller may give (a branch administrator never makes
/// an administrator, and the server refuses it row by row too).
export function BulkInviteDialog({
  open,
  onClose,
  branches,
  isSuperAdmin,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  branches: BranchOption[];
  isSuperAdmin: boolean;
  /// `drafted`: every row was saved as a draft, nothing was sent (task 0101 D2).
  onSaved: (count: number, drafted?: boolean) => void | Promise<void>;
}) {
  const [branchId, setBranchId] = useState("");
  // Task 0101 D2: save every row as a DRAFT invitation, to send later from Pending invitations.
  const [asDraft, setAsDraft] = useState(false);
  const entity = useMemo(() => invitationEntityFor(roleOptionsFor(isSuperAdmin).map((o) => o.value as RoleName)), [isSuperAdmin]);
  return (
    <BulkImportDialog
      open={open}
      onClose={onClose}
      entity={entity}
      title="Invite many people"
      description="Each person gets an email with a link that works for 7 days. Until they accept, they have no access. Nothing is sent until you press Save."
      endpoint="/api/v1/invitations/import"
      context={{ branchId, asDraft }}
      canStart={branchId !== ""}
      contextControl={(locked) => (
        <div className="space-y-2">
          <SelectField
            label="Branch"
            value={branchId}
            disabled={locked}
            onChange={(e) => setBranchId(e.target.value)}
            options={[{ value: "", label: "Choose a branch" }, ...branches.map((b) => ({ value: b.id, label: b.name }))]}
            hint="Everyone in the file is invited to this branch."
          />
          <CheckboxField
            label="Save these as drafts, send later (nothing is e-mailed now)"
            checked={asDraft}
            disabled={locked}
            onChange={(e) => setAsDraft(e.target.checked)}
          />
        </div>
      )}
      noun={{ one: "invitation", many: "invitations" }}
      onSaved={(count) => onSaved(count, asDraft)}
    />
  );
}
