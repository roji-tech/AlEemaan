import type { ReactNode } from "react";
import { mailtoHref, telHref, websiteHref, type PublicContact } from "@/lib/landing/contact";

// The sections of the landing page that are this school's own (task 0070), drawn through the shared `LandingPage`'s `children` slot on both the English and the Arabic page: what the school
// teaches, what it stands for, and how to ask about a place and reach the school. The programs and the values are words (`brand.landing.about`, `landingAr.about`); the ways to reach the school
// are the school's profile, typed in Settings and read by `getPublicContact()`. A value becomes a link only when it is safe as an address (`mailto:`, `tel:`, an http or https website);
// anything else is plain text. The contact section is not drawn while the profile has no contact detail. Landmarks and headings as the shared page: an h2 for each section, an h3 for each item.

export type SchoolAbout = {
  programsHeading: string;
  programs: readonly { title: string; text: string }[];
  valuesHeading: string;
  values: readonly { title: string; text: string }[];
  contactHeading: string;
  contactText: string;
  contactLabels: { phone: string; email: string; address: string; website: string };
};

const FRAME = "mx-auto w-full max-w-6xl px-4 sm:px-8";
const LINK =
  "rounded underline underline-offset-4 hover:text-brand-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold tracking-wide text-fg-2 uppercase">{label}</dt>
      <dd className="mt-1 text-base text-fg">{children}</dd>
    </div>
  );
}

export function SchoolInfo({ about, contact }: { about: SchoolAbout; contact: PublicContact }) {
  const mail = contact.email ? mailtoHref(contact.email) : null;
  const tel = contact.phone ? telHref(contact.phone) : null;
  const site = contact.website ? websiteHref(contact.website) : null;
  const reachable = Boolean(contact.phone || contact.email || contact.address || contact.website);
  return (
    <>
      <section aria-labelledby="landing-programs" className="border-t border-line bg-surface">
        <div className={`${FRAME} py-14 sm:py-20`}>
          <h2 id="landing-programs" className="text-2xl font-bold tracking-tight sm:text-3xl">
            {about.programsHeading}
          </h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-3">
            {about.programs.map((item) => (
              <li key={item.title} className="rounded-2xl border border-line bg-canvas p-6">
                <h3 className="text-base font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-fg-muted">{item.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="landing-values" className="border-t border-line">
        <div className={`${FRAME} py-14 sm:py-20`}>
          <h2 id="landing-values" className="text-2xl font-bold tracking-tight sm:text-3xl">
            {about.valuesHeading}
          </h2>
          <ul className="mt-8 grid gap-x-10 gap-y-6 sm:grid-cols-2">
            {about.values.map((item) => (
              <li key={item.title}>
                <h3 className="text-base font-semibold">{item.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-fg-muted">{item.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {reachable && (
        <section aria-labelledby="landing-contact" className="border-t border-line bg-surface">
          <div className={`${FRAME} py-14 sm:py-20`}>
            <h2 id="landing-contact" className="text-2xl font-bold tracking-tight sm:text-3xl">
              {about.contactHeading}
            </h2>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-fg-2">{about.contactText}</p>
            <dl className="mt-8 grid gap-x-10 gap-y-5 sm:grid-cols-2">
              {contact.phone && (
                <Detail label={about.contactLabels.phone}>
                  <span dir="ltr" className="inline-block">
                    {tel ? (
                      <a href={tel} className={LINK}>
                        {contact.phone}
                      </a>
                    ) : (
                      contact.phone
                    )}
                  </span>
                </Detail>
              )}
              {contact.email && (
                <Detail label={about.contactLabels.email}>
                  <span dir="ltr" className="inline-block break-all">
                    {mail ? (
                      <a href={mail} className={LINK}>
                        {contact.email}
                      </a>
                    ) : (
                      contact.email
                    )}
                  </span>
                </Detail>
              )}
              {contact.address && (
                <Detail label={about.contactLabels.address}>
                  <span dir="auto">{contact.address}</span>
                </Detail>
              )}
              {contact.website && (
                <Detail label={about.contactLabels.website}>
                  <span dir="ltr" className="inline-block break-all">
                    {site ? (
                      <a href={site} className={LINK} rel="noopener noreferrer">
                        {contact.website}
                      </a>
                    ) : (
                      contact.website
                    )}
                  </span>
                </Detail>
              )}
            </dl>
          </div>
        </section>
      )}
    </>
  );
}
