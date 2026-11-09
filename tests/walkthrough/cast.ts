// The fictional people of the walkthrough and the throwaway password they share. Nothing here is real: the names, the addresses (.test is reserved and never delivers) and the password are
// made up for the recording, and the run's database is thrown away.

export const PASSWORD = "Heron-Lantern-Quartz-2026";

export const cast = {
  superadmin: { name: "Amina Yusuf", email: "amina.yusuf@walkthrough.test" },
};

/// The setup token of this run: made by the runner (scripts/walkthrough-run/run.mjs), handed over in the environment, never printed. The journey types it, as a person would.
export const setupToken = (): string => process.env.WALKTHROUGH_SETUP_TOKEN ?? "";
