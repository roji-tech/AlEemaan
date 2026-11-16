import type { Metadata } from "next";
import Link from "next/link";
import { CurriculumTabs, type Programme } from "@/components/site/CurriculumTabs";
import { SiteIcon, type SiteIconName } from "@/components/site/icons";
import { BTN, PageHeader, WRAP } from "@/components/site/parts";

// Academic programmes (task 0080), the old `/academics` page as React and Tailwind; it is `/our-academics` here because `/academics` is the application's own page. The subjects are the old page's, as they were.
// The Quran programme's commented-out "Science Subjects" card and the calendar's commented-out timeline are not drawn.
export const metadata: Metadata = {
  title: { absolute: "Academic Programs | Aleeman School" },
  description: "Science and Arabic curriculum, subjects and departments at Aleeman School of Science & Arabic Study.",
};

const PROGRAMMES: Programme[] = [
  {
    id: "western",
    label: "Western Program",
    heading: "Western Program",
    levels: [
      {
        label: "Secondary School",
        cards: [
          {
            icon: "award",
            title: "Senior Secondary",
            fees: true,
            items: [
              "Mathematics",
              "English Language",
              "Physics / Account",
              "Chemistry / Government",
              "Biology",
              "Further Mathematics",
              "Digital Technology",
              "Geography / Economics",
              "Islamic Studies",
              "Yoruba Language",
            ],
          },
          {
            icon: "bookOpen",
            title: "Junior Secondary",
            fees: true,
            items: [
              "Mathematics",
              "English Language",
              "Basic Science",
              "Basic Technology",
              "National Values",
              "Business Studies",
              "Digital Technology",
              "Science",
              "Islamic Religious Studies",
              "Pre-Vocational studies",
            ],
          },
        ],
      },
      {
        label: "Primary School",
        cards: [
          {
            icon: "star",
            title: "Pre-Primary (Nursery 1, Nursery 2, Prep A)",
            fees: true,
            items: [
              "English Language",
              "Mathematics",
              "Phonics",
              "Rhymes",
              "Verbal Reasoning",
              "Quantitative Reasoning",
              "Rhymes & Songs",
              "Arabic",
              "Quran",
            ],
          },
          {
            icon: "user",
            title: "Primary (Prep B & Primary 1 – 5)",
            fees: true,
            items: [
              "English Language",
              "Mathematics",
              "Basic Science & Tech",
              "Yoruba Language",
              "Phonics",
              "Islamic Religious Studies",
              "Arabic Language",
              "Verbal Reasoning",
              "Quantitative Reasoning",
              "Hand Writing",
            ],
          },
        ],
      },
    ],
  },
  {
    id: "arabic",
    label: "Arabic Program",
    heading: "Arabic & Islamic Studies Program",
    levels: [
      {
        cards: [
          {
            icon: "book",
            title: "Core Subjects",
            fees: true,
            items: [
              "Qur'anic Studies (Hifz & Tajweed)",
              "Arabic Language (Reading & Writing)",
              "Islamic Jurisprudence (Fiqh)",
              "Prophetic Traditions (Hadith)",
              "Islamic History",
              "Arabic Literature",
            ],
          },
          {
            icon: "globe",
            title: "Language Focus",
            items: ["Modern Standard Arabic", "Arabic Grammar (Nahw & Sarf)", "Arabic Conversation", "Translation Studies"],
          },
        ],
      },
    ],
  },
  {
    id: "quran",
    label: "Quran Program",
    heading: "Quran Program",
    levels: [{ cards: [{ icon: "mosque", title: "Quran", items: ["Qur'anic Memorization", "Arabic Language", "Islamic Studies"] }] }],
  },
];

const DEPARTMENTS: { icon: SiteIconName; title: string; text: string }[] = [
  { icon: "atom", title: "Science Department", text: "Physics, Chemistry, Biology, Mathematics, Computer Science" },
  { icon: "mosque", title: "Arabic & Islamic Studies", text: "Qur'an, Hadith, Fiqh, Arabic Language, Islamic History" },
  { icon: "globe", title: "Languages Department", text: "English, Arabic, French, Translation Studies" },
  { icon: "users", title: "Humanities & Social Sciences", text: "Geography, Economics, Civic Education, History" },
];

export default function AcademicsPage() {
  return (
    <>
      <PageHeader title="Academic Programs" text="Science & Arabic Curriculum, Subjects & Departments" />

      <section id="curriculum" className="scroll-mt-24 bg-[#f5f5f5] py-24">
        <div className={WRAP}>
          <h2 className="mb-2 text-center text-3xl font-bold text-[#006400] sm:text-4xl">Our Curriculum</h2>
          <p className="mb-10 text-center text-[#666]">Combining Modern Science with Traditional Arabic Studies</p>
          <CurriculumTabs programmes={PROGRAMMES} />
        </div>
      </section>

      <section className="bg-white py-24">
        <div className={WRAP}>
          <h2 className="mb-12 text-center text-3xl font-bold text-[#006400] sm:text-4xl">Academic Departments</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {DEPARTMENTS.map((d) => (
              <article
                key={d.title}
                className="rounded-[15px] bg-[#f5f5f5] p-8 text-center transition-all hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(0,0,0,0.15)]"
              >
                <div className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-[#2a7f4f]/10 text-[#2a7f4f]">
                  <SiteIcon name={d.icon} className="size-7" />
                </div>
                <h3 className="mb-2 text-lg font-bold">{d.title}</h3>
                <p className="text-sm text-[#666]">{d.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="calendar" className="scroll-mt-24 bg-[#f5f5f5] py-24 text-center">
        <div className={WRAP}>
          <h2 className="mb-8 text-3xl font-bold text-[#006400] sm:text-4xl">Academic Calendar {new Date().getFullYear()}</h2>
          <Link href="/subjects" prefetch={false} className={`${BTN} border-transparent bg-[#2a7f4f] text-white hover:bg-[#006400]`}>
            View Full Calendar
          </Link>
        </div>
      </section>
    </>
  );
}
