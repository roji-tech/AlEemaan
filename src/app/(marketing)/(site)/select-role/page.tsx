import type { Metadata } from "next";
import { headers } from "next/headers";
import { PORTAL_ICONS } from "@/components/auth/portalIcons";
import { PageHeader, WRAP } from "@/components/site/parts";
import { hostFromHeaders } from "@/lib/auth/csrf";
import { classifyHost, PORTAL_COPY, portalOrigin, readPortalConfig, type Portal } from "@/lib/portals";

// Sign in, on the school's website: a button for each kind of person, so nobody lands on a sign-in form that is not theirs. With the sign-in portals off (PORTALS_ENABLED=false) every
// button is the school's one sign-in form, on this same address; on, each button is its own portal's address (parent., student., staff. of the school's domain, or the names set in
// the environment). Administrators are not advertised here: they have their own address. It is a website page, so on a portal it is sent to the school's own host.
export const metadata: Metadata = {
  title: { absolute: "Sign in | Aleeman School" },
  description: "Sign in to Aleeman School's online portal as a parent, a student or a member of staff.",
};
// Depends on the host the visitor came to, never statically cached.
export const dynamic = "force-dynamic";

/// Who signs in here, in the order the school gave.
const WHO: Portal[] = ["parent", "student", "staff"];

export default async function SignInPage() {
  const { config } = readPortalConfig();
  const host = hostFromHeaders(await headers());
  const info = classifyHost(host, config);
  const protocol = (process.env.APP_URL ?? "").startsWith("https://") ? "https:" : "http:";
  const choices = WHO.flatMap((id) => {
    if (info.kind === "off") return [{ id, href: "/login", ...PORTAL_COPY[id] }];
    const origin = portalOrigin(id, info, config, host, protocol);
    return origin ? [{ id, href: `${origin}/login`, ...PORTAL_COPY[id] }] : [];
  });

  return (
    <>
      <PageHeader title="Sign in" text="Choose how you sign in to the school's online portal." />
      <section className="px-5 py-16">
        <div className={WRAP}>
          <ul aria-label="Sign-in portals" className="mx-auto grid max-w-4xl gap-6 sm:grid-cols-3">
            {choices.map(({ id, href, title, line }) => {
              const Icon = PORTAL_ICONS[id];
              return (
                <li key={id} className="flex">
                  <a
                    href={href}
                    className="group flex w-full flex-col items-center rounded-[15px] bg-white p-8 text-center shadow-[0_4px_12px_rgba(0,0,0,0.12)] transition-all hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2a7f4f]"
                  >
                    <span
                      aria-hidden="true"
                      className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#2a7f4f]/10 text-[#1f6b40]"
                    >
                      <Icon className="h-8 w-8" />
                    </span>
                    <span className="text-xl font-bold text-[#1a3c2a]">{title}</span>
                    <span className="mt-1 mb-6 text-sm text-[#555]">{line}</span>
                    <span className="mt-auto rounded-full border-2 border-[#2a7f4f] bg-[#2a7f4f] px-8 py-2.5 font-semibold text-white transition-colors group-hover:bg-[#1f6b40]">
                      Sign in
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </>
  );
}
