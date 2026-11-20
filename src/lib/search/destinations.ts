import type { Searchable } from "./match";
import { FINANCE_TAB_IDS } from "@/lib/finance/tabs";
import { ACADEMICS_TAB_IDS, APPROVALS_TAB_IDS, SETTINGS_TAB_IDS, USERS_TAB_IDS } from "./tab-ids";

// The map of the app that the top-bar search reads (task 0107): every page, every tab that has its own address (`?tab=`), and the questions people ask ("How do I add a pupil?"), each with
// where it lives, a line about what is there and, when the way is not obvious, the steps. Written by hand on purpose: the words people use and the steps are the whole point. Kept honest by
// tests/unit/search.spec.ts: a tab id here must be a real tab of that page, every real tab must be reachable from here, and every page must be a page of the app.
//
// Every step below names a button or a tab by the words that are on it today. When a label on a screen changes, change it here: the browser test follows the first steps.

export type Destination = Searchable & {
  id: string;
  /// Where choosing it goes: a path, with `?tab=` when it is a tab.
  href: string;
  /// The page it lives on, as the sidebar knows it (`/finance`): the person sees the destination only if that page is in their own navigation.
  page: string;
  /// Narrower than the page: only administrators, or only superadmins (a tab can be narrower than its page, never wider).
  only?: "admin" | "superadmin";
  group: "page" | "setting" | "task";
};

type Tabbed<Id extends string> = readonly {
  id: Id;
  title: string;
  summary: string;
  keywords?: readonly string[];
  steps?: readonly string[];
  only?: "admin" | "superadmin";
}[];

const tabs = <Id extends string>(page: string, pageTitle: string, group: Destination["group"], list: Tabbed<Id>): Destination[] =>
  list.map((t) => ({
    id: `${page}#${t.id}`,
    title: t.title,
    href: `${page}?tab=${t.id}`,
    page,
    trail: [pageTitle, t.title],
    summary: t.summary,
    keywords: t.keywords,
    steps: t.steps,
    only: t.only,
    group,
  }));

const SETTINGS = tabs("/settings", "Settings", "setting", [
  {
    id: "profile",
    title: "School Profile",
    summary: "The school's name, address, contact details and how it signs its documents, for the school or for one branch.",
    keywords: ["school name", "address", "logo", "details", "information", "principal", "motto", "phone", "branch details"],
  },
  {
    id: "academics",
    title: "Academic Sessions & Terms",
    summary: "The school years and terms, for every branch at once.",
    keywords: ["session", "term", "semester", "year"],
  },
  {
    id: "portal",
    title: "Portal access",
    summary: "What pupils and guardians can see in their portal, by branch.",
    keywords: ["student portal", "parent portal", "guardian", "results visible", "fees visible"],
  },
  {
    id: "approval",
    title: "Results approval",
    summary: "Who must approve results before pupils and guardians see them, and in how many steps.",
    keywords: ["approve results", "publish results", "workflow", "hod"],
  },
  {
    id: "programs",
    title: "Programs",
    summary: "Switches for the programs feature, for the school and for each branch.",
    keywords: ["programmes", "enable programs", "turn off programs"],
  },
  {
    id: "discipline",
    title: "Discipline",
    summary: "Who may suspend, expel or reinstate a pupil, and the rules around it.",
    keywords: ["suspend", "expel", "reinstate", "standing"],
  },
  {
    id: "signin",
    title: "Sign-in access",
    summary: "Whether pupils and parents may sign in, branch by branch.",
    keywords: ["login", "log in", "student login", "parent login", "turn on sign in", "lock out"],
    steps: [
      "Open Settings.",
      "Choose the Sign-in access tab.",
      "Tick the branches, then press Turn on student sign-in or Turn on parent sign-in.",
    ],
  },
]).map((d) => ({ ...d, only: "superadmin" as const }));

