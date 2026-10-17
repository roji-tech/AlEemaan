import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requirePageSession } from "@/lib/auth/page-session";
import { branchIdsFor } from "@/lib/auth/branch-access";
import { PageHeader } from "@/components/shell/PageHeader";
import { TimetablePanel } from "@/components/timetable/TimetablePanel";

export const metadata: Metadata = { title: "Timetable & Scheduling" };
export const dynamic = "force-dynamic";

export default async function TimetablePage() {
  const { session, isAdmin } = await requirePageSession();
  const visible = await branchIdsFor(session.userId);
  const branches = await prisma.branch.findMany({
    where: visible === "all" ? {} : { id: { in: visible } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Timetable & Scheduling"
        description={
          isAdmin
            ? "Manage weekly curriculum timetables, resolve teacher/room schedule clashes in real time, and coordinate class periods."
            : "View your weekly teaching schedule and class timetable periods."
        }
      />
      {branches.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
          You don&apos;t belong to a branch with timetable access yet.
        </p>
      ) : (
        <TimetablePanel branches={branches.map((b) => ({ id: b.id, name: b.name }))} isAdmin={isAdmin} />
      )}
    </div>
  );
}
