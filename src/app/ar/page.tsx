import type { Metadata } from "next";
import { Noto_Naskh_Arabic } from "next/font/google";
import { LandingPage } from "@/components/landing/LandingPage";
import { leaveUnlessVisitor } from "@/lib/landing/start";
import { labelsAr, landingAr, nameAr } from "@/lib/landing-ar";

// The start page in Arabic, right to left (task 0050): the same page as `/` (the same shared component, the same decision about who is shown it), with the words of `src/lib/landing-ar.ts`.
// The `lang` and `dir` are on the page's own outer element (the root layout's `<html lang="en">` is shared with every page); the Arabic font is loaded for this page only, by `next/font`
// (self-hosted at build, so the page policy's `font-src 'self'` allows it), and the few Latin words on the page fall back to the system's sans.
export const dynamic = "force-dynamic";

const naskh = Noto_Naskh_Arabic({ subsets: ["arabic"], variable: "--font-arabic", display: "swap" });

export const metadata: Metadata = { title: { absolute: landingAr.title }, description: landingAr.description };

export default async function ArabicHome() {
  await leaveUnlessVisitor();
  return (
    <div className={`${naskh.variable} font-[family-name:var(--font-arabic)]`}>
      <LandingPage
        copy={landingAr}
        name={nameAr}
        labels={labelsAr}
        lang="ar"
        dir="rtl"
        switchTo={{ href: "/", label: "English", lang: "en" }}
      />
    </div>
  );
}
