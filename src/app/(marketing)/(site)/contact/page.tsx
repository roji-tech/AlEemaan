import type { Metadata } from "next";
import Link from "next/link";
import { SiteIcon, type SiteIconName } from "@/components/site/icons";
import { BTN, PageHeader, SectionHeader, SectionLabel, WRAP } from "@/components/site/parts";
import { SCHOOL_MAP_ORIGIN } from "@/lib/school-site/paths";
import { SITE_CONTACT } from "@/lib/school-site/nav";

// Contact (task 0080): the old static page as React and Tailwind. Left out, as they were out or dead on the old page: the commented-out message, tour and departments forms (nothing was ever sent anywhere), and the
// social links that all pointed at "#". The emergency number dialled +234 801 234 5678 while showing the school's own number; the link now dials the number it shows.
export const metadata: Metadata = {
  title: { absolute: "Contact Us | Aleeman School" },
  description: "How to reach Aleeman School of Science & Arabic Study in Ibadan: telephone, e-mail, address, office hours and a map.",
};

const MAP_QUERY = "Green Mosque Opeyemi Street Kamjat Bus Stop Gbagi Market Ibadan Oyo State Nigeria";
const MAP_EMBED = `${SCHOOL_MAP_ORIGIN}/maps?q=${encodeURIComponent(MAP_QUERY)}&z=17&output=embed`;
const MAP_LINK = `https://www.google.com/maps?ll=7.470655,3.92233&z=17&t=m&hl=en-US&gl=US&q=${encodeURIComponent(MAP_QUERY)}`;

const CARD = "rounded-[15px] bg-white p-8 text-center shadow-[0_4px_12px_rgba(0,0,0,0.12)]";

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: "What are your admission requirements?",
    a: (
      <>
        Requirements vary by grade level. Generally, you&apos;ll need previous school certificates, birth certificate, passport photographs,
        and medical certificate. Visit our{" "}
        <Link prefetch={false} href="/admissions" className="font-semibold text-[#2a7f4f] underline">
          Admissions page
        </Link>{" "}
        for detailed requirements.
      </>
    ),
  },
  {
    q: "When does the academic year start?",
    a: (
      <>
        The academic year typically begins in September. Our academic calendar is divided into three terms. Check our{" "}
        <Link prefetch={false} href="/our-academics#calendar" className="font-semibold text-[#2a7f4f] underline">
          Academic Calendar
        </Link>{" "}
        for specific dates.
      </>
    ),
  },
  {
    q: "Do you offer scholarships?",
    a: "Yes! We offer scholarships based on academic excellence, Qur'an memorization, and financial need. Scholarship applications can be submitted with your admission application.",
  },
  {
    q: "What is your student-teacher ratio?",
    a: "We maintain a low student-teacher ratio of approximately 15:1 to ensure personalized attention and quality education for every student.",
  },
  {
    q: "Do you have boarding facilities?",
    a: "We offer both day and boarding options for students. Our boarding facilities are secure, comfortable, and supervised by qualified staff.",
  },
  {
    q: "How can I pay school fees?",
    a: "We accept payments via bank transfer, online payment, or direct payment at our accounts office. Payment plans are available for parents who need them.",
  },
];

const QUICK: { href: string; label: string }[] = [
  { href: "/admissions", label: "Apply for Admission" },
  { href: "/our-academics", label: "View Academic Programs" },
  { href: "#tour", label: "Schedule Campus Tour" },
  { href: "/admissions#fees", label: "Tuition & Fees" },
  { href: "/about", label: "About Our School" },
];

const MAP_INFO: { icon: SiteIconName; title: string; text: string }[] = [
  { icon: "mapPin", title: "Address", text: "Aleeman School Ibadan, Oyo State, Nigeria" },
  {
    icon: "navigation",
    title: "Getting Here",
    text: "Located along New Ife Road, easily accessible by public transport and private vehicles",
  },
  { icon: "parking", title: "Parking", text: "Free parking available for visitors on campus" },
];

const TOUR: { title: string; text: string }[] = [
  { title: "Guided Tour", text: "Personal tour of all facilities with our admissions team" },
  { title: "Meet the Teachers", text: "Opportunity to meet our qualified teaching staff" },
  { title: "See Our Labs", text: "Visit our modern science laboratories and ICT center" },
  { title: "Q&A Session", text: "Get all your questions answered by our team" },
];