const ACADEMICS = tabs("/academics", "Academics", "page", [
  {
    id: "classes",
    title: "Classes",
    summary: "The classes and arms of a branch, and the subjects each class takes.",
    keywords: ["class", "arm", "form", "grade", "year group"],
  },
  {
    id: "subjects",
    title: "Subjects",
    summary: "The subjects a branch teaches, and which classes take them.",
    keywords: ["subject", "course", "curriculum"],
  },
  {
    id: "sessions",
    title: "Sessions",
    summary: "The school years of a branch, each with its terms, breaks and the current term.",
    keywords: ["session", "term", "semester", "year", "calendar", "break", "holiday"],
  },
  {
    id: "grading",
    title: "Assessment and grading",
    summary: "How marks are built (tests, exam) and graded.",
    keywords: ["grades", "grading scheme", "marks", "ca", "exam", "assessment scheme", "weights"],
  },
  {
    id: "staff",
    title: "Staff",
    summary: "The teachers and other staff of a branch, and what each is assigned.",
    keywords: ["teacher", "staff", "assign", "employee"],
  },
  {
    id: "departments",
    title: "Departments",
    summary: "Group a branch's staff into departments, name a head of department, and say which subjects belong to each.",
    keywords: ["department", "hod", "head of department", "sciences", "languages", "group staff"],
  },
  {
    id: "promotion",
    title: "Promotion & rollover",
    summary: "Move pupils up to the next class and start the next year.",
    keywords: ["promote", "rollover", "next class", "graduate", "end of year", "repeat"],
  },
]).map((d) => ({ ...d, only: "admin" as const }));

const APPROVALS = tabs("/approvals", "Approvals", "page", [
  {
    id: "requests",
    title: "Requests",
    summary: "Results and changes waiting for an approver's decision.",
    keywords: ["approve", "reject", "deny", "pending", "decision"],
  },
  {
    id: "email",
    title: "Email changes",
    summary: "People who asked to change their sign-in e-mail address.",
    keywords: ["email change", "change email", "e-mail"],
  },
  {
    id: "layout",
    title: "Report cards",
    summary: "How report cards look, and what they say, including the principal, motto, address and phone a branch prints.",
    keywords: ["report card", "layout", "template", "print", "principal", "motto", "branch details"],
  },
  {
    id: "verification",
    title: "Verification page",
    summary: "What a person sees when they check a result's code.",
    keywords: ["verify", "result code", "qr", "check result"],
  },
  {
    id: "self",
    title: "Self-approval",
    summary: "Who may approve their own work.",
    keywords: ["approve own", "self approve"],
    only: "superadmin" as const,
  },
]);

const FINANCE = tabs("/finance", "Finance", "page", [
  {
    id: "overview",
    title: "Overview",
    summary:
      "How much has been invoiced, collected and is still owed, month by month, by class and by how it was paid. With several branches, every branch side by side.",
    keywords: [
      "statistics",
      "stats",
      "money",
      "income",
      "revenue",
      "collected",
      "outstanding",
      "owing",
      "debtors",
      "overdue",
      "collection rate",
      "compare branches",
      "how much",
    ],
  },
  {
    id: "invoices",
    title: "Student Invoices & Payments",
    summary: "Every pupil's invoice: generate them, record a payment, apply a discount.",
    keywords: ["invoice", "invoices", "payment", "receipt", "discount", "bill", "fees owed"],
  },
  {
    id: "fees",
    title: "Fee Schedules & Structures",
    summary: "The fee items of each class and term, one by one or in bulk.",
    keywords: ["fee", "fee items", "tuition", "levy", "price", "schedule", "bulk fees"],
  },
  {
    id: "rules",
    title: "Payment Rules",
    summary: "Whether families may pay an invoice in parts, and the smallest part, for the school and for each branch.",
    keywords: ["part payment", "installment", "instalment", "partial payment", "pay in full", "minimum payment"],
  },
  {
    id: "scholarships",
    title: "Scholarships",
    summary:
      "The kinds of scholarship a branch gives, each with its share of the fees. A pupil is given one from the pupil's Actions list.",
    keywords: ["scholarship", "bursary", "award", "free place", "full scholarship", "hafiz", "merit", "paid by scholarship"],
    steps: ["Open Finance", "Choose the Scholarships tab", "Add a type with its share, then give it to a pupil from Students"],
  },
]).map((d) => ({ ...d, only: "admin" as const }));

