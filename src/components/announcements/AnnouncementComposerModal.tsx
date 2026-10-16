"use client";

import { useState, useId } from "react";
import { Role, AnnouncementStatus } from "@prisma/client";

export interface AnnouncementItem {
  id: string;
  title: string;
  body: string;
  targetRoles: Role[];
  branchId?: string | null;
  classArmId?: string | null;
  status: AnnouncementStatus;
  isPinned: boolean;
  publishedAt: string;
  expiresAt?: string | null;
  branch?: { id: string; name: string } | null;
  classArm?: { id: string; name: string } | null;
  author?: { id: string; name: string | null; email: string | null } | null;
}

export interface AnnouncementComposerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  initialAnnouncement?: AnnouncementItem | null;
  branches: { id: string; name: string }[];
  isSuperAdmin?: boolean;
  userBranchId?: string | null;
  classArms: { id: string; name: string }[];
}

const TARGETABLE_ROLES: { role: Role; label: string }[] = [
  { role: Role.STUDENT, label: "Students" },
  { role: Role.PARENT, label: "Parents" },
  { role: Role.TEACHING_STAFF, label: "Teachers" },
  { role: Role.NON_TEACHING_STAFF, label: "Non-teaching Staff" },
  { role: Role.ADMIN, label: "Administrators" },
];

