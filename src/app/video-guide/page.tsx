import type { Metadata } from "next";
import Link from "next/link";
import { requirePageSession } from "@/lib/auth/page-session";
import { VideoGuideView } from "./VideoGuideView";

export const metadata: Metadata = { title: "Video guide" };
export const dynamic = "force-dynamic";

// The product guide is for superadmins for now (the maintainer's call, 2026-11-17). Signed out goes to sign-in; anyone else signed in is told so, and nothing of the guide is sent to them
// (the page itself is the client component, which is not rendered for them). The video and PDF are files under /public: this page is where they are offered, and the access check is on
// the page; serving the files themselves only to a signed-in superadmin would need them behind a route, which is a separate step.
export default async function VideoGuidePage() {
  const { isSuperAdmin } = await requirePageSession();
  if (!isSuperAdmin) {
    return (
      <main id="main" className="mx-auto flex min-h-screen max-w-xl items-center px-4 py-10">
        <div role="alert" className="w-full rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-7">
          <h1 className="text-lg font-semibold text-fg">You don&apos;t have access to this page</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
            The video guide is open to superadmins only for now. If you think you should have access, ask your school administrator.
          </p>
          <Link
            href="/dashboard"
            className="mt-2 inline-flex min-h-11 items-center rounded-md text-sm font-semibold text-brand-fg hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Back to overview
          </Link>
        </div>
      </main>
    );
  }
  return <VideoGuideView />;
}
