import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requirePageSession } from "@/lib/auth/page-session";
import { PageHeader } from "@/components/shell/PageHeader";
import { CommunicationPanel } from "@/components/communication/CommunicationPanel";

export const metadata: Metadata = { title: "Communication & Multi-Channel Messaging" };
export const dynamic = "force-dynamic";

export default async function CommunicationPage() {
  const { memberships, isSuperAdmin, isAdmin } = await requirePageSession();

  // The navigation hides this page from non-administrators, but a link or a typed address still arrives here: say no instead of showing the broadcast screen
  // (the communication APIs refuse them regardless).
  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="Communication" />
        <p role="alert" className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
          Only administrators can open this page.
        </p>
      </div>
    );
  }

  const branches = isSuperAdmin
    ? await prisma.branch.findMany({
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true },
      })
    : await prisma.branch.findMany({
        where: { id: { in: memberships.map((m) => m.branchId) } },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true },
      });

  const userBranchId = memberships[0]?.branchId ?? null;
  const primaryRole = memberships[0]?.role ?? "ADMIN";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Communication"
        description="Broadcast targeted multi-channel announcements via SMS, Email, and WhatsApp, monitor dispatch queues, and manage notification templates."
      />
      {branches.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-fg-muted">
          You don&apos;t have access to any school branch communications yet.
        </p>
      ) : (
        <CommunicationPanel branches={branches} userRole={primaryRole} userBranchId={userBranchId} />
      )}
    </div>
  );
}
