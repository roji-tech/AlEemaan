"use client";

import Link from "next/link";
import { useId, useRef, useState, useSyncExternalStore } from "react";
import { SiteIcon, type SiteIconName } from "./icons";

export type Programme = {
  id: string;
  label: string;
  heading: string;
  levels: { label?: string; cards: { icon: SiteIconName; title: string; fees?: boolean; items: string[] }[] }[];
};

// The curriculum tabs of the school website's Academics page (task 0080): three programmes, one shown at a time. Arrow keys, Home and End move between the tabs as the tab pattern asks. A link such as
// `/our-academics#arabic` opens the matching programme (the home page links to #science, #combined and #arabic).
const HASH_TAB: Record<string, string> = {
  arabic: "arabic",
  quran: "quran",
  western: "western",
  science: "western",
  combined: "western",
  curriculum: "western",
};

const subscribeHash = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
};

export function CurriculumTabs({ programmes }: { programmes: Programme[] }) {
  // The tab the person chose, else the one the address names (`#arabic`), else the first. The address is read through a subscription, so the server and the first browser render agree (an empty hash).
  const hash = useSyncExternalStore(
    subscribeHash,
    () => window.location.hash.slice(1),
    () => "",
  );
  const [chosen, setActive] = useState<string | null>(null);
  const fromHash = HASH_TAB[hash];
  const active = chosen ?? (fromHash && programmes.some((p) => p.id === fromHash) ? fromHash : programmes[0].id);
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const move = (to: number) => {
    const next = (to + programmes.length) % programmes.length;
    setActive(programmes[next].id);
    refs.current[next]?.focus();
  };

  return (
    <div>
      <div role="tablist" aria-label="Programmes" className="mb-8 flex flex-wrap justify-center gap-3">
        {programmes.map((p, i) => (
          <button
            key={p.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            type="button"
            id={`${base}-tab-${p.id}`}
            aria-selected={active === p.id}
            aria-controls={`${base}-panel-${p.id}`}
            tabIndex={active === p.id ? 0 : -1}
            onClick={() => setActive(p.id)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") move(i + 1);
              else if (e.key === "ArrowLeft") move(i - 1);
              else if (e.key === "Home") move(0);
              else if (e.key === "End") move(programmes.length - 1);
              else return;
              e.preventDefault();
            }}
            className={`rounded-full border-2 border-[#2a7f4f] px-6 py-2.5 font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2a7f4f] ${active === p.id ? "bg-[#2a7f4f] text-white" : "bg-white text-[#2a7f4f] hover:bg-[#2a7f4f]/10"}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {programmes.map((p) => (
        <div key={p.id} role="tabpanel" id={`${base}-panel-${p.id}`} aria-labelledby={`${base}-tab-${p.id}`} hidden={active !== p.id}>
          <h3 className="mb-6 text-center text-2xl font-bold text-[#006400]">{p.heading}</h3>
          {p.levels.map((level, li) => (
            <div key={li} className="mb-8">
              {level.label && (
                <p className="mb-4 flex items-center gap-2 border-b-2 border-[#2a7f4f]/20 py-2 font-bold text-[#006400]">
                  <SiteIcon name="bookOpen" className="size-5" />
                  {level.label}
                </p>
              )}
              <div className="grid gap-6 md:grid-cols-2">
                {level.cards.map((c) => (
                  <article key={c.title} className="rounded-[15px] bg-white p-8 shadow-[0_4px_12px_rgba(0,0,0,0.12)]">
                    <h4 className="mb-3 flex items-center gap-2 text-lg font-bold text-[#006400]">
                      <SiteIcon name={c.icon} className="size-5 text-[#2a7f4f]" />
                      {c.title}
                    </h4>
                    {c.fees && (
                      <Link
                        href="/admissions#fees"
                        prefetch={false}
                        className="mb-3 inline-flex items-center gap-2 font-semibold text-[#2a7f4f] underline-offset-4 hover:underline"
                      >
                        <SiteIcon name="coins" className="size-4" />
                        Fees
                      </Link>
                    )}
                    <ul className="list-disc space-y-1 pl-5 text-[#555] marker:text-[#2a7f4f]">
                      {c.items.map((it) => (
                        <li key={it}>{it}</li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
