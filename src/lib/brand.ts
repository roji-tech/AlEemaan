// AlEemaan's brand strings — one of only TWO per-repo brand files (the other is
// app/brand.css, the colours). The shared UI reads everything brand-specific from
// here, so the components stay code-identical with Octalve Edu's.
//
// Copy is the design artifact's ("Octalve Edu & AlEemaan — UI Design").

export const brand = {
  name: "AlEemaan",
  /// Shown under the logo on the compact (phone) sign-in header.
  tagline: "Secondary & Primary • English & Arabic",
  description: "AlEemaan school management.",
  login: {
    headline: "One school, four branches, one login.",
    blurb: "Secondary & Primary, English & Arabic — every branch's records in one place.",
    points: ["Secondary & Primary, English & Arabic", "Branch-level academic terms", "One admin account, every branch"],
  },
  /// The words of the landing page a signed-out visitor sees at `/` (tasks 0048 and 0049). This product is one school's own, so the page is about the school and says only what the repository can vouch
  /// for (docs/tasks/0049-landing-about-the-school.md, section 3a lists each claim and where it comes from). There is no `howRun`: how it is installed is not the visitor's business.
  landing: {
    title: "AlEemaan School, Ibadan",
    description: "AlEemaan School in Ibadan, Nigeria, has four branches: secondary and primary, in English and in Arabic.",
    eyebrow: "Ibadan, Nigeria",
    headline: "Secondary and primary education, in English and in Arabic.",
    lead: "AlEemaan School has four branches. Parents and pupils sign in here to follow results, fees and attendance, and staff sign in to do their work.",
    coversHeading: "Our branches",
    covers: [
      { title: "Secondary (English)", text: "The secondary branch, in English." },
      { title: "Primary (English)", text: "The primary branch, in English." },
      { title: "Secondary (Arabic)", text: "The secondary branch, in Arabic." },
      { title: "Primary (Arabic)", text: "The primary branch, in Arabic." },
    ],
    peopleHeading: "For families and staff",
    people: [
      {
        who: "Parents and guardians",
        text: "Read your children's results, see their fees and payments, and follow their attendance in the portal.",
      },
      { who: "Pupils", text: "Read published results and learning materials in the portal." },
      { who: "Teachers", text: "Take the roll and enter marks for your own classes." },
      { who: "Branch administrators and the school's head", text: "Run a branch, or see every branch from one account." },
    ],
    closingHeading: "Part of the AlEemaan community?",
    closingText: "Staff sign in to open their dashboard. Parents and pupils use the portal.",
    /// The public pages worth a link besides sign-in (a path on this site): the first is the hero's quiet button, and every one is in the footer. There is no sign-up page, so there is no sign-up link.
    links: [{ label: "Parent and pupil portal", href: "/portal" }],
  },
  /// This product's own word for what the artifact draws as "Branches".
  place: { singular: "branch", plural: "branches", Singular: "Branch", Plural: "Branches" },
} as const;
