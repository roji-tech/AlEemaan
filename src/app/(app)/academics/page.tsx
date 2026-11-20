import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requirePageSession } from "@/lib/auth/page-session";
import { adminScope, branchIdsFor, mayAdminister } from "@/lib/auth/branch-access";
import { PageHeader } from "@/components/shell/PageHeader";
import { AcademicsSections } from "@/components/academics/AcademicsSections";
import { isSectionId } from "@/components/academics/sections";
import { branchAdminMaySuspend } from "@/lib/standing/settings-service";
import { usesDepartmentsIn } from "@/lib/academics/departments-setting";

export const metadata: Metadata = { title: "Academics" };
export const dynamic = "force-dynamic";

// Classes, arms and subjects of each branch (Slice P1). The page offers the branches the person holds a STAFF role in (a superadmin: all) and whether they may
// change each (an administrator of that branch, or a superadmin). It is display: the academics API behind every list and button decides, on every request.
export default async function AcademicsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { session, isAdmin, isSuperAdmin } = await requirePageSession();
  // Links from the Overview: which tab, which branch, and whether to open its "new" form. Only values this page knows are used (a branch id is checked against the person's own branches below).
  const query = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  // `tab` is the name now; `section` is what older links (and bookmarks) still say.
  const section = one(query.tab) ?? one(query.section);
  const visible = await branchIdsFor(session.userId);
  const scope = await adminScope(session.userId);
  const branches = await prisma.branch.findMany({
    where: visible === "all" ? {} : { id: { in: visible } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  // Which branches use departments (task 0101 D7; display only: the Departments tab, and the labels and filter on the staff list).
  const departments = await usesDepartmentsIn(branches.map((b) => b.id));
  const showDepartments = branches.some((b) => mayAdminister(scope, b.id) || departments[b.id]);

  // What this person may do about standing in each branch (display only; the API decides).
  const standing = Object.fromEntries(
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
        title="Academics"
        description={
          isAdmin
            ? "Classes, subjects, how marks are built and graded, and the staff of each branch. Nothing here is ever deleted - old items are archived."
            : "Classes, subjects, grading and staff of your branches. Only an administrator of a branch can change them."
        }
      />
      {branches.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
          You don&apos;t belong to a branch with staff access yet.
        </p>
      ) : (
        <AcademicsSections
          branches={branches.map((b) => ({
            id: b.id,
            name: b.name,
            canEdit: mayAdminister(scope, b.id),
            standing: standing[b.id],
            departments: departments[b.id] === true,
          }))}
          isSuperAdmin={isSuperAdmin}
          initialSection={
            isSectionId(section) && (section !== "departments" || showDepartments) && (section !== "catalogue" || isSuperAdmin)
              ? section
              : "classes"
          }
          initialBranchId={one(query.branch)}
          initialQuery={one(query.q)?.slice(0, 100)}
          openNew={one(query.new) === "1" && (section === "sessions" || section === "classes")}
        />
      )}
    </div>
  );
}
