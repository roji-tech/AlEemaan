import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requirePageSession } from "@/lib/auth/page-session";
import { adminScope, branchIdsFor, mayAdminister } from "@/lib/auth/branch-access";
import { PageHeader } from "@/components/shell/PageHeader";
import { ClassesPanel } from "@/components/academics/ClassesPanel";

export const metadata: Metadata = { title: "Academics" };
export const dynamic = "force-dynamic";

// Classes, arms and subjects of each branch (Slice P1). The page offers the branches the person holds a STAFF role in (a superadmin: all) and whether they may
// change each (an administrator of that branch, or a superadmin). It is display: the academics API behind every list and button decides, on every request.
export default async function AcademicsPage() {
  const { session, isAdmin } = await requirePageSession();
  const visible = await branchIdsFor(session.userId);
  const scope = await adminScope(session.userId);
  const branches = await prisma.branch.findMany({
    where: visible === "all" ? {} : { id: { in: visible } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div>
      <PageHeader
        title="Academics"
        description={
          isAdmin
            ? "The classes, arms and subjects of each branch. Nothing here is ever deleted - old items are archived."
            : "The classes, arms and subjects of your branches. Only an administrator of a branch can change them."
        }
      />
      {branches.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
          You don&apos;t belong to a branch with staff access yet.
        </p>
      ) : (
        <ClassesPanel branches={branches.map((b) => ({ id: b.id, name: b.name, canEdit: mayAdminister(scope, b.id) }))} />
      )}
    </div>
  );
}