const USERS = tabs("/users", "Users", "page", [
  {
    id: "people",
    title: "People",
    summary: "Everyone with an account, in every branch you administer.",
    keywords: ["staff", "teacher", "admin", "account", "role", "deactivate", "reactivate"],
  },
  {
    id: "invitations",
    title: "Pending invitations",
    summary: "Invitations sent and not yet accepted: resend or revoke them.",
    keywords: ["invite", "invitation", "resend", "revoke", "pending"],
  },
  {
    id: "staff",
    title: "Staff sign-in",
    summary:
      "The staff records of your branches: tick the ones who should sign in and invite them at the address on their record, or move someone to another branch.",
    keywords: ["invite staff", "staff email", "corper", "transfer", "move staff", "another branch", "sign in"],
    steps: ["Open Users", "Choose the Staff tab", "Tick the people to invite, then press Invite to sign in"],
  },
  {
    id: "guardians",
    title: "Guardians",
    summary: "Pupils' guardians, each with their children: block a guardian from a child, change their details, or make their access code.",
    keywords: ["guardian", "parent", "parents", "mother", "father", "block guardian", "access code", "family", "children"],
    steps: ["Open Users", "Choose the Guardians tab", "Open a guardian to see their children"],
  },
]);

// The pages that have no tabs of their own in the address, or that are one screen. `summary` is about what is there, not about the page's name.
const PAGES: Destination[] = [
  {
    id: "/dashboard",
    title: "Overview",
    href: "/dashboard",
    page: "/dashboard",
    trail: ["Overview"],
    summary: "Where the school stands today, and what needs doing.",
    keywords: ["home", "dashboard", "start"],
    group: "page",
  },
  {
    id: "/branches",
    title: "Branches",
    href: "/branches",
    page: "/branches",
    trail: ["Branches"],
    summary: "The school's branches: add one, rename it, see its people.",
    keywords: ["campus", "branch", "add branch", "delete branch"],
    group: "page",
  },
  {
    id: "/users",
    title: "Users",
    href: "/users",
    page: "/users",
    trail: ["Users"],
    summary: "Everyone with an account, and the invitations waiting.",
    keywords: ["accounts", "staff", "teachers", "people", "roles"],
    group: "page",
  },
  {
    id: "/approvals",
    title: "Approvals",
    href: "/approvals",
    page: "/approvals",
    trail: ["Approvals"],
    summary: "Results, changes and requests waiting for a decision.",
    keywords: ["approve", "pending", "requests", "decisions"],
    group: "page",
  },
  {
    id: "/settings",
    title: "Settings",
    href: "/settings",
    page: "/settings",
    trail: ["Settings"],
    summary: "School-wide settings, in tabs.",
    keywords: ["configure", "preferences", "options"],
    group: "page",
  },
  {
    id: "/academics",
    title: "Academics",
    href: "/academics",
    page: "/academics",
    trail: ["Academics"],
    summary: "Classes, subjects, sessions, grading, staff and promotion of a branch.",
    keywords: ["classes", "subjects"],
    group: "page",
  },
  {
    id: "/students",
    title: "Students",
    href: "/students",
    page: "/students",
    trail: ["Students"],
    summary: "The pupils of a branch: register, edit, archive, suspend.",
    keywords: ["pupil", "pupils", "learners", "admission", "enrol", "register"],
    group: "page",
  },
  {
    id: "/lms",
    title: "Coursework",
    href: "/lms",
    page: "/lms",
    trail: ["Coursework"],
    summary: "Lessons, assignments and quizzes.",
    keywords: ["lms", "assignment", "homework", "quiz", "lesson", "learning"],
    group: "page",
  },
  {
    id: "/attendance",
    title: "Attendance",
    href: "/attendance",
    page: "/attendance",
    trail: ["Attendance"],
    summary: "Take the roll of a class and read who was absent.",
    keywords: ["roll call", "absent", "present", "register"],
    group: "page",
  },
  {
    id: "/results",
    title: "Results",
    href: "/results",
    page: "/results",
    trail: ["Results"],
    summary: "Enter marks, see results and report cards. Administrators choose which result template each class uses under Templates.",
    keywords: [
      "marks",
      "scores",
      "grades",
      "report card",
      "broadsheet",
      "enter scores",
      "result template",
      "templates",
      "which template",
      "classes use",
    ],
    group: "page",
  },
  {
    id: "/timetable",
    title: "Timetable",
    href: "/timetable",
    page: "/timetable",
    trail: ["Timetable"],
    summary: "The week's lessons by day and period.",
    keywords: ["schedule", "periods", "lessons", "week"],
    group: "page",
  },
  {
    id: "/programs",
    title: "Programs",
    href: "/programs",
    page: "/programs",
    trail: ["Programs"],
    summary: "Programs outside the usual classes, with their own people and attendance.",
    keywords: ["programmes", "course", "program"],
    group: "page",
  },
  {
    id: "/announcements",
    title: "Announcements",
    href: "/announcements",
    page: "/announcements",
    trail: ["Announcements"],
    summary: "Notices to a branch, a class or everyone.",
    keywords: ["notice", "news", "broadcast", "post"],
    group: "page",
  },
  {
    id: "/communication",
    title: "Communication",
    href: "/communication",
    page: "/communication",
    trail: ["Communication"],
    summary: "Messages to guardians and staff by e-mail or SMS.",
    keywords: ["email", "sms", "message", "notify", "send"],
    group: "page",
  },
  {
    id: "/finance",
    title: "Finance",
    href: "/finance",
    page: "/finance",
    trail: ["Finance"],
    summary: "Fees, invoices and payments.",
    keywords: ["fees", "invoice", "payment", "money", "school fees", "tuition", "receipt", "paystack"],
    group: "page",
  },
  {
    id: "/question-bank",
    title: "Question bank",
    href: "/question-bank",
    page: "/question-bank",
    trail: ["Question bank"],
    summary: "Questions to reuse in quizzes and practice.",
    keywords: ["questions", "quiz", "practice", "exam"],
    group: "page",
  },
  {
    id: "/forms",
    title: "Forms",
    href: "/forms",
    page: "/forms",
    trail: ["Forms"],
    summary: "Forms and questionnaires for pupils, guardians or staff.",
    keywords: ["survey", "questionnaire", "form"],
    group: "page",
  },
  {
    id: "/account",
    title: "My account",
    href: "/account",
    page: "/account",
    trail: ["My account"],
    summary: "Your name, e-mail, password, sign-in security and sessions.",
    keywords: ["profile", "password", "change password", "mfa", "two factor", "2fa", "security", "sign out everywhere", "devices"],
    group: "page",
  },
  {
    id: "/video-guide",
    title: "Video guide",
    href: "/video-guide",
    page: "/video-guide",
    trail: ["Video guide"],
    summary: "A walkthrough of the app on video.",
    keywords: ["help", "tutorial", "guide", "how to"],
    only: "superadmin",
    group: "page",
  },
];

