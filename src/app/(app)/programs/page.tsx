import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requirePageSession } from "@/lib/auth/page-session";
import { PageHeader } from "@/components/shell/PageHeader";
import { ProgramsPanel } from "@/components/programs/ProgramsPanel";

export const metadata: Metadata = { title: "Programs" };
export const dynamic = "force-dynamic";

// The programs the person has a place in (task 0043). The page offers the create button to a super admin; it is display: the API behind every list and button decides.
export default async function ProgramsPage() {
  const { isSuperAdmin } = await requirePageSession();
  const branches = isSuperAdmin ? await prisma.branch.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }) : [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Programs"
        description="Learning that is not a normal class, such as a memorisation program that never ends or a course of three years, with its own levels and groups."
      />
      <ProgramsPanel canCreate={isSuperAdmin} isSuperAdmin={isSuperAdmin} branches={branches} />
    </div>
  );
}
