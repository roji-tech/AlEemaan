import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requirePageSession } from "@/lib/auth/page-session";
import { adminScope, branchIdsFor, mayAdminister } from "@/lib/auth/branch-access";
import { PageHeader } from "@/components/shell/PageHeader";
import { StudentsPanel } from "@/components/students/StudentsPanel";
import { branchAdminMaySuspend } from "@/lib/standing/settings-service";

export const metadata: Metadata = { title: "Students" };
export const dynamic = "force-dynamic";

// The pupils of each branch (Slice UI1, over the students API). The page offers the branches the person holds a staff role in (a superadmin: all) and whether
// they may change each (an administrator of that branch, or a superadmin). It is display: the students API behind every list and button decides, on every request.
export default async function StudentsPage() {
  const { session, isAdmin } = await requirePageSession();
  const visible = await branchIdsFor(session.userId);
  const scope = await adminScope(session.userId);
  const branches = await prisma.branch.findMany({
    where: visible === "all" ? {} : { id: { in: visible } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  // What this person may do about a pupil's standing in each branch (display only; the API decides): a super admin everything, an administrator of the branch suspend and lift while
  // the school allows it, never expel.
  const standingCan = Object.fromEntries(
    await Promise.all(
      branches.map(async (b) => {
        const administers = mayAdminister(scope, b.id);
        return [
          b.id,
          { suspend: administers && (scope.superAdmin || (await branchAdminMaySuspend(b.id))), remove: administers && scope.superAdmin },
        ] as const;
      }),
    ),
  );

  return (
    <div>
      <PageHeader
        title="Students"
        description={
          isAdmin
            ? "Register pupils, put them in a class, keep guardian contacts, and import a whole class from a spreadsheet. Nothing is ever deleted - pupils are archived."
            : "The pupils of your branches. Only an administrator of a branch can change them."
        }
      />
      {branches.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
          You don&apos;t belong to a branch with staff access yet.
        </p>
      ) : (
        <StudentsPanel
          standingCan={standingCan}
          branches={branches.map((b) => ({ id: b.id, name: b.name, canEdit: mayAdminister(scope, b.id) }))}
        />
      )}
    </div>
  );
}
