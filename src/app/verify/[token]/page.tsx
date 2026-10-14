import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { verifyToken } from "@/lib/academics/report-card";

// Public. Shows only what verifyToken returns: that a published result is genuine, for which class and term, and the pupil as first name and last initial - no scores,
// no admission number. `no-referrer` and `noindex`: the address carries the bearer code, and a search engine has no business holding it.
export const metadata: Metadata = { title: "Verify a result", referrer: "no-referrer", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function VerifyPage({ params }: { params: Promise<{ token: string }> }) {
  const v = await verifyToken((await params).token);
  return (
    <AuthShell>
      <main>
        <h1 className="text-2xl font-bold tracking-tight text-fg">Verify a result</h1>
        {!v ? (
          <p role="status" className="mt-4 rounded-2xl border border-line bg-surface p-4 text-sm text-fg-2">
            This verification code was not found. Check that you scanned or typed the whole code, or ask the school to confirm the result.
          </p>
        ) : !v.genuine ? (
          <p role="alert" className="mt-4 rounded-2xl border border-danger-line bg-danger-bg p-4 text-sm text-danger-fg">
            This code exists but the result it points to does not match the school&apos;s record. Do not rely on this document; contact the
            school.
          </p>
        ) : (
          <div role="status" className="mt-4 space-y-3 rounded-2xl border border-line bg-surface p-4">
            <p className="font-semibold text-fg">This result is genuine.</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-fg-muted">School</dt>
              <dd className="text-fg">
                {v.school} · {v.branch}
              </dd>
              <dt className="text-fg-muted">Pupil</dt>
              <dd className="text-fg">{v.pupil}</dd>
              <dt className="text-fg-muted">Class</dt>
              <dd className="text-fg">{v.className}</dd>
              <dt className="text-fg-muted">Term</dt>
              <dd className="text-fg">{v.period}</dd>
              <dt className="text-fg-muted">Subject</dt>
              <dd className="text-fg">{v.subject}</dd>
              <dt className="text-fg-muted">Published</dt>
              <dd className="text-fg">
                {new Date(v.publishedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}
              </dd>
            </dl>
            <p className="text-xs text-fg-muted">
              This page confirms the result exists and was published by the school. It does not show the marks.
            </p>
          </div>
        )}
      </main>
    </AuthShell>
  );
}
