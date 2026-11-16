import type { ReactNode } from "react";

// Small pieces the school website's pages share (task 0080).

/// The page's content width, as the old site had it (90 %, at most 1200 px).
export const WRAP = "mx-auto w-[90%] max-w-[1200px] px-5";

/// Link and button shapes (a round button with a border).
export const BTN =
  "inline-block rounded-full border-2 px-9 py-3.5 text-center font-semibold transition-all hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span className="mb-4 inline-block rounded-full bg-[#2a7f4f]/10 px-5 py-1.5 text-sm font-semibold tracking-wider text-[#1f6b40] uppercase">
      {children}
    </span>
  );
}

export function SectionHeader({ label, title, text }: { label: string; title: string; text?: string }) {
  return (
    <div className="mb-12 text-center">
      <SectionLabel>{label}</SectionLabel>
      <h2 className="mb-3 text-3xl font-bold text-[#1a3c2a] sm:text-4xl">{title}</h2>
      {text && <p className="mx-auto max-w-xl text-[#666]">{text}</p>}
    </div>
  );
}

/// The green band at the head of every inner page: the one `h1`.
export function PageHeader({ title, text }: { title: string; text: string }) {
  return (
    <section className="bg-[linear-gradient(135deg,#006400,#2a7f4f)] px-5 py-16 text-center text-white">
      <h1 className="mb-3 text-4xl font-bold sm:text-5xl">{title}</h1>
      <p className="text-lg opacity-95">{text}</p>
    </section>
  );
}
