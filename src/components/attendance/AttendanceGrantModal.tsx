"use client";

import { useState, useEffect, useCallback } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { getJson, sendJson } from "@/components/auth/postJson";

export type AttendanceGrantItem = {
  id: string;
  branchId: string;
  staffRecordId: string;
  classArmId: string;
  grantedAt: string;
  staffRecord: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
  };
  classArm: {
    id: string;
    name: string;
    classGroup: {
      name: string;
    };
  };
  grantedByUser: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
};

type ArmOption = {
  id: string;
  name: string;
  classGroupName: string;
  classTeacher?: { id: string; firstName: string; lastName: string } | null;
};

type StaffOption = {
  id: string;
  firstName: string;
  lastName: string;
  category: string;
};

export function AttendanceGrantModal({ open, onClose, branchId }: { open: boolean; onClose: () => void; branchId: string }) {
  const [grants, setGrants] = useState<AttendanceGrantItem[]>([]);
  const [arms, setArms] = useState<ArmOption[]>([]);
  const [staffList, setStaffList] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state for new grant
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [selectedArmId, setSelectedArmId] = useState("");
  const [grantSubmitting, setGrantSubmitting] = useState(false);

  // Form state for class teacher assignment
  const [ctArmId, setCtArmId] = useState("");
  const [ctStaffId, setCtStaffId] = useState("");
  const [ctSubmitting, setCtSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    if (!branchId || !open) return;
    setLoading(true);
    setError(null);
    try {
      const [grantsRes, armsRes, staffRes] = await Promise.all([
        getJson(`/api/v1/academics/attendance/grants?branchId=${branchId}`),
        getJson(`/api/v1/academics/attendance/arms?branchId=${branchId}`),
        getJson(`/api/v1/staff?branchId=${branchId}`),
      ]);

      if (grantsRes.ok && grantsRes.data) {
        setGrants(grantsRes.data as unknown as AttendanceGrantItem[]);
      }
      if (armsRes.ok && armsRes.data) {
        setArms(armsRes.data as unknown as ArmOption[]);
      }
      if (staffRes.ok && staffRes.data) {
        const d = staffRes.data as { staff?: StaffOption[] };
        setStaffList(d.staff ?? []);
      }
    } catch {
      setError("Unable to load grant configuration");
    } finally {
      setLoading(false);
    }
  }, [branchId, open]);

  useEffect(() => {
    if (!branchId || !open) return;
    let cancelled = false;
    Promise.all([
      getJson(`/api/v1/academics/attendance/grants?branchId=${branchId}`),
      getJson(`/api/v1/academics/attendance/arms?branchId=${branchId}`),
      getJson(`/api/v1/staff?branchId=${branchId}`),
    ])
      .then(([grantsRes, armsRes, staffRes]) => {
        if (cancelled) return;
        if (grantsRes.ok && grantsRes.data) {
          setGrants(grantsRes.data as unknown as AttendanceGrantItem[]);
        }
        if (armsRes.ok && armsRes.data) {
          setArms(armsRes.data as unknown as ArmOption[]);
        }
        if (staffRes.ok && staffRes.data) {
          const d = staffRes.data as { staff?: StaffOption[] };
          setStaffList(d.staff ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Unable to load grant configuration");
      });
    return () => {
      cancelled = true;
    };
  }, [branchId, open]);

  const handleCreateGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaffId || !selectedArmId) return;
    setGrantSubmitting(true);
    setError(null);
    setSuccess(null);

    const res = await sendJson("/api/v1/academics/attendance/grants", "POST", {
      branchId,
      staffRecordId: selectedStaffId,
      classArmId: selectedArmId,
    });

    setGrantSubmitting(false);
    if (res.ok) {
      setSuccess("Explicit grant added successfully");
      setSelectedStaffId("");
      setSelectedArmId("");
      void loadData();
    } else {
      setError(res.message ?? "Failed to create grant");
    }
  };

  const handleRevokeGrant = async (id: string) => {
    setError(null);
    setSuccess(null);
    const res = await sendJson(`/api/v1/academics/attendance/grants/${id}?branchId=${branchId}`, "DELETE");
    if (res.ok) {
      setSuccess("Grant revoked successfully");
      void loadData();
    } else {
      setError(res.message ?? "Failed to revoke grant");
    }
  };

  const handleAssignClassTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ctArmId) return;
    setCtSubmitting(true);
    setError(null);
    setSuccess(null);

    const res = await sendJson(`/api/v1/academics/arms/${ctArmId}/class-teacher`, "PATCH", {
      branchId,
      staffRecordId: ctStaffId || null,
    });

    setCtSubmitting(false);
    if (res.ok) {
      setSuccess("Class teacher updated successfully");
      void loadData();
    } else {
      setError(res.message ?? "Failed to assign class teacher");
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Attendance Permissions & Grants"
      description="Designate Form/Class Teachers or explicitly grant roll-call access for specific arms."
      wide
    >
      <div className="space-y-6">
        {error && <Alert variant="error">{error}</Alert>}
        {success && <Alert variant="success">{success}</Alert>}

        {/* Form Teacher Assignment Section */}
        <section className="rounded-xl border border-line bg-surface-1 p-4">
          <h3 className="text-sm font-semibold text-fg">Assign Form / Class Teacher</h3>
          <p className="text-xs text-fg-muted mt-1">The assigned form teacher holds default attendance permission for this arm.</p>
          <form onSubmit={handleAssignClassTeacher} className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label htmlFor="ct-arm-select" className="block text-xs font-medium text-fg mb-1">
                Class Arm
              </label>
              <select
                id="ct-arm-select"
                value={ctArmId}
                onChange={(e) => {
                  setCtArmId(e.target.value);
                  const arm = arms.find((a) => a.id === e.target.value);
                  setCtStaffId(arm?.classTeacher?.id ?? "");
                }}
                className="w-full rounded-md border border-line bg-surface-base px-3 py-2 text-sm text-fg"
                required
              >
                <option value="">Select an arm…</option>
                {arms.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.classGroupName} {a.name}{" "}
                    {a.classTeacher ? `(Current: ${a.classTeacher.firstName} ${a.classTeacher.lastName})` : "(Unassigned)"}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="ct-staff-select" className="block text-xs font-medium text-fg mb-1">
                Designated Teacher
              </label>
              <select
                id="ct-staff-select"
                value={ctStaffId}
                onChange={(e) => setCtStaffId(e.target.value)}
                className="w-full rounded-md border border-line bg-surface-base px-3 py-2 text-sm text-fg"
              >
                <option value="">No Teacher (Unassign)</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.firstName} {s.lastName} ({s.category})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Button type="submit" variant="primary" disabled={ctSubmitting || !ctArmId} className="w-full">
                {ctSubmitting ? "Saving…" : "Save Assignment"}
              </Button>
            </div>
          </form>
        </section>

        {/* Create Explicit Grant Section */}
        <section className="rounded-xl border border-line bg-surface-1 p-4">
          <h3 className="text-sm font-semibold text-fg">Grant Explicit Attendance Permission</h3>
          <p className="text-xs text-fg-muted mt-1">
            Grants attendance access to a staff member for an arm, even if they are not the form teacher.
          </p>
          <form onSubmit={handleCreateGrant} className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label htmlFor="grant-staff-select" className="block text-xs font-medium text-fg mb-1">
                Staff Member
              </label>
              <select
                id="grant-staff-select"
                value={selectedStaffId}
                onChange={(e) => setSelectedStaffId(e.target.value)}
                className="w-full rounded-md border border-line bg-surface-base px-3 py-2 text-sm text-fg"
                required
              >
                <option value="">Select staff…</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.firstName} {s.lastName} ({s.category})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="grant-arm-select" className="block text-xs font-medium text-fg mb-1">
                Arm to Grant
              </label>
              <select
                id="grant-arm-select"
                value={selectedArmId}
                onChange={(e) => setSelectedArmId(e.target.value)}
                className="w-full rounded-md border border-line bg-surface-base px-3 py-2 text-sm text-fg"
                required
              >
                <option value="">Select arm…</option>
                {arms.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.classGroupName} {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Button type="submit" variant="primary" disabled={grantSubmitting || !selectedStaffId || !selectedArmId} className="w-full">
                {grantSubmitting ? "Granting…" : "Add Grant"}
              </Button>
            </div>
          </form>
        </section>

        {/* Existing Grants List */}
        <section>
          <h3 className="text-sm font-semibold text-fg mb-2">Active Explicit Grants</h3>
          {loading ? (
            <p className="text-xs text-fg-muted">Loading grants…</p>
          ) : grants.length === 0 ? (
            <p className="text-xs text-fg-muted italic">No explicit attendance grants active in this branch.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-2 text-fg-muted font-medium border-b border-line">
                  <tr>
                    <th className="p-3">Staff Member</th>
                    <th className="p-3">Class Arm</th>
                    <th className="p-3">Granted At</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {grants.map((g) => (
                    <tr key={g.id} className="hover:bg-surface-1">
                      <td className="p-3 font-medium text-fg">
                        {g.staffRecord.firstName} {g.staffRecord.lastName}
                        {g.staffRecord.email && <span className="block text-fg-muted text-[11px]">{g.staffRecord.email}</span>}
                      </td>
                      <td className="p-3 text-fg">
                        {g.classArm.classGroup.name} {g.classArm.name}
                      </td>
                      <td className="p-3 text-fg-muted">{new Date(g.grantedAt).toLocaleDateString()}</td>
                      <td className="p-3 text-right">
                        <Button
                          type="button"
                          variant="danger"
                          className="min-h-8 px-2 text-xs"
                          onClick={() => void handleRevokeGrant(g.id)}
                        >
                          Revoke
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="flex justify-end pt-2 border-t border-line">
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
