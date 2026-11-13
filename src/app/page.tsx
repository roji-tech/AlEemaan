import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/LandingPage";
import { SchoolInfo } from "@/components/landing/SchoolInfo";
import { brand } from "@/lib/brand";
import { eyebrowWithMotto, getPublicContact } from "@/lib/landing/contact";
import { leaveUnlessVisitor } from "@/lib/landing/start";

// The start page. A signed-in person goes straight to their dashboard and an instance whose first-run setup is not finished to its setup wizard; anyone else (a visitor, a person signed out, a
// setup state that could not be read) sees the landing page (tasks 0048 and 0049), which sets nothing and offers the way in. Its header links to the same page in Arabic, `/ar` (task 0050).
// Depends on the session cookie, so never statically cached.
export const dynamic = "force-dynamic";

// The root layout's template would repeat the name in the tab, so the title is absolute.
export const metadata: Metadata = { title: { absolute: brand.landing.title }, description: brand.landing.description };

export default async function Home() {
  await leaveUnlessVisitor();
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
