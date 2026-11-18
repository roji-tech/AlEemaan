import { NextResponse, type NextRequest } from "next/server";
import { isMalformedPath } from "@/lib/api/ids";
import { SCHOOL_MAP_ORIGINS } from "@/lib/school-site/paths";
import { buildCsp, generateNonce } from "@/lib/security/csp";
import { videoGuideMedia } from "@/lib/video-guide/media-base";
import { requestHost } from "@/lib/auth/csrf";
import { apexOrigin, classifyHost, isLandingPath, readPortalConfig } from "@/lib/portals";
import { RETURN_TO_HEADER } from "@/lib/auth/return-to";

// Per-request nonce-based CSP (domain-implementation-plan.md §0.5.B). Next 16 calls this file `proxy`
// (it was `middleware`). The nonce goes on the REQUEST headers — Next reads the policy from there and
// stamps the nonce on its own framework scripts while server-rendering — and on the RESPONSE, which
// is what the browser enforces. That is why every page must render dynamically (they all do).
//
// CSP_REPORT_ONLY=true sends the same policy as Content-Security-Policy-Report-Only: violations show
// in the browser console but nothing is blocked. It is a valve for diagnosing an unforeseen violation
// on a live deployment without an outage; the default is enforcing.
// The sign-in portals (task 0086): read once; none of the four `*_SUBDOMAIN` variables set means the feature is off.
const PORTALS = readPortalConfig().config;

export function proxy(request: NextRequest) {
  // Broken percent-encoding in the path ("%ff", "%ED%A0%80") makes Next answer 500 before any route runs. It is a bad request, not a server fault.
  if (isMalformedPath(request.nextUrl.pathname))
    return new NextResponse("Bad request", {
      status: 400,
      headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
    });
  // The API has its own static policy (next.config.ts); it comes through here only for the check above.
  if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.next();

  // The school's public website lives on its own host only: asked for on a sign-in portal (admin., staff., ...), the same path is sent to the school's host. A temporary redirect
  // (307), so a browser never pins it if the portals are changed.
  const host = requestHost(request);
  const info = classifyHost(host, PORTALS);
  if (info.kind === "portal" && isLandingPath(request.nextUrl.pathname)) {
    const protocol = (process.env.APP_URL ?? "").startsWith("https://") ? "https:" : "http:";
    return NextResponse.redirect(`${apexOrigin(info, host, protocol)}${request.nextUrl.pathname}${request.nextUrl.search}`, 307);
  }

  const nonce = generateNonce();
  const policy = buildCsp({
    nonce,
    dev: process.env.NODE_ENV === "development",
    https: (process.env.APP_URL ?? "").startsWith("https://"),
    // The video is kept out of git and may be hosted elsewhere: that host is allowed on the video guide page and nowhere else.
    mediaOrigin: request.nextUrl.pathname === "/video-guide" ? videoGuideMedia(process.env.NEXT_PUBLIC_VIDEO_GUIDE_BASE_URL).origin : null,
    // The school website's map (task 0080) is the one embedded frame in the application, on its contact page only.
    frameOrigin: request.nextUrl.pathname === "/contact" ? SCHOOL_MAP_ORIGINS : null,
  });
  const header = process.env.CSP_REPORT_ONLY === "true" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(header, policy);
  // Where the person is going, for a page that has to send them to sign in first (lib/auth/return-to.ts). Always overwritten here, so a caller cannot send their own.
  requestHeaders.set(RETURN_TO_HEADER, `${request.nextUrl.pathname}${request.nextUrl.search}`);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(header, policy);
  return response;
}

export const config = {
  matcher: [
    // The API: only a path with a percent sign can be badly encoded, so only those come through here, for the check above (its headers are static, next.config.ts).
    // Every other API request must NOT: a request that goes through the proxy is buffered by Next until its body ENDS before the route runs, so a body that never ends
    // would never be answered and the routes' own size cap would never get its say.
    { source: "/api/(.*%.*)" },
    // Pages. Static assets need no policy. Prefetches are skipped, as Next's guide recommends.
    {
      source: "/((?!api|_next/static|_next/image|school-site|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
