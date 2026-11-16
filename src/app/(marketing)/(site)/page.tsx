import type { Metadata } from "next";
import Link from "next/link";
import { SiteImage } from "@/components/site/SiteImage";
import { SiteIcon, type SiteIconName } from "@/components/site/icons";
import { BTN, SectionHeader, SectionLabel, WRAP } from "@/components/site/parts";
import { leaveUnlessVisitor } from "@/lib/landing/start";

// The school's own home page (task 0080), the old static home page as React and Tailwind. A signed-in person goes to the dashboard first; anyone else sees it. Dynamic (it reads the session cookie).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Aleeman School of Science & Arabic Study" },
  description: "Aleeman School of Science & Arabic Study: quality education combining modern science with Islamic studies.",
  openGraph: {
    title: "Aleeman School",
    description: "Aleeman School: school of science and Arabic studies.",
    url: "https://aleemanschool.com/",
    type: "website",
    images: ["/school-site/aleeman-logo.png"],
  },
};

const WELCOME_POINTS = [
  "WAEC/NECO Certified Programs",
  "Qualified & Experienced Teachers",
  "Modern Learning Facilities",
  "Islamic Character Development",
];

const PILLARS: { icon: SiteIconName; title: string; text: string; points: string[] }[] = [
  {
    icon: "microscope",
    title: "Academic Excellence",
    text: "Rigorous science & Arabic curriculum delivered by experienced, caring teachers in well-equipped classrooms and labs.",
    points: ["WAEC/NECO Certified", "Small class sizes"],
  },
  {
    icon: "mosque",
    title: "Islamic Character",
    text: "Daily Qur'an memorisation, Hadith studies, and a school culture rooted in respect, honesty, and compassion.",
    points: ["Qualified Islamic scholars", "Morning Adhkar & Salah"],
  },
  {
    icon: "users",
    title: "Discipline & Values",
    text: "We instil self-discipline, punctuality, and strong moral values — producing well-rounded, responsible young adults.",
    points: ["Structured daily routine", "Leadership opportunities"],
  },
  {
    icon: "sprout",
    title: "Holistic Development",
    text: "Beyond academics — sports, debates, community service, and creative arts help every child discover their potential.",
    points: ["Extracurricular clubs", "Annual inter-house sports"],
  },
];

const PROGRAMS: { icon: SiteIconName; title: string; text: string; points: string[]; href: string; featured?: boolean }[] = [
  {
    icon: "flask",
    title: "Science Program",
    text: "Comprehensive science education covering Physics, Chemistry, Biology, Mathematics, and Computer Science with modern laboratory facilities.",
    points: ["WAEC/NECO Preparation", "Practical Laboratory Work", "STEM Focus"],
    href: "/our-academics#science",
  },
  {
    icon: "atom",
    title: "Combined Program",
    text: "The perfect blend of scientific education and Islamic studies, preparing students for success in both worlds.",
    points: ["Science + Arabic Integration", "Character Development", "Balanced Curriculum"],
    href: "/our-academics#combined",
    featured: true,
  },
  {
    icon: "mosque",
    title: "Arabic & Islamic Studies",
    text: "In-depth study of Qur'an, Hadith, Arabic language, and Islamic jurisprudence with experienced Islamic scholars.",
    points: ["Qur'an Memorization", "Arabic Fluency", "Islamic Knowledge"],
    href: "/our-academics#arabic",
  },
];

const QUICK: { icon: SiteIconName; title: string; text: string; href: string }[] = [
  { icon: "bookOpen", title: "Curriculum", text: "Explore our academic programs", href: "/our-academics#curriculum" },
  { icon: "user", title: "Principal's Message", text: "From our school leader", href: "/about#principal" },
  { icon: "fileText", title: "Admission Requirements", text: "Join our school community", href: "/admissions#requirements" },
  { icon: "calendar", title: "Academic Calendar", text: "Important dates & events", href: "/our-academics#calendar" },
];

const TESTIMONIALS = [
  {
    quote:
      "Aleeman School has been instrumental in shaping my child's academic and spiritual growth. The balanced curriculum is exactly what we were looking for.",
    who: "Hajiya Fatima Ahmed",
    role: "Parent, SS2 Student",
  },
  {
    quote:
      "The teachers are dedicated and the Islamic environment helps instill good values in students. I'm proud to be part of Aleeman School.",
    who: "Musa Ibrahim",
    role: "Student, SS3",
  },
  {
    quote: "Excellent combination of modern education and Islamic teachings. The school has exceeded our expectations in every way.",
    who: "Alhaji Yusuf Mohammed",
    role: "Parent, JSS3 Student",
  },
];