// The questions people ask. Only ones whose steps were read off the screens as they are today.
const TASKS: Destination[] = [
  {
    id: "task:new-pupil",
    title: "Add a pupil",
    href: "/students",
    page: "/students",
    trail: ["Students"],
    summary: "Register one pupil, in a class if you like.",
    keywords: ["register pupil", "new student", "admit", "enrol", "create pupil"],
    steps: ["Open Students.", "Press New student.", "Fill in the name, gender and class, then press Register student."],
    group: "task",
  },
  {
    id: "task:many-pupils",
    title: "Add many pupils from a file",
    href: "/students",
    page: "/students",
    trail: ["Students"],
    summary: "Load a CSV or Excel file of pupils, check it, save it.",
    keywords: ["import pupils", "bulk", "upload", "csv", "excel", "spreadsheet"],
    steps: ["Open Students.", "Press Add many.", "Choose the file (or type the rows), read the review, then save the good rows."],
    group: "task",
  },
  {
    id: "task:suspend-pupil",
    title: "Suspend or expel a pupil",
    href: "/students",
    page: "/students",
    trail: ["Students"],
    summary: "Put a pupil's standing on hold, with the reason on record.",
    keywords: ["suspension", "expulsion", "discipline", "reinstate", "standing"],
    steps: ["Open Students.", "On the pupil's row, press the three dots.", "Choose Suspend or Expel, give the reason, and confirm."],
    group: "task",
  },
  {
    id: "task:archive-pupil",
    title: "Archive or restore a pupil",
    href: "/students",
    page: "/students",
    trail: ["Students"],
    summary: "Nothing is ever deleted: an archived pupil can be brought back.",
    keywords: ["remove pupil", "delete pupil", "left school", "unarchive", "restore"],
    steps: [
      "Open Students.",
      "On the pupil's row, press the three dots, then Archive.",
      "To bring them back: open Filters, choose Archived, then press the three dots on their row and choose Restore.",
    ],
    group: "task",
  },
  {
    id: "task:new-class",
    title: "Add a class",
    href: "/academics?tab=classes",
    page: "/academics",
    only: "admin",
    trail: ["Academics", "Classes"],
    summary: "Create a class, then its arms and subjects.",
    keywords: ["new class", "create class", "add form", "add grade"],
    steps: ["Open Academics.", "Stay on the Classes tab and press New class."],
    group: "task",
  },
  {
    id: "task:new-arm",
    title: "Add an arm to a class",
    href: "/academics?tab=classes",
    page: "/academics",
    only: "admin",
    trail: ["Academics", "Classes"],
    summary: "Split a class into arms (A, B, Gold ...).",
    keywords: ["arm", "stream", "division", "section"],
    steps: ["Open Academics, on the Classes tab.", "On the class's card, press the three dots.", "Choose Add arm."],
    group: "task",
  },
  {
    id: "task:class-subjects",
    title: "Choose the subjects a class takes",
    href: "/academics?tab=classes",
    page: "/academics",
    only: "admin",
    trail: ["Academics", "Classes"],
    summary: "Set which subjects a class has.",
    keywords: ["offerings", "assign subjects", "subjects of class"],
    steps: ["Open Academics, on the Classes tab.", "On the class's card, press the three dots.", "Choose Subjects."],
    group: "task",
  },
  {
    id: "task:new-session",
    title: "Start a new academic session",
    href: "/academics?tab=sessions",
    page: "/academics",
    only: "admin",
    trail: ["Academics", "Sessions"],
    summary: "Create the year with its terms, then make it active.",
    keywords: ["new year", "new term", "create session", "begin year", "2027/2028"],
    steps: ["Open Academics.", "Choose the Sessions tab.", "Press New session, set the dates of each term, and save."],
    group: "task",
  },
  {
    id: "task:current-term",
    title: "Change the current term",
    href: "/academics?tab=sessions",
    page: "/academics",
    only: "admin",
    trail: ["Academics", "Sessions"],
    summary: "Move the school on to the next term.",
    keywords: ["next term", "switch term", "make current", "set term"],
    steps: ["Open Academics, then the Sessions tab.", "On the term's card, press the three dots.", "Choose Make current."],
    group: "task",
  },
  {
    id: "task:term-break",
    title: "Add a mid-term break or holiday",
    href: "/academics?tab=sessions",
    page: "/academics",
    only: "admin",
    trail: ["Academics", "Sessions"],
    summary: "Mark days inside a term when school is closed.",
    keywords: ["holiday", "half term", "midterm", "break"],
    steps: ["Open Academics, then the Sessions tab.", "On the term's card, press the three dots.", "Choose Add a break."],
    group: "task",
  },
  {
    id: "task:close-session",
    title: "Close a session",
    href: "/academics?tab=sessions",
    page: "/academics",
    only: "admin",
    trail: ["Academics", "Sessions"],
    summary: "End the school year; its records are kept.",
    keywords: ["end year", "finish session", "end session"],
    steps: ["Open Academics, then the Sessions tab.", "On the session's card, press the three dots.", "Choose Close session."],
    group: "task",
  },
  {
    id: "task:invite",
    title: "Invite someone to the app",
    href: "/users",
    page: "/users",
    trail: ["Users"],
    summary: "Send a teacher or another member of staff an invitation by e-mail.",
    keywords: ["invite staff", "add user", "new teacher", "create account", "invite teacher"],
    steps: ["Open Users.", "Press Invite someone (or Invite many for a list).", "Fill in the form and send the invitation."],
    group: "task",
  },
  {
    id: "task:invoices",
    title: "Generate invoices for a class or the whole branch",
    href: "/finance?tab=invoices",
    page: "/finance",
    trail: ["Finance", "Student Invoices & Payments"],
    summary: "Make this term's invoices from the fee schedules.",
    keywords: ["bill", "billing", "fees", "invoice all", "batch invoices"],
    steps: ["Open Finance.", "Choose the Student Invoices & Payments tab.", "Press Batch Generate Invoices."],
    group: "task",
  },
  {
    id: "task:record-payment",
    title: "Record a payment a family made",
    href: "/finance?tab=invoices",
    page: "/finance",
    trail: ["Finance", "Student Invoices & Payments"],
    summary: "Cash, transfer or POS: record it and issue the receipt.",
    keywords: ["receipt", "cash payment", "bank transfer", "pay fees", "part payment", "installment"],
    steps: [
      "Open Finance, then the Student Invoices & Payments tab.",
      "On the invoice's row press View & Pay.",
      "Press Record Payment, fill it in, and press Record Payment & Issue Receipt.",
    ],
    group: "task",
  },
  {
    id: "task:finance-stats",
    title: "See how much has been collected and what is still owed",
    href: "/finance?tab=overview",
    page: "/finance",
    only: "admin",
    trail: ["Finance", "Overview"],
    summary: "Invoiced, collected, outstanding and overdue, with the collection rate, by class and by how it was paid.",
    keywords: [
      "statistics",
      "stats",
      "income",
      "revenue",
      "collection rate",
      "debtors",
      "who owes",
      "overdue",
      "report",
      "compare branches",
    ],
    steps: [
      "Open Finance: it opens on the Overview tab.",
      "Choose the term at the top, or All terms.",
      "With more than one branch, press All branches to see every branch side by side.",
    ],
    group: "task",
  },
  {
    id: "task:change-password",
    title: "Change my password",
    href: "/account",
    page: "/account",
    trail: ["My account"],
    summary: "Set a new password and see where you are signed in.",
    keywords: ["password", "reset password", "security"],
    steps: ["Open your name at the top right.", "Choose Profile.", "Use the Password section."],
    group: "task",
  },
];

export const DESTINATIONS: readonly Destination[] = [...PAGES, ...SETTINGS, ...ACADEMICS, ...APPROVALS, ...FINANCE, ...USERS, ...TASKS];

/// The tab ids this index reaches for each page, for the test that compares them with the pages' own lists.
export const INDEXED_TABS: Record<string, readonly string[]> = {
  "/settings": SETTINGS.map((d) => d.id.split("#")[1]!),
  "/academics": ACADEMICS.map((d) => d.id.split("#")[1]!),
  "/approvals": APPROVALS.map((d) => d.id.split("#")[1]!),
  "/finance": FINANCE.map((d) => d.id.split("#")[1]!),
  "/users": USERS.map((d) => d.id.split("#")[1]!),
};
export const PAGE_TAB_IDS = {
  "/settings": SETTINGS_TAB_IDS,
  "/academics": ACADEMICS_TAB_IDS,
  "/approvals": APPROVALS_TAB_IDS,
  "/finance": FINANCE_TAB_IDS,
  "/users": USERS_TAB_IDS,
} as const;
