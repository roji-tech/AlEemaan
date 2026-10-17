"use client";

import { useState, useEffect, useCallback } from "react";
import { AnnouncementsFeed } from "./AnnouncementsFeed";
import type { AnnouncementItem } from "./AnnouncementComposerModal";

export interface AnnouncementsPanelProps {
  branches: { id: string; name: string }[];
  isSuperAdmin: boolean;
  canCreate: boolean;
  userBranchId?: string | null;
  currentUserId: string;
}

export function AnnouncementsPanel({ branches, isSuperAdmin, canCreate, userBranchId, currentUserId }: AnnouncementsPanelProps) {
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [classArms, setClassArms] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/v1/announcements");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Failed to load announcements");
      setAnnouncements(json.data || []);

      // If user has branch or branches exist, load class arms for targeted broadcasting
      const activeBranchId = userBranchId || branches[0]?.id;
      if (activeBranchId) {
        const armsRes = await fetch(`/api/v1/academics/arms?branchId=${activeBranchId}`);
        if (armsRes.ok) {
          const armsJson = await armsRes.json();
          setClassArms(armsJson.data?.arms || armsJson.data || []);
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load announcements feed");
    } finally {
      setLoading(false);
    }
  }, [userBranchId, branches]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading feed data on mount
    void loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-line bg-surface">
        <p className="text-xs font-medium text-fg-muted animate-pulse">Loading announcements feed...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && <div className="rounded-xl border border-danger-line bg-danger-bg p-3 text-xs text-danger-text">{error}</div>}

      <AnnouncementsFeed
        announcements={announcements}
        branches={branches}
        classArms={classArms}
        isSuperAdmin={isSuperAdmin}
        canCreate={canCreate}
        userBranchId={userBranchId}
        currentUserId={currentUserId}
        onRefresh={loadData}
      />
    </div>
  );
}