export function AnnouncementComposerModal({
  isOpen,
  onClose,
  onSaved,
  initialAnnouncement,
  branches,
  isSuperAdmin = false,
  userBranchId,
  classArms,
}: AnnouncementComposerModalProps) {
  const formId = useId();
  const [title, setTitle] = useState(initialAnnouncement?.title ?? "");
  const [body, setBody] = useState(initialAnnouncement?.body ?? "");
  const [targetRoles, setTargetRoles] = useState<Role[]>(initialAnnouncement?.targetRoles ?? []);
  const [branchId, setBranchId] = useState<string>(
    initialAnnouncement?.branchId ?? (isSuperAdmin ? "" : (userBranchId ?? branches[0]?.id ?? "")),
  );
  const [classArmId, setClassArmId] = useState<string>(initialAnnouncement?.classArmId ?? "");
  const [status, setStatus] = useState<AnnouncementStatus>(initialAnnouncement?.status ?? AnnouncementStatus.PUBLISHED);
  const [isPinned, setIsPinned] = useState<boolean>(initialAnnouncement?.isPinned ?? false);
  const [expiresAt, setExpiresAt] = useState<string>(
    initialAnnouncement?.expiresAt ? initialAnnouncement.expiresAt.slice(0, 10) : "",
  );

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const toggleRole = (role: Role) => {
    setTargetRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      setError("Please provide both a title and content body.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = {
        title: title.trim(),
        body: body.trim(),
        targetRoles,
        branchId: branchId ? branchId : null,
        classArmId: classArmId ? classArmId : null,
        status,
        isPinned,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      };

      const url = initialAnnouncement ? `/api/v1/announcements/${initialAnnouncement.id}` : "/api/v1/announcements";
      const method = initialAnnouncement ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to save announcement.");
      }

      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save announcement.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!initialAnnouncement) return;
    if (!window.confirm("Are you sure you want to delete this announcement?")) return;

    setDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/v1/announcements/${initialAnnouncement.id}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to delete announcement.");
      }

      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete announcement.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${formId}-title`}
    >
      <div className="w-full max-w-lg rounded-2xl border border-line bg-surface p-6 shadow-xl space-y-5">
        <div className="flex items-center justify-between border-b border-line pb-4">
          <h2 id={`${formId}-title`} className="text-lg font-semibold text-fg">
            {initialAnnouncement ? "Edit Broadcast Announcement" : "Create New Broadcast Announcement"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-ring"
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-danger-line bg-danger-bg p-3 text-xs text-danger-text" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label htmlFor={`${formId}-ann-title`} className="block text-xs font-medium text-fg-muted mb-1">
              Title *
            </label>
            <input
              id={`${formId}-ann-title`}
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. End of Term Examination Schedule"
              className="w-full rounded-xl border border-line bg-field px-3 py-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-ring"
            />
          </div>

          <div>
            <label htmlFor={`${formId}-ann-body`} className="block text-xs font-medium text-fg-muted mb-1">
              Announcement Message Body *
            </label>
            <textarea
              id={`${formId}-ann-body`}
              required
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write detailed broadcast message..."
              className="w-full rounded-xl border border-line bg-field px-3 py-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-ring"
            />
          </div>

          {/* Audience Roles Selection */}
          <div>
            <label className="block text-xs font-medium text-fg-muted mb-1.5">
              Target Audience Roles (Leave empty for Everyone)
            </label>
            <div className="flex flex-wrap gap-2">
              {TARGETABLE_ROLES.map(({ role, label }) => {
                const isSelected = targetRoles.includes(role);
                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => toggleRole(role)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium border transition ${
                      isSelected
                        ? "border-brand-fg bg-brand/10 text-brand-fg"
                        : "border-line bg-field text-fg-muted hover:text-fg"
                    }`}
                  >
                    {isSelected ? `✓ ${label}` : `+ ${label}`}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${formId}-branch`} className="block text-xs font-medium text-fg-muted mb-1">
                Branch Scope
              </label>
              <select
                id={`${formId}-branch`}
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                disabled={!isSuperAdmin && !!userBranchId}
                className="w-full rounded-xl border border-line bg-field px-3 py-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60"
              >
                {isSuperAdmin && <option value="">All Branches (School-Wide)</option>}
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor={`${formId}-arm`} className="block text-xs font-medium text-fg-muted mb-1">
                Class Arm (Optional)
              </label>
              <select
                id={`${formId}-arm`}
                value={classArmId}
                onChange={(e) => setClassArmId(e.target.value)}
                className="w-full rounded-xl border border-line bg-field px-3 py-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-ring"
              >
                <option value="">All Classes in Branch</option>
                {classArms.map((arm) => (
                  <option key={arm.id} value={arm.id}>
                    {arm.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 items-center">
            <div>
              <label htmlFor={`${formId}-expires`} className="block text-xs font-medium text-fg-muted mb-1">
                Expires On (Optional)
              </label>
              <input
                id={`${formId}-expires`}
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full rounded-xl border border-line bg-field px-3 py-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-ring"
              />
            </div>

            <div className="pt-4 flex items-center gap-2">
              <input
                type="checkbox"
                id={`${formId}-pin`}
                checked={isPinned}
                onChange={(e) => setIsPinned(e.target.checked)}
                className="h-4 w-4 rounded border-line text-brand focus:ring-ring"
              />
              <label htmlFor={`${formId}-pin`} className="text-xs font-medium text-fg cursor-pointer">
                📌 Pin to Top of Feed
              </label>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-line">
            {initialAnnouncement ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting || saving}
                className="rounded-xl border border-danger-line bg-danger-bg px-4 py-2 text-xs font-medium text-danger-text hover:bg-danger-line/40 focus-visible:outline-2 focus-visible:outline-ring"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-line px-4 py-2 text-xs font-medium text-fg-muted hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-ring"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={(e) => {
                  setStatus(AnnouncementStatus.DRAFT);
                  handleSave(e);
                }}
                disabled={saving || deleting}
                className="rounded-xl border border-line bg-surface-2 px-3 py-2 text-xs font-medium text-fg hover:bg-surface focus-visible:outline-2 focus-visible:outline-ring"
              >
                Save as Draft
              </button>
              <button
                type="submit"
                onClick={() => setStatus(AnnouncementStatus.PUBLISHED)}
                disabled={saving || deleting}
                className="rounded-xl bg-brand-strong px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-brand-strong-hover disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-ring"
              >
                {saving ? "Publishing..." : "Publish Broadcast"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
