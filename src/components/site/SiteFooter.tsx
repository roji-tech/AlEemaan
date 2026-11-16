import { SiteImage } from "./SiteImage";
import Link from "next/link";
import { SITE_CONTACT, SITE_NAV } from "@/lib/school-site/nav";
import { SiteIcon } from "./icons";

// The school website's footer (task 0080). The old footer's social, Events, Privacy and Terms links all pointed at "#" (nowhere) and are not drawn; the year is the server's.
const QUICK = SITE_NAV.filter((n) => ["/about", "/our-academics", "/admissions", "/contact"].includes(n.href));

export function SiteFooter() {
  return (
    <footer className="site-print-hide bg-[linear-gradient(135deg,#006400,#2a7f4f)] pt-16 text-white">
      <div className="mx-auto w-[90%] max-w-[1200px] px-5">
        <div className="mb-12 grid gap-12 md:grid-cols-3">
          <div>
            <div className="mb-4 flex items-center">
              <SiteImage src="/school-site/aleeman-logo.png" alt="" width={59} height={40} className="mr-2.5 h-10 w-auto" />
              <p className="text-xl font-semibold">Aleeman School</p>
            </div>
            <p>School of Science and Arabic Study</p>
            <p className="mt-2 italic opacity-90">&ldquo;Second To None&rdquo;</p>
          </div>
          <nav aria-label="Quick links">
            <h2 className="mb-6 text-lg font-semibold">Quick Links</h2>
            <ul className="space-y-2">
              {QUICK.map((n) => (
                <li key={n.href}>
                  <Link href={n.href} prefetch={false} className="opacity-90 underline-offset-4 hover:underline hover:opacity-100">
                    {n.label === "Academics" ? "Academic Programs" : n.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div>
            <h2 className="mb-6 text-lg font-semibold">Contact Info</h2>
            <ul className="space-y-3 opacity-95">
              <li className="flex items-center gap-3">
                <SiteIcon name="mapPin" className="size-4 shrink-0" />
                {SITE_CONTACT.place}
              </li>
              <li className="flex items-center gap-3">
                <SiteIcon name="phone" className="size-4 shrink-0" />
                <a href={SITE_CONTACT.phoneHref} className="underline-offset-4 hover:underline">
                  {SITE_CONTACT.phone}
                </a>
              </li>
              <li className="flex items-center gap-3">
                <SiteIcon name="mail" className="size-4 shrink-0" />
                <a href={`mailto:${SITE_CONTACT.email}`} className="break-all underline-offset-4 hover:underline">
                  {SITE_CONTACT.email}
                </a>
              </li>
              <li className="flex items-center gap-3">
                <SiteIcon name="clock" className="size-4 shrink-0" />
                {SITE_CONTACT.hours}
              </li>
            </ul>
          </div>
        </div>
        <p className="border-t border-white/20 py-6 text-center text-sm opacity-90">
          &copy; {new Date().getFullYear()} Aleeman School. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
