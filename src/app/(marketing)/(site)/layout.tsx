import type { ReactNode } from "react";
import { ScrollTopButton } from "@/components/site/ScrollTopButton";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";

// The frame of the school's own website (task 0080): its header, its footer, the scroll button and the academic-year note. The site has its own light look whatever theme the application is on (`[color-scheme:light]`,
// fixed colours), because it is the school's public face and not part of the application.
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f9f9f9] font-[Segoe_UI,Tahoma,Geneva,Verdana,sans-serif] leading-relaxed text-[#333] [color-scheme:light]">
      <div className="site-print-hide">
        <SiteHeader />
      </div>
      <main id="main">{children}</main>
      <div className="site-print-hide">
        <SiteFooter />
      </div>
      <div className="site-print-hide">
        <ScrollTopButton />
      </div>
      <p
        role="note"
        aria-label="Academic year"
        className="site-print-hide fixed bottom-6 left-2.5 z-40 rounded-[10px] border border-white/15 bg-[rgba(20,20,20,0.88)] px-2.5 py-2 text-xs font-semibold text-white shadow-[0_8px_24px_rgba(0,0,0,0.25)] backdrop-blur-md select-none sm:bottom-5 sm:left-4 sm:rounded-xl sm:px-3.5 sm:py-2.5 sm:text-sm"
      >
        Proudly 2024 / 2025 Set
      </p>
    </div>
  );
}
