import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requirePageSession } from "@/lib/auth/page-session";
import { PageHeader } from "@/components/shell/PageHeader";
import { AnnouncementsPanel } from "@/components/announcements/AnnouncementsPanel";

export const metadata: Metadata = { title: "Announcements & Broadcasts" };
export const dynamic = "force-dynamic";

export default async function AnnouncementsPage() {
  const { session, isAdmin, isSuperAdmin, memberships } = await requirePageSession();
  const branches = await prisma.branch.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const isTeacher = memberships.some((m) => m.role === "TEACHING_STAFF");
  const canCreate = isAdmin || isTeacher || isSuperAdmin;
  const userBranchId = memberships[0]?.branchId ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Announcements & Broadcasts"
        description="Stay informed with school-wide alerts, branch updates, and class-specific announcements."
      />
      <AnnouncementsPanel
        branches={branches.map((b) => ({ id: b.id, name: b.name }))}
        isSuperAdmin={isSuperAdmin}
        canCreate={canCreate}
        userBranchId={userBranchId}
        currentUserId={session.userId}
      />
    </div>
  );
}