export default async function SchoolHome() {
  await leaveUnlessVisitor();
  return (
    <>
      <section className="relative flex min-h-[80vh] items-center justify-center overflow-hidden bg-[linear-gradient(135deg,rgba(46,139,87,0.95),rgba(0,100,0,0.95))] px-8 py-32 text-center text-white">
        <div className="relative z-10 max-w-3xl">
          <h1 className="mb-6 text-4xl leading-tight font-bold text-shadow-md sm:text-5xl lg:text-6xl motion-safe:animate-[fade-up_1s_ease-out]">
            AL-EEMAN SCHOOL OF SCIENCE &amp; ARABIC STUDIES
          </h1>
          <p className="mb-10 text-2xl font-light italic opacity-95 sm:text-3xl">&ldquo;Second To None&rdquo;</p>
          <div className="flex flex-wrap justify-center gap-6">
            <Link
              href="/admissions"
              prefetch={false}
              className={`${BTN} border-transparent bg-white text-[#2a7f4f] shadow-[0_4px_12px_rgba(0,0,0,0.12)] hover:border-white hover:bg-[#2a7f4f] hover:text-white`}
            >
              Apply Now
            </Link>
            <Link href="/about" prefetch={false} className={`${BTN} border-white text-white hover:bg-white hover:text-[#2a7f4f]`}>
              Learn More
            </Link>
          </div>
        </div>
        <SiteIcon
          name="chevronDown"
          className="absolute bottom-7 left-1/2 size-8 -translate-x-1/2 text-white/70 motion-safe:animate-bounce"
        />
      </section>

      <section className="bg-white py-24">
        <div className={`${WRAP} grid items-center gap-16 md:grid-cols-2`}>
          <SiteImage
            src="/school-site/aleeman-logo.png"
            alt="Aleeman School logo"
            width={606}
            height={412}
            className="h-auto w-full rounded-[15px] shadow-[0_8px_24px_rgba(0,0,0,0.15)]"
          />
          <div>
            <SectionLabel>Welcome to Aleeman School</SectionLabel>
            <h2 className="mb-6 text-3xl font-bold text-[#006400] sm:text-4xl">Nurturing Minds, Building Character</h2>
            <p className="mb-6 text-[#666]">
              At Aleeman School of Science &amp; Arabic Study, we provide a unique educational experience that seamlessly blends modern
              scientific education with traditional Arabic and Islamic studies. Our comprehensive curriculum prepares students for both
              academic excellence and moral leadership.
            </p>
            <ul className="mb-8 grid gap-3 sm:grid-cols-2">
              {WELCOME_POINTS.map((p) => (
                <li key={p} className="flex items-center gap-3">
                  <SiteIcon name="checkCircle" className="size-5 shrink-0 text-[#2a7f4f]" />
                  {p}
                </li>
              ))}
            </ul>
            <Link
              href="/about"
              prefetch={false}
              className={`${BTN} border-transparent bg-[#2a7f4f] text-white hover:bg-[#006400] hover:shadow-[0_8px_24px_rgba(0,0,0,0.15)]`}
            >
              Discover Our Story
            </Link>
          </div>
        </div>
      </section>

      <section className="relative bg-[#f8faf9] py-20 before:absolute before:inset-x-0 before:top-0 before:h-1 before:bg-[linear-gradient(90deg,#1a5c3e,#2a7f4f,#1a5c3e)]">
        <div className={WRAP}>
          <SectionHeader
            label="Why Aleeman School"
            title="Building Future Leaders With Knowledge & Faith"
            text="We offer a balanced education that prepares students for success in both worlds"
          />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {PILLARS.map((p) => (
              <article
                key={p.title}
                className="group rounded-2xl border border-black/5 bg-white px-6 py-8 text-center shadow-[0_4px_20px_rgba(0,0,0,0.05)] transition-all hover:-translate-y-2 hover:shadow-[0_16px_40px_rgba(0,0,0,0.1)]"
              >
                <div className="mx-auto mb-6 grid size-[72px] place-items-center rounded-full bg-[linear-gradient(135deg,rgba(46,139,87,0.08),rgba(26,92,62,0.12))] text-[#2a7f4f] transition-transform group-hover:scale-110">
                  <SiteIcon name={p.icon} className="size-8" />
                </div>
                <h3 className="mb-3 text-lg font-bold text-[#1a3c2a]">{p.title}</h3>
                <p className="mb-5 text-sm leading-relaxed text-[#555]">{p.text}</p>
                <ul className="inline-block text-left text-sm text-[#444]">
                  {p.points.map((pt) => (
                    <li key={pt} className="flex items-center gap-2 py-1">
                      <SiteIcon name="check" className="size-3 shrink-0 text-[#2a7f4f]" />
                      {pt}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#f5f5f5] py-24">
        <div className={WRAP}>
          <SectionHeader
            label="Our Programs"
            title="Dual Excellence in Education"
            text="Choose from our comprehensive programs designed to shape well-rounded individuals"
          />
          <div className="grid gap-10 lg:grid-cols-3">
            {PROGRAMS.map((p) => (
              <article
                key={p.title}
                className={`group relative overflow-hidden rounded-[15px] bg-white p-10 shadow-[0_4px_12px_rgba(0,0,0,0.12)] transition-all before:absolute before:inset-x-0 before:top-0 before:h-1 before:origin-left before:scale-x-0 before:bg-[linear-gradient(to_right,#2a7f4f,#3cb371)] before:transition-transform hover:-translate-y-2.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.15)] hover:before:scale-x-100 ${p.featured ? "ring-2 ring-[#2a7f4f]" : ""}`}
              >
                {p.featured && (
                  <span className="absolute top-4 right-4 rounded-full bg-[#2a7f4f] px-3 py-1 text-xs font-semibold text-white">
                    Most Popular
                  </span>
                )}
                <div className="mb-6 grid size-16 place-items-center rounded-full bg-[#2a7f4f]/10 text-[#2a7f4f]">
                  <SiteIcon name={p.icon} className="size-8" />
                </div>
                <h3 className="mb-3 text-xl font-bold text-[#006400]">{p.title}</h3>
                <p className="mb-5 text-[#666]">{p.text}</p>
                <ul className="mb-6 space-y-2 text-sm">
                  {p.points.map((pt) => (
                    <li key={pt} className="flex items-center gap-2">
                      <SiteIcon name="star" className="size-4 shrink-0 text-[#2a7f4f]" />
                      {pt}
                    </li>
                  ))}
                </ul>
                <Link
                  href={p.href}
                  prefetch={false}
                  className="inline-flex items-center gap-2 font-semibold text-[#2a7f4f] hover:gap-3 hover:text-[#006400]"
                >
                  Learn More <SiteIcon name="arrowRight" className="size-4" />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white py-20">
        <div className={WRAP}>
          <h2 className="mb-12 text-center text-3xl font-bold text-[#006400] sm:text-4xl">Quick Access</h2>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {QUICK.map((q) => (
              <Link
                key={q.title}
                href={q.href}
                prefetch={false}
                className="group rounded-[15px] border-2 border-transparent bg-[#f5f5f5] px-8 py-10 text-center transition-all hover:-translate-y-1 hover:border-[#2a7f4f] hover:shadow-[0_8px_24px_rgba(0,0,0,0.15)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2a7f4f]"
              >
                <div className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-[#2a7f4f]/10 text-[#2a7f4f] transition-colors group-hover:bg-[#2a7f4f] group-hover:text-white">
                  <SiteIcon name={q.icon} className="size-7" />
                </div>
                <h3 className="mb-1 text-lg font-bold">{q.title}</h3>
                <p className="text-sm text-[#666]">{q.text}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#f5f5f5] py-24">
        <div className={WRAP}>
          <SectionHeader label="Testimonials" title="What Parents & Students Say" />
          <div className="grid gap-8 md:grid-cols-3">
            {TESTIMONIALS.map((t) => (
              <figure
                key={t.who}
                className="rounded-[15px] bg-white p-8 shadow-[0_4px_12px_rgba(0,0,0,0.12)] transition-all hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(0,0,0,0.15)]"
              >
                <SiteIcon name="quote" className="mb-4 size-8 text-[#2a7f4f]/50" />
                <blockquote className="mb-6 text-[#555] italic">&ldquo;{t.quote}&rdquo;</blockquote>
                <figcaption>
                  <span className="block font-bold text-[#006400]">{t.who}</span>
                  <span className="text-sm text-[#666]">{t.role}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[linear-gradient(135deg,#006400,#2a7f4f)] py-24 text-center text-white">
        <div className={WRAP}>
          <h2 className="mb-6 text-3xl font-bold sm:text-4xl">Ready to Join Aleeman School?</h2>
          <p className="mx-auto mb-10 max-w-2xl text-lg opacity-95">
            Applications are now open for the 2025/2026 academic session. Secure your child&apos;s future with quality education rooted in
            faith and excellence.
          </p>
          <div className="flex flex-wrap justify-center gap-6">
            <Link href="/admissions" prefetch={false} className={`${BTN} border-transparent bg-white text-[#2a7f4f] hover:bg-[#f5f5f5]`}>
              Apply for Admission
            </Link>
            <Link href="/contact" prefetch={false} className={`${BTN} border-white text-white hover:bg-white hover:text-[#2a7f4f]`}>
              Contact Us
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
