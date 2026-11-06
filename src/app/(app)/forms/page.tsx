import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requirePageSession } from "@/lib/auth/page-session";
import { PageHeader } from "@/components/shell/PageHeader";
import { FormsSections } from "@/components/forms/FormsSections";

export const metadata: Metadata = { title: "Forms" };
export const dynamic = "force-dynamic";

const STAFF = new Set(["ADMIN", "TEACHING_STAFF", "NON_TEACHING_STAFF"]);

// Forms (Task 0041): staff write practice sets, questionnaires and paper work, publish and close them, and answer the questionnaires addressed to them. Display only: the APIs
// behind it decide who may do what, in which branch.
export default async function FormsPage() {
  const { memberships, isSuperAdmin } = await requirePageSession();
  if (!isSuperAdmin && !memberships.some((m) => STAFF.has(m.role))) {
    return (
      <div>
        <PageHeader title="Forms" />
        <p role="alert" className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
          Only staff can open this page.
        </p>
      </div>
    );
  }
  const staffBranchIds = memberships.filter((m) => STAFF.has(m.role)).map((m) => m.branchId);
  const branches = await prisma.branch.findMany({
    where: isSuperAdmin ? {} : { id: { in: staffBranchIds } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Forms"
        description="Write practice sets, questionnaires and paper work, publish them when they are ready, and answer the questionnaires addressed to you."
      />
      <FormsSections branches={branches} />
    </div>
  );
}
