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
  /// The words of the landing page a signed-out visitor sees at `/` (task 0048). Only what the product does today: a claim here is a claim a school will test. This product is one school's own, so
  /// there is no `howRun` (how it is installed is not the visitor's business) and the section is not drawn.
  landing: {
    title: "AlEemaan: school management",
    description: "AlEemaan keeps the pupils, attendance, results and fees of a school's branches in one place, with one login.",
    eyebrow: "School management",
    headline: "One school, four branches, one login.",
    lead: "Pupils, attendance, results and fees for every branch in one place, and each person sees only what their role needs.",
    coversHeading: "What it covers",
    covers: [
      {
        icon: "people",
        title: "Pupils and staff",
        text: "The pupils of each branch, with search and a spreadsheet import, and the staff who work there with the roles they hold.",
      },
      {
        icon: "attendance",
        title: "Attendance",
        text: "A daily roll for every class, taken by its teacher, with the permissions to take it managed by the branch's administrator.",
      },
      {
        icon: "results",
        title: "Marks",
        text: "Teachers enter marks, administrators review them, and results are published to pupils and parents.",
      },
      {
        icon: "reportCards",
        title: "Report cards",
        text: "Report cards for every pupil, and a public page that checks a mark against the school's own record.",
      },
      {
        icon: "fees",
        title: "Fees",
        text: "Fee invoices for each branch, with part payments when the school allows them.",
      },
      {
        icon: "yearEnd",
        title: "The end of the year",
        text: "Promote, repeat or graduate a class at the end of the session.",
      },
    ],
    peopleHeading: "Made for the people in a school",
    people: [
      { who: "The school's head", text: "One account sees every branch and sets the branches up." },
      { who: "Branch administrators", text: "Run their own branch: classes, staff, fees and approvals." },
      { who: "Teachers", text: "Take the roll and enter marks for their own classes." },
      { who: "Pupils and parents", text: "Use the portal to read results, fees and learning." },
    ],
    closingHeading: "Already part of AlEemaan?",
    closingText: "Sign in to open your dashboard.",
    /// The public pages worth a link besides sign-in (a path on this site): the first is the hero's quiet button, and every one is in the footer. There is no sign-up page, so there is no sign-up link.
    links: [{ label: "Parent and pupil portal", href: "/portal" }],
  },
  /// This product's own word for what the artifact draws as "Branches".
  place: { singular: "branch", plural: "branches", Singular: "Branch", Plural: "Branches" },
} as const;
