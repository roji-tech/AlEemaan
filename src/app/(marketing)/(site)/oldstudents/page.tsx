import type { Metadata } from "next";
import Link from "next/link";
import { AlumniGrid } from "@/components/site/AlumniGrid";
import { SiteIcon } from "@/components/site/icons";
import { BTN, PageHeader, SectionLabel, WRAP } from "@/components/site/parts";
import { ALUMNI } from "@/lib/school-site/alumni";

// Old students (task 0080), the old static page as React and Tailwind. The ten example alumni the old page drew are not carried over (src/lib/school-site/alumni.ts says why); the page shows "Alumni Records Coming Soon"
// until the school adds real, confirmed people.
export const metadata: Metadata = {
  title: { absolute: "Our Old Students | Aleeman School" },
  description: "Celebrating the achievements of Aleeman School's alumni.",
};

const FACTS = [
  { n: "16+", l: "Years of Excellence" },
  { n: "2010", l: "Founded" },
  { n: "100s", l: "Graduates" },
  { n: "98%", l: "Exam Success Rate" },
];

export default function OldStudentsPage() {
  return (
    <>
      <PageHeader
        title="Our Old Students"
        text={'Celebrating the achievements of Aleeman School\'s outstanding alumni — carrying our motto "Second To None" into the world.'}
      />

      <section className="bg-white py-10">
        <dl className={`${WRAP} grid grid-cols-2 gap-6 text-center md:grid-cols-4`}>
          {FACTS.map((f) => (
            <div key={f.l}>
              <dt className="order-2 text-sm text-[#666]">{f.l}</dt>
              <dd className="text-3xl font-bold text-[#2a7f4f]">{f.n}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="bg-[#f5f5f5] py-24">
        <div className={WRAP}>
          <div className="mb-12 text-center">
            <SectionLabel>Alumni Hall of Excellence</SectionLabel>
            <h2 className="mb-3 text-3xl font-bold text-[#006400] sm:text-4xl">Notable Alumni</h2>
            <p className="text-[#666]">Former students who embody our mission of knowledge, faith, and service to humanity</p>
          </div>
          <AlumniGrid alumni={ALUMNI} />
        </div>
      </section>

      <section className="bg-white py-20 text-center">
        <figure className={`${WRAP} max-w-3xl`}>
          <SiteIcon name="quote" className="mx-auto mb-4 size-10 text-[#2a7f4f]/50" />
          <blockquote className="text-2xl text-[#1a3c2a] italic">&ldquo;Seek knowledge from the cradle to the grave.&rdquo;</blockquote>
          <figcaption className="mt-3 text-[#666]">— Prophet Muhammad ﷺ (Hadith)</figcaption>
        </figure>
      </section>

      <section className="bg-[linear-gradient(135deg,#006400,#2a7f4f)] py-20 text-center text-white">
        <div className={`${WRAP} max-w-3xl`}>
          <h2 className="mb-4 text-3xl font-bold">Are You an Old Student?</h2>
          <p className="mb-8 opacity-95">
            Connect with your alma mater. Share your achievements and inspire the next generation of Aleeman scholars.
          </p>
          <Link href="/contact" prefetch={false} className={`${BTN} border-transparent bg-white text-[#2a7f4f] hover:bg-[#f5f5f5]`}>
            Get in Touch
          </Link>
        </div>
      </section>
    </>
  );
}
