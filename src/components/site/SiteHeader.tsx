"use client";

import { SiteImage } from "./SiteImage";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { SITE_NAV, SITE_SIGN_IN } from "@/lib/school-site/nav";
import { SiteIcon } from "./icons";

// The school website's header (task 0080): the logo, the links, and a menu button on a narrow screen. The menu closes on a link, on Escape and on a press outside it; the bar's shadow deepens once the page is scrolled.
const LINK =
  "relative py-2 font-medium text-[#333] transition-colors hover:text-[#2a7f4f] after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-0 after:bg-[#2a7f4f] after:transition-all hover:after:w-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2a7f4f]";

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onPress = (e: MouseEvent) => {
      if (!(e.target as Element).closest("[data-site-nav]")) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onPress);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onPress);
    };
  }, [open]);

  return (
    <header
      className={`site-print-hide sticky top-0 z-50 bg-white transition-shadow ${scrolled ? "shadow-[0_8px_24px_rgba(0,0,0,0.15)]" : "shadow-[0_4px_12px_rgba(0,0,0,0.12)]"}`}
    >
      <div data-site-nav className="mx-auto flex w-[90%] max-w-[1200px] items-center justify-between px-5 py-4">
        <Link
          href="/"
          prefetch={false}
          className="flex items-center text-2xl font-bold text-[#006400] transition-transform hover:scale-105"
        >
          <SiteImage
            src="/school-site/aleeman-logo.png"
            alt="Aleeman School logo"
            width={66}
            height={45}
            className="mr-3 h-[45px] w-auto"
          />
          <span>Aleeman School</span>
        </Link>
        <button
          type="button"
          className="rounded p-1 text-[#2a7f4f] md:hidden"
          aria-label={open ? "Close the menu" : "Open the menu"}
          aria-expanded={open}
          aria-controls="site-menu"
          onClick={() => setOpen((v) => !v)}
        >
          <SiteIcon name={open ? "x" : "menu"} className="size-7" />
        </button>
        <nav
          id="site-menu"
          aria-label="Main"
          className={`${open ? "flex" : "hidden"} absolute inset-x-0 top-full flex-col gap-1 bg-white px-5 pb-4 shadow-[0_8px_24px_rgba(0,0,0,0.15)] md:static md:flex md:flex-row md:items-center md:gap-8 md:p-0 md:shadow-none`}
        >
          {SITE_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              aria-current={pathname === item.href ? "page" : undefined}
              onClick={() => setOpen(false)}
              className={`${LINK} ${pathname === item.href ? "text-[#2a7f4f] after:w-full" : ""}`}
            >
              {item.label}
            </Link>
          ))}
          <Link
            href={SITE_SIGN_IN.href}
            prefetch={false}
            className="rounded-full border-2 border-[#2a7f4f] px-5 py-1.5 text-center font-semibold text-[#2a7f4f] transition-colors hover:bg-[#2a7f4f] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2a7f4f]"
          >
            {SITE_SIGN_IN.label}
          </Link>
        </nav>
      </div>
    </header>
  );
}
