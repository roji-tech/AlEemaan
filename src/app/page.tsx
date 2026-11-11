import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LandingPage } from "@/components/landing/LandingPage";
import { getSession } from "@/lib/auth/session";
import { brand } from "@/lib/brand";
import { isSetupComplete } from "@/lib/setup/status";

// The start page. A signed-in person goes straight to their dashboard and an instance whose first-run setup is not finished to its setup wizard; anyone else (a visitor, a person signed out, a
// setup state that could not be read) sees the landing page (task 0048), which sets nothing and offers the way in. Depends on the session cookie, so never statically cached.
export const dynamic = "force-dynamic";

// The root layout's template would repeat the name in the tab, so the title is absolute.
export const metadata: Metadata = { title: { absolute: brand.landing.title }, description: brand.landing.description };

export default async function Home() {
  if (await getSession()) redirect("/dashboard");
  if ((await isSetupComplete()) === false) redirect("/setup");
  return <LandingPage />;
}
