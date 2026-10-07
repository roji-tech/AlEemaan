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
  /// This product's own word for what the artifact draws as "Branches".
  place: { singular: "branch", plural: "branches", Singular: "Branch", Plural: "Branches" },
} as const;
