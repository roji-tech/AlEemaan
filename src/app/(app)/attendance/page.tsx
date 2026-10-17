import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requirePageSession } from "@/lib/auth/page-session";
import { branchIdsFor } from "@/lib/auth/branch-access";
import { PageHeader } from "@/components/shell/PageHeader";
import { AttendancePanel } from "@/components/attendance/AttendancePanel";

export const metadata: Metadata = { title: "Attendance" };
export const dynamic = "force-dynamic";

export default async function AttendancePage() {
  const { session, isAdmin } = await requirePageSession();
  const visible = await branchIdsFor(session.userId);
  const branches = await prisma.branch.findMany({
    where: visible === "all" ? {} : { id: { in: visible } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div>
      <PageHeader
        title="Attendance"
        description={
          isAdmin
            ? "Record daily attendance roll calls, manage arm-scoped teacher permissions, and view attendance metrics."
            : "Record daily attendance roll calls for your designated class and granted arms."
        }
      />
      {branches.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
          You don&apos;t belong to a branch with staff access yet.
        </p>
      ) : (
        <AttendancePanel branches={branches.map((b) => ({ id: b.id, name: b.name }))} isAdmin={isAdmin} />
      )}
    </div>
  );
}
