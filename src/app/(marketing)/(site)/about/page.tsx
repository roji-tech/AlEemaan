import type { Metadata } from "next";
import { SiteImage } from "@/components/site/SiteImage";
import { SiteIcon, type SiteIconName } from "@/components/site/icons";
import { PageHeader, SectionHeader, SectionLabel, WRAP } from "@/components/site/parts";

// About the school (task 0080): the old static page as React and Tailwind. The words are the old page's, as they were (some, such as "over different students", were placeholders there and are for the school to review).
export const metadata: Metadata = {
  title: { absolute: "About Us | Aleeman School" },
  description: "History, mission, vision and leadership of Aleeman School of Science & Arabic Study, Ibadan.",
};

const TIMELINE = [
  {
    year: "2010",
    title: "Foundation Year",
    lines: ["Established with just primary students and secondary classes named Aleeman Nursery and  Primary and School"],
    place: ["Situated at:", "Yokele Pekun, Saw Mail, Old ife Road ibadan, Oyo state"],
  },
  {
    year: "2013",
    title: "Infrastructure Development",
    lines: ["Secondary School christened Aleeman School of Science and Arabic Studies"],
    place: ["Formmerly located  at:", "Bodija, Ibadan, Oyo state"],
  },
  {
    year: "2017",
    title: "Expansion and Growth",
    lines: [
      "Both primary and secondary School was brought together under one roof at Kamjat Bustop, Opeyemi Street, New Ife Road, Ibadan, Oyo State",
    ],
  },
];

const MV: { icon: SiteIconName; title: string; text: string; points: string[] }[] = [
  {
    icon: "target",
    title: "Our Mission",
    text: "To provide quality education that combines modern scientific knowledge with Arabic and Islamic studies, fostering academic excellence and moral character development in our students.",
    points: [
      "Deliver world-class education",
      "Nurture Islamic values and character",
      "Prepare students for global success",
      "Foster critical thinking and innovation",
    ],
  },
  {
    icon: "eye",
    title: "Our Vision",
    text: "To be the leading institution producing morally upright, academically excellent graduates who contribute positively to society while maintaining strong Islamic principles.",
    points: [
      "Excellence in academics and character",
      "Leaders with Islamic values",
      "Positive societal impact",
      "Lifelong learners and achievers",
    ],
  },
];

const VALUES: { icon: SiteIconName; title: string; text: string }[] = [
  { icon: "bookOpen", title: "Knowledge", text: "Pursuit of excellence in both Islamic and modern education" },
  { icon: "heart", title: "Faith", text: "Strong foundation in Islamic principles and practices" },
  { icon: "shield", title: "Integrity", text: "Honesty, transparency, and ethical conduct in all affairs" },
  { icon: "award", title: "Excellence", text: "Striving for the highest standards in everything we do" },
  { icon: "users", title: "Respect", text: "Valuing diversity, dignity, and mutual understanding" },
  { icon: "lightbulb", title: "Innovation", text: "Embracing creative solutions and modern teaching methods" },
];

const MESSAGE = [
  "It is with great pleasure and pride that I welcome you to Aleeman School of Science and Arabic Study. As the Principal of this esteemed institution, I am honored to lead a community of dedicated educators, enthusiastic students, and supportive parents who share our vision of educational excellence.",
  "At Aleeman School, we believe that true education extends beyond textbooks and examinations. We are committed to nurturing well-rounded individuals who excel academically while embodying the noble values of Islam. Our unique curriculum seamlessly integrates modern scientific education with traditional Arabic and Islamic studies, preparing our students to become leaders in both worlds.",
  "We take pride in our accomplished teaching staff, modern facilities, and most importantly, in the achievements of our students who consistently demonstrate excellence in both academic and moral character. Our 98% success rate in WAEC and NECO examinations is a testament to the quality of education we provide.",
  "I invite you to join the Aleeman School family, where your child will not only receive quality education but will also develop the character, values, and skills necessary to thrive in an ever-changing world while remaining firmly rooted in Islamic principles.",
];

const WHY = [
  {
    title: "Dual Curriculum Excellence",
    text: "Unique integration of WAEC/NECO-approved science curriculum with comprehensive Arabic and Islamic studies",
  },
  {
    title: "Qualified Educators",
    text: "Experienced teachers with both academic credentials and Islamic knowledge, dedicated to student success",
  },
  {
    title: "Modern Facilities",
    text: "Well-equipped science laboratories, library, computer labs, and prayer facilities for holistic learning",
  },
  { title: "Character Development", text: "Focus on Islamic values, ethics, and character building alongside academic achievement" },
  { title: "Proven Results", text: "Consistent 98% success rate in external examinations and numerous scholarship recipients" },
  { title: "Safe Environment", text: "Secure campus with Islamic atmosphere conducive to learning and spiritual growth" },
];

// The old page showed pictures of a library, a laboratory and an ICT centre that were never in its repository (its links to them were broken); only the prayer hall has a picture, so the others are drawn as tiles.
const FACILITIES: { icon: SiteIconName; title: string; image?: string }[] = [
  { icon: "book", title: "Modern Library" },
  { icon: "flask", title: "Science Laboratories" },
  { icon: "monitor", title: "ICT Center" },
  { icon: "mosque", title: "Prayer Facilities", image: "/school-site/aleeman-mosque.png" },
];

