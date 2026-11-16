import type { Metadata } from "next";
import { FeesDialog } from "@/components/site/FeesDialog";
import { SiteIcon, type SiteIconName } from "@/components/site/icons";
import { PageHeader, WRAP } from "@/components/site/parts";
import { WhatsAppForm, type FormField } from "@/components/site/WhatsAppForm";
import { SITE_CONTACT } from "@/lib/school-site/nav";

// Admissions (task 0080), the old static page as React and Tailwind. The old application form said "submitted" and sent nothing; this one opens WhatsApp with the answers written in a message to the school.
export const metadata: Metadata = {
  title: { absolute: "Admissions | Aleeman School" },
  description: "How to apply to Aleeman School of Science & Arabic Study: the steps, the requirements, the fees and the application form.",
};

const STEPS = [
  { title: "Inquiry & Visit", text: "Visit our school or contact admissions office" },
  { title: "Application", text: "Submit completed application form" },
  { title: "Entrance Exam", text: "Take admission test (Mathematics & English)" },
  { title: "Interview", text: "Student & parent interview session" },
  { title: "Acceptance", text: "Receive admission letter & complete registration" },
];

const REQUIREMENTS: { icon: SiteIconName; title: string; items: string[] }[] = [
  {
    icon: "award",
    title: "Junior Secondary (JSS1)",
    items: [
      "Primary School Leaving Certificate",
      "Birth Certificate/Age Declaration",
      "4 Recent Passport Photographs",
      "Medical Certificate",
      "Testimonial from previous school",
    ],
  },
  {
    icon: "bookOpen",
    title: "Senior Secondary (SS1)",
    items: [
      "JSS3/BECE Certificate",
      "Birth Certificate",
      "4 Recent Passport Photographs",
      "Medical Certificate",
      "Junior School Testimonial",
      "Transfer Certificate (if applicable)",
    ],
  },
  {
    icon: "users",
    title: "Transfer Students",
    items: [
      "All basic requirements",
      "Official Transfer Certificate",
      "Last academic report",
      "Character reference",
      "Interview with Head of Department",
    ],
  },
];

const FORM: FormField[] = [
  { name: "studentName", label: "Student's Full Name *", type: "text", required: true },
  { name: "dob", label: "Date of Birth *", type: "date", required: true },
  {
    name: "gender",
    label: "Gender *",
    type: "select",
    required: true,
    options: [
      { value: "male", label: "Male" },
      { value: "female", label: "Female" },
    ],
  },
  {
    name: "class",
    label: "Applying For *",
    type: "select",
    required: true,
    options: ["JSS 1", "JSS 2", "JSS 3", "SS 1", "SS 2", "SS 3"].map((c) => ({ value: c, label: c })),
  },
  { name: "session", label: "Academic Session *", type: "text", required: true, value: "2025/2026" },
  {
    name: "childrenCount",
    label: "Number of Children Applying *",
    type: "select",
    required: true,
    value: "1",
    options: [
      { value: "1", label: "1 Child" },
      { value: "2", label: "2 Children" },
      { value: "3", label: "3 Children" },
      { value: "4", label: "4 Children" },
      { value: "5", label: "5+ Children" },
    ],
  },
  { name: "previousSchool", label: "Previous School Attended", type: "text" },
  { name: "parentName", label: "Parent/Guardian Name *", type: "text", required: true },
  { name: "phone", label: "Phone Number *", type: "tel", required: true },
  { name: "email", label: "Email Address", type: "email" },
  { name: "address", label: "Home Address *", type: "textarea", required: true },
  { name: "message", label: "Additional Information", type: "textarea" },
];

export default function AdmissionsPage() {
  return (
    <>
      <div className="site-print-hide">
        <PageHeader title="Admissions" text="Join Aleeman School of Science & Arabic Study" />

        <section className="bg-white py-24">
          <div className={WRAP}>
            <h2 className="mb-12 text-center text-3xl font-bold text-[#006400] sm:text-4xl">Admission Process</h2>
            <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
              {STEPS.map((s, i) => (
                <li key={s.title} className="rounded-[15px] bg-[#f5f5f5] p-6 text-center">
                  <span className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-[#2a7f4f] text-xl font-bold text-white">
                    {i + 1}
                  </span>
                  <h3 className="mb-1 font-bold">{s.title}</h3>
                  <p className="text-sm text-[#666]">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="requirements" className="scroll-mt-24 bg-[#f5f5f5] py-24">
          <div className={WRAP}>
            <h2 className="mb-12 text-center text-3xl font-bold text-[#006400] sm:text-4xl">Admission Requirements</h2>
            <div className="grid gap-6 md:grid-cols-3">
              {REQUIREMENTS.map((r) => (
                <article key={r.title} className="rounded-[15px] bg-white p-8 shadow-[0_4px_12px_rgba(0,0,0,0.12)]">
                  <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-[#006400]">
                    <SiteIcon name={r.icon} className="size-5 text-[#2a7f4f]" />
                    {r.title}
                  </h3>
                  <ul className="list-disc space-y-1.5 pl-5 text-[#555] marker:text-[#2a7f4f]">
                    {r.items.map((it) => (
                      <li key={it}>{it}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="fees" className="scroll-mt-24 bg-white py-24">
          <div className={`${WRAP} max-w-3xl`}>
            <h2 className="mb-8 text-3xl font-bold text-[#006400] sm:text-4xl">Tuition &amp; Fees</h2>
            <div className="mb-4 rounded-xl bg-[#f5f5f5] p-5">
              <h3 className="font-bold">Junior Secondary (JSS 1-3)</h3>
              <p className="text-lg font-semibold text-[#2a7f4f]">₦150,000 - ₦180,000 per term</p>
            </div>
            <div className="mb-4 rounded-xl bg-[#f5f5f5] p-5">
              <h3 className="font-bold">Senior Secondary (SS 1-3)</h3>
              <p className="text-lg font-semibold text-[#2a7f4f]">₦180,000 - ₦220,000 per term</p>
            </div>
            <p className="mb-6 flex items-start gap-2 text-sm text-[#666]">
              <SiteIcon name="alert" className="mt-0.5 size-4 shrink-0" />
              Fees include: Tuition, textbooks, and basic materials. Boarding fees separate.
            </p>
            <FeesDialog />
          </div>
        </section>

        <section className="bg-[#f5f5f5] py-24">
          <div className={`${WRAP} max-w-2xl`}>
            <h2 className="mb-8 text-center text-3xl font-bold text-[#006400] sm:text-4xl">Admission Form</h2>
            <div className="rounded-[15px] bg-white p-8 shadow-[0_4px_12px_rgba(0,0,0,0.12)]">
              <WhatsAppForm
                phone="2348153005393"
                intro="Admission application, Aleeman School"
                fields={FORM}
                submitLabel="Send application on WhatsApp"
                note={
                  <>
                    Pressing the button opens WhatsApp with your answers written in a message to the school ({SITE_CONTACT.phone}); send it
                    there. Our admissions office will then contact you about the entrance examination and interview.
                  </>
                }
              />
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
