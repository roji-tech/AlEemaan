import type { Metadata } from "next";
import { SiteIcon, type SiteIconName } from "@/components/site/icons";
import { BTN, PageHeader, SectionHeader, WRAP } from "@/components/site/parts";
import { SITE_CONTACT } from "@/lib/school-site/nav";

// Careers and vacancies (task 0080), the old static page as React and Tailwind. A role opens as a native `<details>` (no script). "Apply" opens WhatsApp with the position already written in the message, as the old
// page's WhatsApp links did; the old page's script that filled a form it no longer had is not needed.
export const metadata: Metadata = {
  title: { absolute: "Careers & Vacancies | Aleeman School" },
  description: "Current teaching and administrative vacancies at Aleeman School of Science & Arabic Study, Ibadan.",
};

const WA = "2348153005393";
const wa = (text: string) => `https://wa.me/${WA}?text=${encodeURIComponent(text)}`;

const PERKS: { icon: SiteIconName; title: string; text: string }[] = [
  {
    icon: "users",
    title: "Professional Development",
    text: "Regular training, workshops and CPD opportunities to sharpen your skills and advance your career.",
  },
  {
    icon: "coins",
    title: "Competitive Salary",
    text: "Market-competitive salaries paid promptly every month, with performance-based incentives.",
  },
  {
    icon: "heart",
    title: "Collaborative Culture",
    text: "A warm, supportive environment where every staff member is valued, heard and appreciated.",
  },
  {
    icon: "shield",
    title: "Staff Welfare",
    text: "Leave entitlements, health support and recognition of staff milestones and achievements.",
  },
  {
    icon: "sprout",
    title: "Career Growth",
    text: "Clear pathways for promotion and leadership roles as our school continues to grow and expand.",
  },
  { icon: "star", title: "Purposeful Work", text: "Make a meaningful difference every day by shaping the lives of the next generation." },
];

