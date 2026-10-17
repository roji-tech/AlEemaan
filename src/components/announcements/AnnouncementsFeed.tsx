"use client";

import { useState } from "react";
import { AnnouncementStatus } from "@prisma/client";
import { AnnouncementComposerModal, type AnnouncementItem } from "./AnnouncementComposerModal";

export interface AnnouncementsFeedProps {
  announcements: AnnouncementItem[];
  branches: { id: string; name: string }[];
  classArms: { id: string; name: string }[];
  isSuperAdmin?: boolean;
  canCreate?: boolean;
  userBranchId?: string | null;
  currentUserId: string;
  onRefresh: () => void;
}

export function AnnouncementsFeed({
  announcements,
  branches,
  classArms,
  isSuperAdmin = false,
  canCreate = false,
  userBranchId,
  currentUserId,
  onRefresh,
}: AnnouncementsFeedProps) {
  const [selectedBranchId, setSelectedBranchId] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const [composerOpen, setComposerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<AnnouncementItem | null>(null);

  // Filter announcements
  const filtered = announcements.filter((ann) => {
    if (selectedBranchId !== "ALL") {
      if (ann.branchId && ann.branchId !== selectedBranchId) return false;
    }
    if (statusFilter !== "ALL" && ann.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = ann.title.toLowerCase().includes(q);
      const matchBody = ann.body.toLowerCase().includes(q);
      if (!matchTitle && !matchBody) return false;
    }
    return true;
  });

  const handleEdit = (ann: AnnouncementItem) => {
    setEditingItem(ann);
    setComposerOpen(true);
  };

  const handleCreate = () => {
    setEditingItem(null);
    setComposerOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Top Filter and Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-surface p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label htmlFor="search-announcements" className="sr-only">
              Search Announcements
            </label>
            <input
              id="search-announcements"
              type="text"
              placeholder="Search announcements..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rounded-xl border border-line bg-field px-3 py-2 text-xs font-medium text-fg focus-visible:outline-2 focus-visible:outline-ring w-48 sm:w-64"
            />
          </div>

          <div>
            <label htmlFor="filter-branch" className="sr-only">
              Filter by Branch
            </label>
            <select
              id="filter-branch"
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              className="rounded-xl border border-line bg-field px-3 py-2 text-xs font-medium text-fg focus-visible:outline-2 focus-visible:outline-ring"
            >
              <option value="ALL">All Branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filter-status" className="sr-only">
              Filter by Status
            </label>
            <select
              id="filter-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-line bg-field px-3 py-2 text-xs font-medium text-fg focus-visible:outline-2 focus-visible:outline-ring"
            >
              <option value="ALL">All Statuses</option>
              <option value={AnnouncementStatus.PUBLISHED}>Published</option>
              <option value={AnnouncementStatus.DRAFT}>Drafts</option>
              <option value={AnnouncementStatus.ARCHIVED}>Archived</option>
            </select>
          </div>
        </div>

        {canCreate && (
          <button
            type="button"
            onClick={handleCreate}
            className="flex items-center gap-1.5 rounded-xl bg-brand-strong px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-brand-strong-hover focus-visible:outline-2 focus-visible:outline-ring"
          >
            <span>+</span> Post Announcement
          </button>
        )}
      </div>

      {/* Announcements Feed Cards */}
      <div className="space-y-4">
        {filtered.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center rounded-2xl border border-line bg-surface p-6 text-center shadow-sm">
            <span className="text-3xl mb-2">📢</span>
            <p className="text-sm font-semibold text-fg">No announcements found</p>
            <p className="text-xs text-fg-muted mt-1">There are no broadcasts matching your current filter criteria.</p>
          </div>
        ) : (
          filtered.map((ann) => {
            const canManage = isSuperAdmin || ann.author?.id === currentUserId;
            const isDraft = ann.status === AnnouncementStatus.DRAFT;
            const isArchived = ann.status === AnnouncementStatus.ARCHIVED;

            return (
              <div
                key={ann.id}
                className={`relative rounded-2xl border p-5 shadow-sm transition space-y-3 ${
                  ann.isPinned ? "border-brand-fg/40 bg-surface-2/60" : "border-line bg-surface hover:border-line-strong"
                }`}
              >
                {/* Header row */}
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {ann.isPinned && (
                        <span className="rounded-full bg-brand/20 border border-brand-fg/30 px-2 py-0.5 text-[10px] font-bold text-brand-fg">
                          📌 Pinned
                        </span>
                      )}
                      {isDraft && (
                        <span className="rounded-full bg-warn-bg border border-warn-line px-2 py-0.5 text-[10px] font-bold text-warn-icon">
                          Draft
                        </span>
                      )}
                      {isArchived && (
                        <span className="rounded-full bg-field border border-line px-2 py-0.5 text-[10px] font-bold text-fg-muted">
                          Archived
                        </span>
                      )}
                      <h3 className="text-base font-semibold text-fg">{ann.title}</h3>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-fg-muted">
                      <span>Posted {new Date(ann.publishedAt).toLocaleDateString()}</span>
                      <span>•</span>
                      <span>By {ann.author?.name ? ann.author.name : (ann.author?.email ?? "Administrator")}</span>
                      {ann.branch ? (
                        <>
                          <span>•</span>
                          <span className="rounded-md bg-field border border-line px-1.5 py-0.5 text-[10px] text-fg-muted">
                            🏢 {ann.branch.name}
                          </span>
                        </>
                      ) : (
                        <>
                          <span>•</span>
                          <span className="rounded-md bg-brand/10 border border-brand-fg/20 px-1.5 py-0.5 text-[10px] text-brand-fg font-medium">
                            🌍 School-Wide Broadcast
                          </span>
                        </>
                      )}
                      {ann.classArm && (
                        <>
                          <span>•</span>
                          <span className="rounded-md bg-field border border-line px-1.5 py-0.5 text-[10px] text-fg-muted">
                            Class: {ann.classArm.name}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {canManage && (
                    <button
                      type="button"
                      onClick={() => handleEdit(ann)}
                      className="rounded-lg border border-line px-3 py-1 text-xs font-medium text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      Edit
                    </button>
                  )}
                </div>

                {/* Message Body */}
                <div className="text-sm text-fg-2 whitespace-pre-wrap leading-relaxed">{ann.body}</div>

                {/* Footer metadata */}
                {ann.targetRoles && ann.targetRoles.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-line text-[10px] text-fg-muted">
                    <span className="font-medium">Targeted to:</span>
                    {ann.targetRoles.map((role) => (
                      <span key={role} className="rounded-md bg-field border border-line px-1.5 py-0.5">
                        {role.toLowerCase().replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Composer Modal */}
      <AnnouncementComposerModal
        isOpen={composerOpen}
        onClose={() => setComposerOpen(false)}
        onSaved={onRefresh}
        initialAnnouncement={editingItem}
        branches={branches}
        isSuperAdmin={isSuperAdmin}
        userBranchId={userBranchId}
        classArms={classArms}
      />
    </div>
  );
}
