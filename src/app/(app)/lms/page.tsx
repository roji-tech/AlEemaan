import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requirePageSession } from "@/lib/auth/page-session";
import { PageHeader } from "@/components/shell/PageHeader";
import { LmsPanel } from "@/components/lms/LmsPanel";

export const metadata: Metadata = { title: "Learning Management System & Coursework" };
export const dynamic = "force-dynamic";

export default async function LmsPage() {
  const { memberships, isSuperAdmin } = await requirePageSession();

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
  const primaryRole = memberships[0]?.role ?? "STUDENT";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Coursework & LMS"
        description="Deliver homework assignments, evaluate student submissions with SpeedGrader, distribute syllabus materials, and conduct interactive quizzes."
      />
      {branches.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          You don&apos;t have access to any school branch coursework yet.
        </p>
      ) : (
        <LmsPanel branches={branches} userRole={primaryRole} userBranchId={userBranchId} />
      )}
    </div>
  );
}