type Vacancy = {
  title: string;
  badge: "Urgent" | "Open" | "New";
  department: string;
  summary: string;
  requirements: string[];
  responsibilities: string[];
};
const VACANCIES: Vacancy[] = [
  {
    title: "Secondary School Mathematics Teacher",
    badge: "Urgent",
    department: "Secondary Section",
    summary:
      "We are urgently seeking an experienced and results-driven Mathematics Teacher for our secondary school. The ideal candidate has a strong command of WAEC/NECO syllabus content and excellent classroom management skills.",
    requirements: [
      "B.Sc (Ed) or B.Ed in Mathematics or related science field",
      "Minimum 2 years of secondary school teaching experience",
      "Strong knowledge of WAEC, NECO and JAMB Mathematics syllabi",
      "Excellent communication and student engagement skills",
      "Ability to prepare students for competitive examinations",
      "TRCN registration is an added advantage",
    ],
    responsibilities: [
      "Plan, prepare and deliver engaging Mathematics lessons across all classes",
      "Set, mark and record assessments and examinations",
      "Provide remedial support to students who need extra attention",
      "Participate in parent-teacher meetings and school events",
      "Collaborate with colleagues on curriculum development",
    ],
  },
  {
    title: "Arabic Language & Islamic Studies Teacher",
    badge: "Open",
    department: "Arabic / Islamic Dept",
    summary:
      "As a school of science and Arabic study, we are looking for a passionate Arabic and Islamic Studies teacher who can deliver high-quality lessons in both subjects and inspire students with a love for Islamic scholarship.",
    requirements: [
      "Degree or diploma in Arabic Language, Islamic Studies or related field",
      "Fluency in Arabic (reading, writing and speaking)",
      "Experience teaching Quran memorization (Tahfeedh) is a strong advantage",
      "Minimum 1 year of classroom teaching experience",
      "Deep knowledge of Islamic jurisprudence and Tafseer",
      "Patient, devout and able to serve as a role model for students",
    ],
    responsibilities: [
      "Teach Arabic language (grammar, vocabulary, reading and writing) at all levels",
      "Deliver Islamic Studies lessons covering Fiqh, Tafseer, Hadith and Seerah",
      "Supervise Quran recitation and memorization sessions",
      "Prepare students for Islamic studies examinations",
      "Participate in school Islamic events and celebrations",
    ],
  },
  {
    title: "English Language Teacher",
    badge: "New",
    department: "English Dept",
    summary:
      "We seek a skilled English Language Teacher to deliver excellent instruction in reading, writing, grammar and literature. The ideal candidate can inspire a love for the English language and prepare students for WAEC and NECO examinations.",
    requirements: [
      "B.Ed or B.A (Ed) in English Language or Literature",
      "Minimum 2 years of teaching experience at secondary level",
      "Excellent command of written and spoken English",
      "Familiarity with WAEC English Language and Literature syllabi",
      "Strong classroom management and student motivation skills",
    ],
    responsibilities: [
      "Teach English Language and Literature across all secondary classes",
      "Develop lesson plans aligned with national and school curriculum",
      "Assess and provide feedback on student written work regularly",
      "Conduct speech, debate and creative writing activities",
      "Prepare students for public speaking and examinations",
    ],
  },
  {
    title: "Science Teacher (Biology / Chemistry / Physics)",
    badge: "Open",
    department: "Science Dept",
    summary:
      "As a school of science, we need a hands-on, enthusiastic Science Teacher to teach Biology, Chemistry or Physics. You will make science exciting through experiments, demonstrations and inquiry-based teaching.",
    requirements: [
      "B.Ed, B.Sc (Ed) or B.Sc in Biology, Chemistry, Physics or related field",
      "Minimum 1 year of secondary science teaching experience",
      "Practical laboratory skills and safety knowledge",
      "Strong understanding of WAEC and NECO science syllabi",
      "Ability to make complex concepts simple and engaging for students",
    ],
    responsibilities: [
      "Deliver theory and practical science lessons to secondary students",
      "Manage and maintain the science laboratory safely",
      "Set and mark termly tests and examination practice papers",
      "Enter students for WAEC practical examinations",
      "Encourage participation in science fairs and inter-school competitions",
    ],
  },
  {
    title: "School Administrative Officer",
    badge: "Open",
    department: "Administration",
    summary:
      "We need an organised, professional Administrative Officer to handle front-desk operations, student records, fee collection and day-to-day office management. The ideal candidate is friendly, detail-oriented and computer-literate.",
    requirements: [
      "OND, HND or B.Sc in Business Administration, Secretarial Studies or related field",
      "Minimum 1 year of office administration experience (school preferred)",
      "Proficiency in Microsoft Word and Excel",
      "Excellent written and verbal communication skills in English",
      "Friendly, professional and well-presented appearance",
      "Ability to handle sensitive information with discretion",
    ],
    responsibilities: [
      "Manage front-desk reception and direct visitor / parent enquiries",
      "Maintain and update student enrollment and academic records",
      "Process fee payments, issue receipts and update ledgers",
      "Prepare school circulars, notices and official correspondence",
      "Support management with scheduling, events and reporting",
    ],
  },
];

const BADGE = { Urgent: "bg-[#fee2e2] text-[#b91c1c]", Open: "bg-[#dcfce7] text-[#166534]", New: "bg-[#dbeafe] text-[#1e40af]" } as const;

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h4 className="mb-2 font-bold text-[#006400]">{title}</h4>
      <ul className="list-disc space-y-1.5 pl-5 text-sm text-[#555] marker:text-[#2a7f4f]">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}

