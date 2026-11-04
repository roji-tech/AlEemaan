import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePageSession } from "@/lib/auth/page-session";
import { viewerOf } from "@/lib/programs/access";
import { PageHeader } from "@/components/shell/PageHeader";
import { ProgramPage } from "@/components/programs/ProgramPage";

export const metadata: Metadata = { title: "Program" };
export const dynamic = "force-dynamic";

const SHAPE = /^[A-Za-z0-9_-]{1,64}$/;

// One program (task 0043). A person with no place in it is told "We could not find that program.", word for word what an id that does not exist gets: the page says nothing
// about whether it exists. (A sentence and not `notFound()`: the app has no not-found page of its own and Next's default one carries an inline style the CSP refuses, which is why
// no other page uses it.) Display only: the API behind the screen decides again on every request.
export default async function ProgramRoute({ params }: { params: Promise<{ id: string }> }) {
  const { session, isSuperAdmin } = await requirePageSession();
  const { id } = await params;
  const viewer = SHAPE.test(id) ? await viewerOf(session.userId, id) : null;
  if (!viewer) {
    return (
      <div className="space-y-4">
        <PageHeader title="Program" />
        <p role="alert" className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
          We could not find that program.
        </p>
        <Link href="/programs" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand-fg hover:underline">
          <span aria-hidden="true">←</span>
          All programs
        </Link>
      </div>
    );
  }
  const allBranches = isSuperAdmin ? await prisma.branch.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }) : [];
  return <ProgramPage id={id} allBranches={allBranches} />;
}
