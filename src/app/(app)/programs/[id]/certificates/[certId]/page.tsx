import type { Metadata } from "next";
import Link from "next/link";
import { requirePageSession } from "@/lib/auth/page-session";
import { viewerOf } from "@/lib/programs/access";
import { PageHeader } from "@/components/shell/PageHeader";
import { CertificatePrint } from "@/components/programs/CertificatePrint";

export const metadata: Metadata = { title: "Certificate", referrer: "no-referrer", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const SHAPE = /^[A-Za-z0-9_-]{1,64}$/;

// One certificate, print-ready (task 0043, slice P5). Whoever has no place in the program is told "We could not find that certificate.", the same as for one that does not exist; the
// certificate itself is fetched from the API, which decides again who may see it. Printed from the browser: there is no PDF library.
export default async function CertificateRoute({ params }: { params: Promise<{ id: string; certId: string }> }) {
  const { session } = await requirePageSession();
  const { id, certId } = await params;
  const viewer = SHAPE.test(id) && SHAPE.test(certId) ? await viewerOf(session.userId, id) : null;
  if (!viewer) {
    return (
      <div className="space-y-4">
        <PageHeader title="Certificate" />
        <p role="alert" className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
          We could not find that certificate.
        </p>
        <Link href="/programs" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand-fg hover:underline">
          <span aria-hidden="true">←</span>
          All programs
        </Link>
      </div>
    );
  }
  return <CertificatePrint programId={id} certId={certId} />;
}