export default function ContactPage() {
  return (
    <>
      <PageHeader title="Contact Us" text="We're here to answer your questions and help you get started" />

      <section className="bg-white py-20">
        <div className={`${WRAP} grid gap-6 sm:grid-cols-2 lg:grid-cols-4`}>
          <article className={CARD}>
            <div className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-[#2a7f4f]/10 text-[#2a7f4f]">
              <SiteIcon name="phone" className="size-7" />
            </div>
            <h2 className="mb-2 text-lg font-bold">Call Us</h2>
            <p>
              <a href={SITE_CONTACT.phoneHref} className="font-medium text-[#2a7f4f] underline-offset-4 hover:underline">
                {SITE_CONTACT.phone}
              </a>
            </p>
            <p className="mt-2 text-sm text-[#666]">Mon-Fri, 8:00 AM - 4:00 PM</p>
          </article>
          <article className={CARD}>
            <div className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-[#2a7f4f]/10 text-[#2a7f4f]">
              <SiteIcon name="mail" className="size-7" />
            </div>
            <h2 className="mb-2 text-lg font-bold">Email Us</h2>
            <p>
              <a href={`mailto:${SITE_CONTACT.email}`} className="font-medium break-all text-[#2a7f4f] underline-offset-4 hover:underline">
                {SITE_CONTACT.email}
              </a>
            </p>
            <p className="mt-2 text-sm text-[#666]">We&apos;ll respond as soon as possible</p>
          </article>
          <article className={CARD}>
            <div className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-[#2a7f4f]/10 text-[#2a7f4f]">
              <SiteIcon name="mapPin" className="size-7" />
            </div>
            <h2 className="mb-2 text-lg font-bold">Visit Us</h2>
            <p>Aleeman School Campus</p>
            <p>Ibadan, Oyo State</p>
            <p className="mt-2 text-sm text-[#666]">Schedule a campus tour</p>
          </article>
          <article className={CARD}>
            <div className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-[#2a7f4f]/10 text-[#2a7f4f]">
              <SiteIcon name="clock" className="size-7" />
            </div>
            <h2 className="mb-2 text-lg font-bold">Office Hours</h2>
            <p>Monday - Friday</p>
            <p>8:00 AM - 4:00 PM</p>
            <p className="mt-2 text-sm text-[#666]">Closed on weekends &amp; holidays</p>
          </article>
        </div>
      </section>

      <section className="bg-[#f5f5f5] py-20">
        <div className={`${WRAP} max-w-3xl`}>
          <h2 className="mb-6 flex items-center gap-3 text-2xl font-bold text-[#006400]">
            <SiteIcon name="navigation" className="size-6" />
            Quick Links
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {QUICK.map((q) => (
              <li key={q.label}>
                <Link
                  href={q.href}
                  prefetch={false}
                  className="flex items-center gap-2 rounded-xl bg-white px-5 py-3 font-medium shadow-[0_2px_8px_rgba(0,0,0,0.08)] transition-colors hover:text-[#2a7f4f]"
                >
                  <SiteIcon name="chevronRight" className="size-4 text-[#2a7f4f]" />
                  {q.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="bg-white py-24">
        <div className={WRAP}>
          <SectionHeader
            label="Location"
            title="Find Us on the Map"
            text="Visit our campus to experience our facilities and meet our staff"
          />
          <div className="overflow-hidden rounded-[15px] shadow-[0_8px_24px_rgba(0,0,0,0.15)]">
            <iframe
              title="Map showing Aleeman School in Ibadan"
              src={MAP_EMBED}
              width="100%"
              height="450"
              className="block border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
            <div className="bg-[#2a7f4f] p-4 text-center">
              <a
                href={MAP_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className={`${BTN} border-white text-white hover:bg-white hover:text-[#2a7f4f]`}
              >
                View on Google Maps
              </a>
            </div>
          </div>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {MAP_INFO.map((m) => (
              <div key={m.title} className="flex gap-4 rounded-[15px] bg-[#f5f5f5] p-6">
                <SiteIcon name={m.icon} className="mt-1 size-6 shrink-0 text-[#2a7f4f]" />
                <div>
                  <h3 className="font-bold">{m.title}</h3>
                  <p className="text-sm text-[#666]">{m.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="tour" className="scroll-mt-24 bg-[#f5f5f5] py-24">
        <div className={`${WRAP} max-w-4xl`}>
          <SectionLabel>Visit Us</SectionLabel>
          <h2 className="mb-4 text-3xl font-bold text-[#006400] sm:text-4xl">Schedule a Campus Tour</h2>
          <p className="mb-8 text-[#666]">
            Experience our facilities firsthand and meet our dedicated staff and teachers. Campus tours are available Monday through Friday.
            Call us to book.
          </p>
          <ul className="grid gap-5 sm:grid-cols-2">
            {TOUR.map((t) => (
              <li key={t.title} className="flex gap-4">
                <SiteIcon name="checkCircle" className="mt-1 size-6 shrink-0 text-[#2a7f4f]" />
                <div>
                  <h3 className="font-bold">{t.title}</h3>
                  <p className="text-sm text-[#666]">{t.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="bg-white py-24">
        <div className={`${WRAP} max-w-3xl`}>
          <SectionHeader label="FAQs" title="Frequently Asked Questions" text="Quick answers to common questions" />
          <div className="space-y-3">
            {FAQ.map((f) => (
              <details key={f.q} name="faq" className="group rounded-xl bg-[#f5f5f5] px-6 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                  <h3>{f.q}</h3>
                  <SiteIcon name="chevronDown" className="size-5 shrink-0 text-[#2a7f4f] transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-3 text-[#555]">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#f5f5f5] py-16">
        <div className={WRAP}>
          <div className="flex flex-col items-center gap-6 rounded-[15px] bg-[#fff4e5] p-8 text-center md:flex-row md:text-left">
            <SiteIcon name="alert" className="size-10 shrink-0 text-[#b45309]" />
            <div className="flex-1">
              <h2 className="text-xl font-bold text-[#7c2d12]">Emergency Contact</h2>
              <p className="text-[#7c2d12]">For urgent matters outside office hours, please call our emergency line</p>
            </div>
            <a
              href={SITE_CONTACT.phoneHref}
              className="inline-flex items-center gap-2 rounded-full bg-[#b45309] px-6 py-3 font-semibold text-white hover:bg-[#7c2d12]"
            >
              <SiteIcon name="phone" className="size-5" />
              {SITE_CONTACT.phone}
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
