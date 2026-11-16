"use client";

import { useEffect, useState } from "react";
import { SiteIcon } from "./icons";

/// A round button that appears once the page is scrolled past 300 px and scrolls back to the top (smoothly unless the person asked for less motion).
export function ScrollTopButton() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const onScroll = () => setShown(window.scrollY > 300);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <button
      type="button"
      aria-label="Scroll to top"
      onClick={() =>
        window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })
      }
      className={`site-print-hide fixed right-7 bottom-7 z-40 grid size-[50px] place-items-center rounded-full bg-[#2a7f4f] text-white shadow-[0_8px_24px_rgba(0,0,0,0.15)] transition-all hover:bg-[#006400] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2a7f4f] ${shown ? "visible opacity-100" : "invisible opacity-0"}`}
    >
      <SiteIcon name="arrowUp" className="size-5" />
    </button>
  );
}
