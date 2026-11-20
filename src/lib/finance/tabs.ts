// The `?tab=` ids of the Finance page (task 0106), in a plain module so the page, the tests and the app's search index (task 0107) all read the same list. `fees` and `rules` are the Fee
// Schedules and the Payment Rules tabs; `rules` is shown to people who may manage payment rules only.
export const FINANCE_TAB_IDS = ["overview", "invoices", "fees", "rules", "scholarships"] as const;