export default function VacancyPage() {
  return (
    <>
      <PageHeader title="Careers & Vacancies" text="Join a team that is shaping the future of education in Ibadan" />

      <section className="bg-white py-24">
        <div className={WRAP}>
          <SectionHeader
            label="Why Join Us"
            title="A Team Worth Being Part Of"
            text="We invest in our staff just as much as we invest in our students. Here is what makes Aleeman School a great place to grow your career."
          />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {PERKS.map((p) => (
              <article
                key={p.title}
                className="rounded-[15px] bg-[#f5f5f5] p-8 transition-all hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(0,0,0,0.15)]"
              >
                <div className="mb-4 grid size-14 place-items-center rounded-full bg-[#2a7f4f]/10 text-[#2a7f4f]">
                  <SiteIcon name={p.icon} className="size-7" />
                </div>
                <h3 className="mb-2 text-lg font-bold">{p.title}</h3>
                <p className="text-sm text-[#666]">{p.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="openings" className="scroll-mt-24 bg-[#f5f5f5] py-24">
        <div className={`${WRAP} max-w-4xl`}>
          <SectionHeader
            label="Current Openings"
            title="Available Positions"
            text="Open any role to read the full requirements. All positions are based at our Ibadan campus."
          />
          <div className="space-y-4">
            {VACANCIES.map((v) => (
              <article key={v.title} className="rounded-[15px] bg-white p-6 shadow-[0_4px_12px_rgba(0,0,0,0.12)]">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <span className={`mb-2 inline-block rounded-full px-3 py-0.5 text-xs font-semibold ${BADGE[v.badge]}`}>{v.badge}</span>
                    <h3 className="text-lg font-bold">{v.title}</h3>
                    <p className="mt-1 flex flex-wrap gap-x-4 text-sm text-[#666]">
                      <span className="flex items-center gap-1">
                        <SiteIcon name="mapPin" className="size-4" />
                        Ibadan, Oyo State
                      </span>
                      <span>Full-Time</span>
                      <span>{v.department}</span>
                      <span>Competitive</span>
                    </p>
                  </div>
                  <a
                    href={wa(
                      `Hello Aleeman School! I would like to apply for the position of ${v.title}.\n\nFull Name: \nExperience: \nQualification: `,
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full bg-[#2a7f4f] px-5 py-2 text-sm font-semibold text-white hover:bg-[#006400]"
                  >
                    Apply on WhatsApp<span className="sr-only"> for {v.title}</span> →
                  </a>
                </div>
                <p className="mt-4 text-[#555]">{v.summary}</p>
                <details className="group mt-4">
                  <summary className="inline-flex cursor-pointer list-none items-center gap-1 font-semibold text-[#2a7f4f]">
                    Details <SiteIcon name="chevronDown" className="size-4 transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="mt-4 grid gap-6 md:grid-cols-2">
                    <List title="Requirements" items={v.requirements} />
                    <List title="Responsibilities" items={v.responsibilities} />
                  </div>
                </details>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="applyForm" className="scroll-mt-24 bg-white py-24">
        <div className={`${WRAP} max-w-2xl text-center`}>
          <h2 className="mb-4 text-3xl font-bold text-[#006400] sm:text-4xl">Apply via WhatsApp</h2>
          <p className="mb-6 text-[#666]">
            Interested in joining Aleeman School? Send your CV and application details directly to us on WhatsApp. We review all
            applications and contact shortlisted candidates. Please include:
          </p>
          <ul className="mx-auto mb-8 inline-block text-left">
            {["Full Name", "Position Applying For", "Years of Experience", "Highest Qualification", "Attach Your CV / Résumé"].map((i) => (
              <li key={i} className="flex items-center gap-2 py-1">
                <SiteIcon name="checkCircle" className="size-5 text-[#10b981]" />
                {i}
              </li>
            ))}
          </ul>
          <p className="mb-6 flex items-center justify-center gap-2 text-lg font-semibold">
            <SiteIcon name="phone" className="size-5" />
            {SITE_CONTACT.phone}
          </p>
          <a
            href={wa(
              "Hello Aleeman School! I would like to apply for a vacancy.\n\nFull Name: \nPosition: \nExperience: \nQualification: ",
            )}
            target="_blank"
            rel="noopener noreferrer"
            className={`${BTN} min-w-[280px] border-transparent bg-[#0f7a3f] text-white hover:bg-[#0b5f31]`}
          >
            Apply on WhatsApp
          </a>
          <p className="mt-6 flex items-center justify-center gap-2 text-sm text-[#666]">
            <SiteIcon name="clock" className="size-4" />
            Applications are reviewed within 5 working days (Mon–Fri, 8:00 AM – 4:00 PM)
          </p>
        </div>
      </section>

      <section className="bg-[linear-gradient(135deg,#006400,#2a7f4f)] py-20 text-center text-white">
        <div className={`${WRAP} max-w-3xl`}>
          <h2 className="mb-4 text-3xl font-bold">Don&apos;t See Your Role?</h2>
          <p className="mb-8 opacity-95">
            We welcome speculative applications year-round. If you are a passionate educator, send your CV and we will contact you when a
            suitable vacancy arises.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <a
              href={wa("Hello Aleeman School! I'd like to submit my CV for future vacancies.")}
              target="_blank"
              rel="noopener noreferrer"
              className={`${BTN} border-white text-white hover:bg-white hover:text-[#2a7f4f]`}
            >
              Send CV on WhatsApp
            </a>
            <a href={`mailto:${SITE_CONTACT.email}`} className={`${BTN} border-white text-white hover:bg-white hover:text-[#2a7f4f]`}>
              Email Your CV
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
