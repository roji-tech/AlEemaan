import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePageSession } from "@/lib/auth/page-session";
import { PageHeader } from "@/components/shell/PageHeader";
import { FormPage } from "@/components/forms/FormPage";

export const metadata: Metadata = { title: "Form" };
export const dynamic = "force-dynamic";

const STAFF = new Set(["ADMIN", "TEACHING_STAFF", "NON_TEACHING_STAFF"]);
const SHAPE = /^[A-Za-z0-9_-]{1,64}$/;

const Sentence = ({ children, back }: { children: string; back?: boolean }) => (
  <div className="space-y-4">
    <PageHeader title="Form" />
    <p role="alert" className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
      {children}
    </p>
    {back && (
      <Link href="/forms" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand-fg hover:underline">
        <span aria-hidden="true">←</span>
        Back to Forms
      </Link>
    )}
  </div>
);

// One form (Task 0041, slice F2a). The page only finds the form's branch and kind so the screen can ask the APIs for the rest; it says nothing about a form in a branch where the
// person is not staff, which looks exactly like a form that does not exist. Display only: the APIs behind it decide who may do what.
export default async function FormRoute({ params }: { params: Promise<{ id: string }> }) {
  const { memberships, isSuperAdmin } = await requirePageSession();
  if (!isSuperAdmin && !memberships.some((m) => STAFF.has(m.role))) return <Sentence>Only staff can open this page.</Sentence>;

  const { id } = await params;
  const form = SHAPE.test(id)
    ? await prisma.form.findFirst({ where: { id }, select: { id: true, branchId: true, kind: true, title: true } })
    : null;
  const mayOpen = form !== null && (isSuperAdmin || memberships.some((m) => STAFF.has(m.role) && m.branchId === form.branchId));
  if (!form || !mayOpen) return <Sentence back>We could not find that form.</Sentence>;

  return <FormPage formId={form.id} branchId={form.branchId} kind={form.kind} initialTitle={form.title} />;
}