export default function AboutPage() {
  return (
    <>
      <PageHeader title="About Aleeman School" text="History, Mission, Vision & Leadership" />

      <section className="bg-white py-24">
        <div className={`${WRAP} grid items-center gap-16 md:grid-cols-2`}>
          <div className="relative">
            <SiteImage
              src="/school-site/aleeman-building.png"
              alt="Aleeman School Building"
              width={421}
              height={537}
              className="h-auto w-full rounded-[15px] shadow-[0_8px_24px_rgba(0,0,0,0.15)]"
            />
            <p className="absolute right-4 bottom-4 flex items-center gap-2 rounded-xl bg-white px-4 py-3 font-semibold text-[#006400] shadow-[0_8px_24px_rgba(0,0,0,0.15)]">
              <SiteIcon name="award" className="size-5 text-[#2a7f4f]" />
              16+ Years of Excellence
            </p>
          </div>
          <div>
            <SectionLabel>Our Story</SectionLabel>
            <h2 className="mb-6 text-3xl font-bold text-[#006400] sm:text-4xl">Building Educational Excellence Since 2010</h2>
            <p className="mb-4 text-[#666]">
              Founded with a vision to provide quality education that harmoniously blends modern scientific knowledge with traditional
              Arabic and Islamic studies, Aleeman School has grown to become a leading institution in Ibadan.
            </p>
            <p className="mb-8 text-[#666]">
              Our journey began with a simple yet powerful idea: to create an educational environment where students can excel academically
              while developing strong moral and spiritual foundations. Today, we proudly serve over different students, guided by different
              qualified educators.
            </p>
            <ol className="space-y-5">
              {TIMELINE.map((t) => (
                <li key={t.year} className="flex gap-5 rounded-xl border-l-4 border-[#2a7f4f] bg-[#f5f5f5] p-5">
                  <span className="text-2xl font-bold text-[#2a7f4f]">{t.year}</span>
                  <div>
                    <h3 className="mb-1 font-bold text-[#006400]">{t.title}</h3>
                    {t.lines.map((l) => (
                      <p key={l} className="text-sm text-[#555]">
                        {l}
                      </p>
                    ))}
                    {t.place && (
                      <p className="mt-1 text-sm text-[#555]">
                        <strong>{t.place[0]}</strong> {t.place[1]}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="bg-[#f5f5f5] py-24">
        <div className={`${WRAP} grid gap-8 md:grid-cols-2`}>
          {MV.map((m) => (
            <article key={m.title} className="rounded-[15px] bg-white p-10 shadow-[0_4px_12px_rgba(0,0,0,0.12)]">
              <div className="mb-5 grid size-16 place-items-center rounded-full bg-[#2a7f4f]/10 text-[#2a7f4f]">
                <SiteIcon name={m.icon} className="size-8" />
              </div>
              <h2 className="mb-3 text-2xl font-bold text-[#006400]">{m.title}</h2>
              <p className="mb-5 text-[#666]">{m.text}</p>
              <ul className="space-y-2">
                {m.points.map((p) => (
                  <li key={p} className="flex items-center gap-3">
                    <SiteIcon name="check" className="size-4 shrink-0 text-[#2a7f4f]" />
                    {p}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-white py-24">
        <div className={WRAP}>
          <SectionHeader label="What We Stand For" title="Our Core Values" />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {VALUES.map((v) => (
              <article
                key={v.title}
                className="rounded-[15px] bg-[#f5f5f5] p-8 text-center transition-all hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(0,0,0,0.15)]"
              >
                <div className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-[#2a7f4f]/10 text-[#2a7f4f]">
                  <SiteIcon name={v.icon} className="size-7" />
                </div>
                <h3 className="mb-2 text-lg font-bold">{v.title}</h3>
                <p className="text-sm text-[#666]">{v.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="principal" className="scroll-mt-24 bg-[#f8faf9] py-24">
        <div className={WRAP}>
          <SectionHeader label="Leadership" title="Principal's Message" />
          <div className="grid items-start gap-12 md:grid-cols-[1fr_2fr]">
            <SiteImage
              src="/school-site/aleeman-building2.png"
              alt="School Principal"
              width={423}
              height={608}
              className="h-auto w-full rounded-[15px] shadow-[0_8px_24px_rgba(0,0,0,0.15)]"
            />
            <div className="space-y-4 text-[#555]">
              <SiteIcon name="quote" className="size-10 text-[#2a7f4f]/40" />
              <p className="text-lg font-semibold text-[#006400]">Assalamu Alaikum Warahmatullahi Wabarakatuh,</p>
              {MESSAGE.map((m) => (
                <p key={m.slice(0, 24)}>{m}</p>
              ))}
              <p className="font-semibold text-[#006400] italic">May Allah guide us all in our pursuit of beneficial knowledge.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white py-24">
        <div className={WRAP}>
          <SectionHeader label="Why Aleeman School" title="What Makes Us Different" />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {WHY.map((w, i) => (
              <article key={w.title} className="rounded-[15px] border border-black/5 bg-[#f5f5f5] p-8">
                <span className="mb-3 block text-4xl font-bold text-[#2a7f4f]">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="mb-2 text-lg font-bold text-[#1a3c2a]">{w.title}</h3>
                <p className="text-sm text-[#555]">{w.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#f5f5f5] py-24">
        <div className={WRAP}>
          <SectionHeader label="Our Campus" title="World-Class Facilities" />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {FACILITIES.map((f) => (
              <article
                key={f.title}
                className="relative grid aspect-[4/3] place-items-center overflow-hidden rounded-[15px] bg-[linear-gradient(135deg,#006400,#2a7f4f)] text-white"
              >
                {f.image && (
                  <SiteImage
                    src={f.image}
                    alt="Prayer Hall"
                    width={422}
                    height={302}
                    className="absolute inset-0 size-full object-cover opacity-60"
                  />
                )}
                <div className="relative z-10 text-center">
                  <SiteIcon name={f.icon} className="mx-auto mb-2 size-8" />
                  <h3 className="font-bold">{f.title}</h3>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
