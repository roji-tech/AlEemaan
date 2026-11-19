// The `?tab=` ids of every page that keeps its open tab in the address (task 0100), in plain lists that the pages and the search index (task 0107) both read: a page cannot gain or lose a
// tab without these changing, and a test fails when the index and these disagree. Labels stay with the pages; only the ids are shared.

/// Settings (superadmins).
export const SETTINGS_TAB_IDS = ["profile", "academics", "portal", "approval", "programs", "discipline", "signin"] as const;
/// Academics (administrators): the same ids as `components/academics/sections.ts`, which is the page's own list and is compared with this one by a test.
export const ACADEMICS_TAB_IDS = ["classes", "subjects", "sessions", "grading", "staff", "departments", "promotion"] as const;
/// Approvals: `self` is shown to superadmins only.
export const APPROVALS_TAB_IDS = ["requests", "email", "layout", "verification", "self"] as const;
/// Users.
export const USERS_TAB_IDS = ["people", "invitations", "staff", "guardians"] as const;
