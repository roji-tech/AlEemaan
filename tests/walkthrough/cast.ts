// The fictional people of the walkthrough and the throwaway password they share. Nothing here is real: the names, the addresses (.test is reserved and never delivers) and the password are
// made up for the recording, and the run's database is thrown away.

export const PASSWORD = "Heron-Lantern-Quartz-2026";

export const cast = {
  superadmin: { name: "Amina Yusuf", email: "amina.yusuf@walkthrough.test" },
  // The people the superadministrator invites in C03. Each accepts through the link in the dev inbox and chooses the name typed there.
  branchAdmin: { name: "Bola Adeyemi", email: "bola.adeyemi@walkthrough.test" },
  teacher: { name: "Chidi Okafor", email: "chidi.okafor@walkthrough.test" },
  staff: { name: "Dayo Lawal", email: "dayo.lawal@walkthrough.test" },
  // An address typed wrongly on purpose: its invitation is revoked.
  mistyped: { email: "bola.adeyem@walkthrough.test" },
};

/// The setup token of this run: made by the runner (scripts/walkthrough-run/run.mjs), handed over in the environment, never printed. The journey types it, as a person would.
export const setupToken = (): string => process.env.WALKTHROUGH_SETUP_TOKEN ?? "";

/// The dev inbox's unlock token of this run: made by the runner, handed over in the environment, never printed. The journey types it into the inbox's own field, as a person would.
export const devToolsToken = (): string => process.env.WALKTHROUGH_DEV_TOOLS_TOKEN ?? "";

/// The fictional school of the walkthrough: its branches, profile and first session. Branch names follow the app's convention (a name with "Arabic" in it gets two terms a year, any other
/// three). The dates are typed the way a person types into a date field, month then day then year.
export const school = {
  // The first-run wizard seeds four branches; the walkthrough uses two of them and adds one of its own.
  branches: {
    englishPrimary: "Primary (English)",
    arabicPrimary: "Primary (Arabic)",
    added: "Nursery (English)",
    seededCount: 4,
  },
  profile: {
    name: "Al-Eemaan Demonstration School",
    principal: "Maryam Bello",
    phone: "0803 000 0001",
    motto: "Faith and knowledge",
    address: "12 Example Road, Ilorin",
    email: "office@walkthrough.test",
    website: "https://school.walkthrough.test",
  },
  session: {
    label: "2026/2027",
    startTyped: "09072026",
    endTyped: "07162027",
    shownDates: "2026-09-07 → 2027-07-16",
  },
};
