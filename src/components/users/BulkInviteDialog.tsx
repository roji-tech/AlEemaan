"use client";

import { useMemo, useState } from "react";
import { BulkImportDialog } from "@/components/bulk/BulkImportDialog";
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
  onSaved: (count: number) => void | Promise<void>;
}) {
  const [branchId, setBranchId] = useState("");
  const entity = useMemo(() => invitationEntityFor(roleOptionsFor(isSuperAdmin).map((o) => o.value as RoleName)), [isSuperAdmin]);
  return (
    <BulkImportDialog
      open={open}
      onClose={onClose}
      entity={entity}
      title="Invite many people"
      description="Each person gets an email with a link that works for 7 days. Until they accept, they have no access. Nothing is sent until you press Save."
      endpoint="/api/v1/invitations/import"
      context={{ branchId }}
      canStart={branchId !== ""}
      contextControl={(locked) => (
        <SelectField
          label="Branch"
          value={branchId}
          disabled={locked}
          onChange={(e) => setBranchId(e.target.value)}
          options={[{ value: "", label: "Choose a branch" }, ...branches.map((b) => ({ value: b.id, label: b.name }))]}
          hint="Everyone in the file is invited to this branch."
        />
      )}
      noun={{ one: "invitation", many: "invitations" }}
      onSaved={onSaved}
    />
  );
}
