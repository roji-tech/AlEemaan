import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/LandingPage";
import { SchoolInfo } from "@/components/landing/SchoolInfo";
import { brand } from "@/lib/brand";
import { eyebrowWithMotto, getPublicContact } from "@/lib/landing/contact";

// The product landing page (moved here from `/` by task 0080: `/` is now the school's own website, src/app/(marketing)/route.ts). Everyone sees the landing page, signed in or not (tasks 0048 and 0049; the redirect of a signed-in person to the dashboard was removed on 2026-11-18), whether or not first-run setup is
// finished (task 0078), which sets nothing and offers the way in. Its header links to the same page in Arabic, `/ar` (task 0050).
// Reads the school profile (the motto and contact details), so never statically cached.
export const dynamic = "force-dynamic";

// The root layout's template would repeat the name in the tab, so the title is absolute.
export const metadata: Metadata = { title: { absolute: brand.landing.title }, description: brand.landing.description };

export default async function Home() {
  // The motto and the ways to reach the school are the school profile in Settings (task 0070): read, never written.
  const contact = await getPublicContact();
  return (
    <LandingPage
      copy={{ ...brand.landing, eyebrow: eyebrowWithMotto(brand.landing.eyebrow, contact.motto) }}
      switchTo={{ href: "/ar", label: "العربية", lang: "ar" }}
    >
      <SchoolInfo about={brand.landing.about} contact={contact} />
    </LandingPage>
  );
}
