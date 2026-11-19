import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requirePageSession } from "@/lib/auth/page-session";
import { adminScope, branchIdsFor, mayAdminister } from "@/lib/auth/branch-access";
import { PageHeader } from "@/components/shell/PageHeader";
import { StudentsPanel } from "@/components/students/StudentsPanel";
import { branchAdminMaySuspend } from "@/lib/standing/settings-service";
import { ProgramPlaceStatus } from "@prisma/client";
import { viewerOf } from "@/lib/programs/access";
import { schoolEnabled } from "@/lib/programs/common";
import type { OwnProgram } from "@/components/students/OwnProgramCard";

export const metadata: Metadata = { title: "Students" };
export const dynamic = "force-dynamic";

// The pupils of each branch (Slice UI1, over the students API). The page offers the branches the person holds a staff role in (a superadmin: all) and whether
// they may change each (an administrator of that branch, or a superadmin). It is display: the students API behind every list and button decides, on every request.
export default async function StudentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { session, isAdmin } = await requirePageSession();
  // A link from the top-bar search (task 0113): which branch, and what to search for. Only a branch of this person's is used (the panel checks).
  const query = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
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

  // A branch made for a program (task 0043, 8.6) says how pupils of the other branches join it (task 0110), to whoever has a place in that program: a super admin may add them (while
  // programs are on for the school), and a super admin or program admin sees how many there are. Display only: the program's API decides on every request.
  const ownPrograms = await prisma.program.findMany({
    where: { ownBranchId: { in: branches.map((b) => b.id) } },
    select: { id: true, name: true, ownBranchId: true },
  });
  const schoolOn = ownPrograms.length > 0 && (await schoolEnabled()) !== false;
  const programs: Record<string, OwnProgram> = {};
  for (const program of ownPrograms) {
    const viewer = await viewerOf(session.userId, program.id);
    if (!viewer || !program.ownBranchId) continue;
    const seesAll = viewer.level === "SUPER" || viewer.level === "ADMIN";
    programs[program.ownBranchId] = {
      id: program.id,
      name: program.name,
      mayAdd: viewer.level === "SUPER" && schoolOn,
      fromOtherBranches: seesAll
        ? await prisma.programParticipant.count({
            where: { programId: program.id, status: ProgramPlaceStatus.ACTIVE, branchId: { not: program.ownBranchId } },
          })
        : null,
    };
  }

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
          programs={programs}
          initialBranchId={one(query.branch)}
          initialQuery={one(query.q)?.slice(0, 64)}
          branches={branches.map((b) => ({ id: b.id, name: b.name, canEdit: mayAdminister(scope, b.id) }))}
        />
      )}
    </div>
  );
}
