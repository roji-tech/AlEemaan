import type { Metadata } from "next";
import { SiteIcon, type SiteIconName } from "@/components/site/icons";
import { PageHeader, WRAP } from "@/components/site/parts";

// Subjects and curriculum (task 0080), the old static page as React and Tailwind: the class levels, each with a link to its subject list (a PDF the school keeps in Google Drive; the links are the old page's). The old page
// opened the PDF from a button with an inline script; here it is a link that opens in a new tab.
export const metadata: Metadata = {
  title: { absolute: "Subjects & Curriculum | Aleeman School" },
  description: "The subject lists for every class at Aleeman School, from Nursery to Senior Secondary.",
};

const PRIMARY_PDF = "https://drive.google.com/file/d/1bc0n8e0IY3hdFhgQhHFD1idt8mE-Q463/view?usp=drivesdk";
const SECONDARY_PDF = "https://drive.google.com/file/d/1YEY0OAJToxSHJvJwfrGicowHc_ycdDs5/view?usp=drivesdk";

type Level = { name: string; sub: string; badge?: string };
type Group = { title: string; icon: SiteIconName; levels: Level[] };
type Section = { tag: string; title: string; text: string; pdf: string; groups: Group[]; alt?: boolean };

const SECTIONS: Section[] = [
  {
    tag: "Foundation & Elementary",
    title: "Primary Section",
    text: "Building strong academic and moral foundations from the earliest years",
    pdf: PRIMARY_PDF,
    groups: [
      {
        title: "Pre-Primary",
        icon: "sprout",
        levels: [
          { name: "Nursery 1", sub: "Early Learning" },
          { name: "Nursery 2", sub: "Early Development" },
        ],
      },
      {
        title: "Preparatory",
        icon: "bookOpen",
        levels: [
          { name: "Prep A", sub: "Foundation Year" },
          { name: "Prep B", sub: "Transition Year" },
        ],
      },
      { title: "Primary", icon: "book", levels: [1, 2, 3, 4, 5].map((n) => ({ name: `Primary ${n}`, sub: `Year ${n}` })) },
    ],
  },
  {
    tag: "Advanced Studies",
    title: "Secondary Section",
    text: "Preparing students for excellence in examinations and lifelong achievement",
    pdf: SECONDARY_PDF,
    alt: true,
    groups: [
      {
        title: "Junior Secondary School",
        icon: "bookOpen",
        levels: [1, 2, 3].map((n) => ({ name: `JSS ${n}`, sub: "Junior Secondary", badge: `Year ${n}` })),
      },
      {
        title: "Senior Secondary School",
        icon: "award",
        levels: [1, 2, 3].map((n) => ({ name: `SS ${n}`, sub: "Senior Secondary", badge: `Year ${n}` })),
      },
    ],
  },
];

export default function SubjectsPage() {
  return (
    <>
      <PageHeader
        title="Subjects & Curriculum"
        text="Comprehensive educational resources for every class level — from Nursery to Senior Secondary."
      />
      {SECTIONS.map((s) => (
        <section key={s.title} className={`py-24 ${s.alt ? "bg-[#f5f5f5]" : "bg-white"}`}>
          <div className={WRAP}>
            <div className="mb-12 text-center">
              <span className="mb-4 inline-block rounded-full bg-[#2a7f4f]/10 px-5 py-1.5 text-sm font-semibold tracking-wider text-[#1f6b40] uppercase">
                {s.tag}
              </span>
              <h2 className="mb-3 text-3xl font-bold text-[#006400] sm:text-4xl">{s.title}</h2>
              <p className="text-[#666]">{s.text}</p>
            </div>
            {s.groups.map((g) => (
              <div key={g.title} className="mb-10">
                <h3 className="mb-4 flex items-center gap-2 border-b-2 border-[#2a7f4f]/20 pb-2 text-xl font-bold text-[#006400]">
                  <SiteIcon name={g.icon} className="size-5" />
                  {g.title}
                </h3>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {g.levels.map((l) => (
                    <article
                      key={l.name}
                      className="flex flex-col items-center rounded-[15px] bg-white p-6 text-center shadow-[0_4px_12px_rgba(0,0,0,0.12)] transition-all hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(0,0,0,0.15)]"
                    >
                      <h4 className="text-lg font-bold">{l.name}</h4>
                      <p className="mb-1 text-sm text-[#666]">{l.sub}</p>
                      {l.badge && (
                        <span className="mb-3 rounded-full bg-[#2a7f4f]/10 px-3 py-0.5 text-xs font-semibold text-[#1f6b40]">
                          {l.badge}
                        </span>
                      )}
                      <a
                        href={s.pdf}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-auto inline-flex items-center gap-2 rounded-full bg-[#2a7f4f] px-5 py-2 text-sm font-semibold text-white hover:bg-[#006400] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2a7f4f]"
                      >
                        <SiteIcon name="fileText" className="size-4" />
                        Get PDF<span className="sr-only"> for {l.name}</span>
                      </a>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
