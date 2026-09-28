# AlEemaan — Legacy System Feature Inventory

This document catalogs the exact current feature set of the AlEemaan School legacy system — every page, form, action, Firestore call, and role/permission rule — extracted directly from the code across all 5 repos in `out/` (not tracked in this repo — see [`legacy-repos.md`](legacy-repos.md) to check them out locally before following any file reference below), as factual input to the AlEemaan/Octalve Edu PRD and rebuild. No recommendations are included; this is a snapshot of what exists today.

---

## 1. Public Marketing Site (`aleemanschool` repo, excluding `/portal/`)

Plain HTML/CSS/JS, no backend calls except two dead-end forms (see 1.9). Every page shares the same nav (Home, About, Academics, Admissions, Contact, School Anthem, Portal) and footer (contact info, quick links, copyright). A floating "Proudly 2024/2025 Set" badge (`floating.js`) is injected fixed-position on every page.

### 1.1 Home (`index.html`)
- Hero banner with motto "Second To None", CTAs to Admissions and About.
- "Why Choose Us" 4-pillar grid: Academic Excellence, Islamic Character, Discipline & Values, Holistic Development.
- Programs section: Science Program, Combined Program (featured/"Most Popular"), Arabic & Islamic Studies — each links to an anchor on `/academics/`.
- Quick Access grid: Curriculum, Principal's Message, Admission Requirements, Academic Calendar.
- Testimonials carousel (3 hardcoded quotes from named parents/students — not pulled from any data source).
- CTA banner ("Applications now open 2025/2026") linking to Admissions/Contact.
- A commented-out (disabled) stats counter section (500 students / 35 teachers / 98% success / 15 years) and a commented-out contact form are present in the HTML but not rendered.

### 1.2 About (`about/index.html`)
- Founding story with a 3-entry timeline: 2010 (founded as Aleeman Nursery & Primary, Yokele Pekun/Saw Mail/Old Ife Rd), 2013 (secondary school named "Aleeman School of Science and Arabic Studies", Bodija), 2017 (primary+secondary merged at Kamjat Bustop, Opeyemi Street, New Ife Road, Ibadan).
- Mission and Vision cards.
- 6 Core Values (Knowledge, Faith, Integrity, Excellence, Respect, Innovation).
- Principal's Message (long-form letter; the actual principal's name/photo/signature block is commented out — currently anonymous).
- "What Makes Us Different" — 6 numbered differentiators.
- Facilities showcase: Library, Science Labs, ICT Center, Prayer Hall (images referenced at `images/library.jpg` etc. — these files were not found among the read files, likely broken paths outside `about/images/`).

### 1.3 Academics (`academics/index.html`)
- Tabbed curriculum browser (Western Program / Arabic Program / Quran Program), JS-driven tab switching (`js/main.js`).
  - Western Program tab: Secondary (Senior/Junior) subject lists and Primary (Pre-Primary/Primary) subject lists, each with a "Fees" shortcut linking to `/admissions/#fees`.
  - Arabic Program tab: Qur'anic Studies, Fiqh, Hadith, Islamic History, Arabic Literature, Grammar (Nahw/Sarf), Conversation, Translation.
  - Quran Program tab: Qur'anic Memorization, Arabic Language, Islamic Studies.
- Academic Departments grid (Science; Arabic & Islamic Studies; Languages; Humanities & Social Sciences).
- "Academic Calendar" section — the actual calendar timeline is commented out; only a button remains, which redirects to `/subjects/` (not an actual calendar).
- Page references `js/academics.js`, which **does not exist** in the repo — a broken script tag / 404 in production.

### 1.4 Admissions (`admissions/index.html`)
- 5-step "Admission Process" visual (Inquiry & Visit → Application → Entrance Exam → Interview → Acceptance).
- Requirements cards for JSS1, SS1, and Transfer students (documents needed: PSLC/BECE certs, birth certificate, 4 passport photos, medical certificate, testimonials, transfer certificate).
- Fees & Deadlines section: flat text price ranges (JSS ₦150k–180k/term, SS ₦180k–220k/term) plus a **"View Full Fee Structure" button** that opens a client-side **Fees Modal** (`js/fees-modal.js` + `js/fees-data.js`) — a fully-featured, data-driven fee browser:
  - Categories: Secondary (Boarding), Secondary (Day), Primary — each with multiple "bills" (e.g. Returning Senior Boarding, New In-Take Junior Boarding by gender).
  - Each bill renders a line-item table (School Fee, Feeding Fee, Accommodation, First Aid, ID Card, Uniform, Hostel Wear, etc.), a computed/declared total, category-specific notes, a bank payment account (name/number/bank), and for some bills a "Required Material Aspect (Provisions)" checklist (detergent, toothpaste, mattress, mosquito net, etc.).
  - "Print / Save as PDF" action opens a formatted print window of the selected bill.
- Online Admission Form (`#admissionForm`) fields: Student's Full Name*, Date of Birth* (validated age 5–20), Gender* (male/female), Applying For* (JSS1–SS3), Academic Session* (defaults "2025/2026"), Number of Children Applying* (1–5+), Previous School Attended, Parent/Guardian Name*, Phone*(NG format validated), Email, Home Address* (textarea), Additional Information (textarea).
  - **On submit: `js/admissions.js` does NOT write to Firestore or send anywhere.** It validates fields client-side, shows a fake 2-second "Submitting…" spinner, then displays a canned success modal, and clears a `localStorage` "admissionDraft" autosave. The form is fully cosmetic — no backend persistence, no email, no notification to the school.
  - A commented-out legacy version of the same section (with Scholarship checkbox, PDF download link, and a Contact-Admissions block) remains in the HTML source but is disabled.
- Scholarship section (Academic Excellence up to 50% waiver, Need-Based 20–75%, Qur'an Memorization up to 30%) exists only as commented-out HTML — not live.

### 1.5 Contact (`contact/index.html`)
- Quick-contact cards: phone (+234 815 300 5393), email (aleemangroupofschools@gmail.com), address (Ibadan, Oyo State), office hours.
- The actual "Send Us a Message" contact form (`#mainContactForm`) is commented out/disabled in the HTML.
- Live sections: Connect With Us (social icons, all `href="#"` placeholders), Quick Links sidebar, embedded Google Maps iframe + "View on Google Maps" link, 3 "Getting Here" info cards (address/directions/parking).
- Campus Tour section (`#tour`) — descriptive content only; the actual tour-booking form (`#tourForm`, with date/time/visitor-count fields) is commented out/disabled.
- FAQ accordion (6 Q&As: admission requirements, academic year start, scholarships, student-teacher ratio 15:1, boarding availability, fee payment methods).
- Emergency contact banner.
- `js/contact.js` contains full validation logic for both the main contact form and the tour form (email/phone regex, date-range/weekday checks) even though neither form is currently rendered — dead code kept "ready" behind the HTML comments.

### 1.6 School Anthem (`anthem/index.html`)
- Self-contained single-page design (own `<style>` block, Amiri/Poppins fonts) — visually distinct from the rest of the site.
- Full Arabic anthem lyrics ("دار الإيمان") laid out as RTL couplets, plus a complete English translation.
- Functional HTML5 `<audio>` player: play/pause, rewind/forward 10s, seekable progress bar, volume slider, a dropdown to switch between `anthem.mp3` and `anthem2.mp3` (auto-plays on selection). Audio files are referenced relatively (`../anthem.mp3`) — presence not verified in this read.
- "Core Values of Aleeman School" 4-tile section (Faith, Knowledge, Piety, Community) and 3 "About the Anthem" info cards.

### 1.7 Old Students / Alumni (`oldstudents/index.html`)
- Distinct visual theme (deep green/gold, Cinzel/Amiri fonts) not shared with the rest of the site.
- Hero stats strip: "16+ Years of Excellence", "2010 Founded", "100s Graduates", "98% Exam Success Rate".
- Alumni Hall of Excellence: a **client-side hardcoded array** of 9 fictional/sample alumni (name, graduation year, field, achievement, icon) — e.g. "Ahmed Hassan, 2020, Medicine, Medical Doctor — UI Teaching Hospital". Filterable by field (All/Medicine/Technology/Islamic Studies/Engineering/Business) via a client-side filter button row. **Not backed by Firestore or any data source** — this is placeholder content.
- Hadith quote banner, "Are You an Old Student?" CTA linking to Contact.

### 1.8 Subjects & Curriculum (`subjects/index.html`)
- Distinct visual theme matching Old Students page.
- Primary section: Pre-Primary (Nursery 1/2), Preparatory (Prep A/B), Primary (1–5) — each a card with a "Get PDF" button.
- Secondary section: JSS 1–3 and SS 1–3 — each a card with a "Get PDF" button.
- **Data-quality note:** every Primary-section "Get PDF" button opens the exact same single Google Drive link (`1bc0n8e0IY...`), and every Secondary-section button opens the same second link (`1YEY0OAJT...`) — i.e. there are only 2 distinct curriculum PDFs shared across all 15 class levels, not per-class documents. A separate in-script `pdfLinks` map with real per-class placeholder keys (`path/to/jss1.pdf`, etc.) exists but is unused by the visible buttons; it only powers an unused `handleDownload()`/toast "coming soon" fallback function that nothing calls.

### 1.9 Vacancy / Careers (`vacancy/index.html`)
- "Why Join Us" perks grid (Professional Development, Competitive Salary, Collaborative Culture, Staff Welfare, Career Growth, Purposeful Work).
- 5 hardcoded job listings, each an expandable/collapsible card (click to toggle Requirements + Responsibilities detail blocks): Secondary Mathematics Teacher (urgent), Arabic Language & Islamic Studies Teacher (featured), English Language Teacher (new), Science Teacher (Bio/Chem/Physics), School Administrative Officer. Each has an "Apply →" button that scrolls to and pre-selects the position in the application section.
- **Two application mechanisms present in source, only one live:**
  - A full structured job-application form (`#applyForm` — First/Last Name, Phone, Email, Position dropdown, Years of Experience, Highest Qualification, Cover Letter textarea, CV file upload with drag-style "upload area", plus a WhatsApp-send fallback) exists but is **entirely commented out**.
  - The live section instead is a **WhatsApp-only application flow**: a checklist of what to include (Full Name, Position, Experience, Qualification, CV) and a single "Apply on WhatsApp" button that opens `wa.me/2348153005393` with a pre-filled message template. There is no in-site form submission or file upload actually functioning.
- "Don't See Your Role?" CTA with WhatsApp/email links for speculative applications.

---

## 2. Student/Parent Result Portal (`aleemanschool/portal/`)

`portal/index.html` is a landing hub linking to 4 parallel, near-identical result-checker apps (`primary.html`, `secondary.html`, `arabic-primary.html`, `arabic-secondary.html`). **Each of the 4 result checkers — and the hub itself — connects to a different Firebase project** (see §6 for the full cross-cutting implication):

| File | Firebase projectId |
|---|---|
| `portal/index.html` (hub) | `aleeman-primary` |
| `secondary.html` | `aleeman-school` |
| `primary.html` | `aleeman-primary` |
| `arabic-primary.html` | `aleeman-primary-arabic` |
| `arabic-secondary.html` | `aleeman-arabic` |

### 2.1 Shared behavior across all 4 variants
- Login-gated result lookup: student enters Email, Password (labelled "PIN/Password" in the primary variants), Class (dropdown), Term, and Academic Session (`YYYY/YYYY` regex-validated).
- Auth flow: `signInWithEmailAndPassword` against the section's own Firebase Auth → on success, fetch `students/{uid}` doc.
- **Payment gate**: if `student.hasPaid` is falsy, the result is refused with "Your result is not available. Please contact the Principal to confirm your payment status." — regardless of whether a result document exists.
- Class-consistency check: if the student's stored `class` doesn't match the class they selected, access is refused with a corrective message.
- Result fetch: `getDoc(results/{deterministic-id})` where the ID is built from `uid__class__term__session` (slugified). If missing: "No result found… Contact your class teacher."
- Class position/ranking is computed client-side: query all `results` docs matching class+term+session, rank the student's `average` among them (ties are not specially handled — a naive "count how many have a strictly higher average, +1" formula).
- Signs the student out (`signOut(auth)`) immediately after fetching data — no persistent student session.
- Report card display: school header, student info (Name/Number/Class/Gender), position ribbon, subjects table (Subject / CA / Exam / Total / Grade / Remark, with dynamic per-test columns driven by the admin's `assessmentConfig`), performance bar (color-coded green/amber/red by %), summary tiles (Total/Average/Position/Class-size), Teacher's Remark + Principal's/Head Teacher's Remark boxes, a static WAEC-style grading-scale legend (A1 75–100 … F9 0–39).
- Actions: "New Search" (reset form), "Print / Export" modal offering (a) browser Print (with dedicated `@media print` styles hiding chrome) and (b) "Download PDF" via a lazily-loaded `html2pdf.js` (CDN) that rasterizes the report card to a PDF file named after the student number.
- No signup/registration flow on these pages — student accounts are created only by the Admin portal.

### 2.2 Differences between the 4 variants
- **`primary.html` / `arabic-primary.html`** (vs. the two secondary variants) additionally call a `settings/classes`, `settings/session`, and `settings/school` config load on page init to dynamically populate the class dropdown and pre-fill session/term and school motto/address — the secondary variants use a hardcoded class list (JSS1–SS3) and don't load `settings/classes` or `settings/school`.
- Class lists differ by section: secondary = JSS1–3/SS1–3; primary = Nursery 1/2, Prep A/B, Primary 1–5; Arabic Primary = Ibtidaiyah 1–3, I'dadiyah 1–3; Arabic Secondary = Ibtidaiyah 1–3, I'dadiyah 1–3, Thanawiyah 1–3.
- Term options differ: English secondary/primary offer First/Second/Third Term; **both Arabic variants restrict to only First Term / Second Term** (no Third Term option, enforced both in the dropdown and in JS validation).
- Arabic variants add bilingual (Arabic RTL, `Noto Naskh Arabic` font) headings/subtitles throughout (e.g. "مدرسة العليمان للدراسات العربية والإسلامية").
- `primary.html` shows "Submitted By" summary but hides it by inline `display:none` (present in DOM, not visible) — same pattern across variants.
- `primary.html`/`arabic-primary.html` show a "Term Ends" / "Next Term Begins" date pair (from `settings/session`) when available; the secondary variants do not render this block at all.
- `vvv.html` in the **primary teacher-portal repo** (not `portal/`) is a leftover/earlier draft of this same hub page — see §6.

---

## 3. Teacher Portals (secondary + primary repos)

Single-file apps (`aleemanschool-teacher-portal/index.html`, 970 lines; `aleemanschool-primary-teacher-portal/index.html`, 740 lines). Both connect to their respective section's own Firebase project (`aleeman-school` for secondary, `aleeman-primary` for primary) and are near-identical in structure and logic — primary differs mainly in class list, subject list, exam-mark scale, and additional dynamic-classes support.

### 3.1 Auth & role check
- Email/password login (`signInWithEmailAndPassword`) with **client-side rate limiting**: after 5 failed attempts, the login button is disabled for a visible 30-second countdown.
- On auth success, checks `teachers/{uid}` exists in Firestore; if not, immediately signs the user out and shows "Access denied. Please contact the Admin." (i.e. any Firebase Auth user who isn't also registered as a `teachers` doc is rejected, even if their credentials are valid).

### 3.2 Class/session/term selection & guardrails
- Teacher picks Class, Term, Session (auto-prefilled from `settings/session` if the admin has set an active session/term, with a visible "AUTO" badge).
- `validateTeacherSession()` enforces that the teacher cannot submit for a session later than the admin's active session, nor a term ranked beyond the admin's active term for that session (First < Second < Third) — client-side only, no server-side/Firestore-rules enforcement.
- "Load Students" fetches `students` where `class==selected`, ordered by name, plus existing `results` for that class/term/session to compute each row's Done/Pending status and running average.

### 3.3 Score entry modal (per student)
- Subjects list is pulled from `settings/subjects` (JSS/SS or prePrimary/primary lists, each admin-configurable) with per-subject **password locks** from `settings/subjectPasswords`: each subject row starts disabled/greyed out; teacher must click "Unlock", enter that subject's password (admin-set; subjects with no password set can be unlocked with one click), and only then can the score inputs for that row be edited. A password-visibility "eye" toggle is provided.
- Dynamic per-test columns are rendered from `settings/assessment` (`tests: [{id,name,max}]`, admin-configurable, must sum to a fixed CA total — 30 for secondary, 40 for primary). Exam score field is capped at 70 (secondary) or 60 (primary) so CA+Exam=100.
- Live client-side recalculation: as scores are typed, CA subtotal, grand total, and WAEC-style grade (A1/B2/B3/C4/C5/C6/D7/E8/F9) update per row; invalid/out-of-range values are highlighted red and block saving.
- **Subject removal support**: if a teacher unlocks a subject and then clears every input for it, saving will *delete* that subject from the student's stored result (distinct from "locked" subjects, which are left untouched).
- Remarks: separate "Teacher's Remark" and "Principal's Remark" textareas, both locked behind a class-level "remark password" (`settings/remarkPasswords`, one password per class) that must be entered to unlock either field for editing.
- Save uses a Firestore `writeBatch` and merges the final subject list (existing + newly entered + minus removed) before recomputing `totalScore`/`average` and writing to `results/{deterministic-id}` with `merge:true`, stamping `submittedAt`/`updatedAt`.
- Modal footer shows a live summary: subjects unlocked (n/total), subjects filled, running average.

### 3.4 Differences: primary vs secondary
- Exam max: 70 (secondary) vs 60 (primary); CA total target: 30 vs 40.
- Secondary has a fixed class list (JSS1–3, SS1–3) hardcoded in the HTML `<select>`; primary loads its class list dynamically from `settings/classes` (admin-managed, split into `prePrimary`/`primary` arrays) and has a special rule (`isPrePrimary()`) where "Nursery 2" is treated as sharing the *primary* subject set rather than the pre-primary set, despite its name.
- Subject default lists differ (secondary: Mathematics, English, Basic Science, Basic Technology, Social Studies, Civic Ed, Agric Science, Computer Studies, IRS, Arabic, Business Studies, PHE / SS adds Physics, Chemistry, Biology, Further Maths, Computer Science, Islamic Studies, Economics, Geography — vs primary's Phonics/Handwriting/Verbal-Quantitative Reasoning/Cultural & Creative Arts-oriented list).
- Both files are otherwise line-for-line near-identical (variable names, function bodies, unlock/lock logic, batch-save logic, grading function) — a maintained copy-paste fork rather than a shared module.

---

## 4. Admin Portals (secondary + primary repos)

Single-file apps (`admin-aleemanschool-admin-portal/index.html`, 1857 lines; `admin-aleemanschool-primary-admin-portal/index.html`, 1721 lines), plus a standalone `signup.html` in each repo. Sidebar-navigated SPA with 5 panels: Overview, Teachers, Students, Results, Settings. This is the most feature-rich surface in the system.

### 4.1 Auth & role check
- Same email/password login pattern as the teacher portal (no rate-limit widget on the admin login, unlike teacher/though same CSS classes exist).
- On auth, the app checks **both** `teachers/{uid}` and `students/{uid}` collections — if either exists, the login is rejected ("Access denied") and the user is signed out, on the assumption that anyone not found in either collection must be an admin. **There is no explicit `admins` collection membership check gating dashboard access** in the main app (only the separate `signup.html` writes to an `admins` collection) — effectively, any Firebase Auth user in the project who is not already a teacher or student is treated as an admin.

### 4.2 Overview panel
- 4 live stat cards via `getCountFromServer`: Teachers, Students, Results, Classes (secondary: hardcoded "6"; primary: computed from `settings/classes`).
- Static info/warning banners explaining the active-session-caps-teachers rule and the subject-password requirement.

### 4.3 Teachers panel
- Paginated (20/page, "Load More") table: #, Name, Email, Added date, Actions.
- Client-side search filter (name/email) over the currently-loaded cache (does not re-query Firestore).
- **Add Teacher**: modal collects Name, Email, Password (min 6 chars) → creates a Firebase Auth user via a *secondary, throwaway Firebase app instance* (`createSecondaryAuth()`, a fresh `initializeApp` under a unique name) so the admin's own session isn't disturbed, then writes `teachers/{uid}` `{uid,name,email,role:'teacher',createdAt}`.
- **Delete Teacher**: requires the admin to type the *teacher's own password* to confirm — the app re-authenticates as that teacher (via the secondary app) to obtain their credential, deletes the Firebase Auth user, then deletes the Firestore doc. (No admin-level force-delete without knowing the teacher's password.)

### 4.4 Students panel
- Class-filter dropdown + paginated (20/page) table: #, Name, Email, Class, Gender, Student ID (Firebase UID), **Paid toggle switch**, Actions (Edit/Delete).
- Client-side search filter over loaded cache; "Export CSV" downloads the currently-loaded student cache as a CSV (Name, Email, Class, Gender, UID).
- **Add Student**: modal collects Name, Email, Class, Gender, Password (min 6, required only for new students) → creates a Firebase Auth user (secondary app) and writes `students/{uid}` `{uid,name,email,class,gender,number:uid,createdAt}` — the student's "number"/student-ID *is* their Firebase UID, not a human-friendly admission number.
- **Edit Student**: email field becomes read-only ("cannot be changed after creation" — it's the auth identity); only name/class/gender are editable via `updateDoc`; password field is hidden entirely during edit (a note states password changes must go through Firebase Console directly — no in-app password reset for students).
- **Delete Student**: requires the *student's own password* to re-authenticate (same secondary-app pattern as teacher deletion) before deleting both the Auth user and the Firestore doc; explicitly states existing result records are *not* deleted.
- **Payment toggle** (per row): a switch component directly flips `students/{id}.hasPaid` via `updateDoc`, stamping `paymentUpdatedAt`. This is the field the student result-checker payment gate reads.
- **Bulk "Reset Payment"** action: pick a class → preview shows total students and how many are currently marked Paid → confirms → batch-updates every student in that class to `hasPaid:false` (chunked at 450 docs/batch for Firestore's batch-size limit).
- **Bulk "Promote Students"** action (see 4.6).

### 4.5 Results panel
- Filter by Class / Term / Session (all optional, combined as Firestore `where` constraints) → "Load" queries `results` collection.
- Table: Student Name, Number, Class, Term, Session, subject count, Average, Submitted By.
- "Export CSV" downloads the currently-loaded results cache.
- No edit/delete affordance for individual results from this panel — read-only view (editing happens only via the Teacher portal's score modal).

### 4.6 Student Promotion (bulk action)
- **Gated to Third Term only**: the modal checks `settings/session.activeTerm === 'Third Term'`; if not, shows a blocking message and hides the promotion form entirely (re-verified again at submit time in case the admin changes the active term mid-flow).
- Admin picks a source class + session → "Preview" computes, per currently-enrolled student in that class, the **average of their averages across all result documents found for that class+session** (i.e. across however many terms have results — 1, 2, or 3), and classifies each into "Will be promoted" (overall avg ≥ 50%), "Will stay" (< 50%), or "Skipped — no results for this session".
- Terminal classes (SS3 for secondary; the last class in the primary's dynamic list) show a warning that students graduate there instead of promoting.
- On confirm, updates each promoted student's `class` to the next class and appends an entry to a `promotionHistory` array field via `arrayUnion` (idempotent — re-running promotion is explicitly documented as safe since already-promoted students are no longer in the source class query). Batched in chunks of 450.
- Students who fail (avg < 50%) or have no results are left completely untouched (no flag written).

### 4.7 Settings panel (tabbed)
- **School Info**: Name, Principal/Head Teacher name, Phone, Motto, Address → `settings/school`.
- **Session**: Active Academic Session (`YYYY/YYYY`, validated), Current Term, Next Term Begins (date), Term Ends/Break Date (date) → `settings/session`. Explicitly documented as the ceiling that caps what teachers can submit.
- **Classes** (**primary admin only** — secondary has no such tab since its classes are fixed JSS1-3/SS1-3): add/remove class names split into Pre-Primary and Primary groups, each as a removable "chip"; explicitly notes deleting a class does not delete its students/results; saved to `settings/classes`.
- **Assessment**: dynamic list of CA test components (name + max score each, up to 6), with a live running total that must equal exactly 30 (secondary) or 40 (primary) before saving is allowed → `settings/assessment` (also stores fixed `examMax` 70/60).
- **Subjects**: two lists (JSS/SS for secondary; Pre-Primary/Primary for primary), each subject row has a Name field and a **required Password field** (save is blocked with an inline error if any subject is missing a password) → written to two separate documents, `settings/subjects` (names only) and `settings/subjectPasswords` (name→password map) — these are the per-subject unlock passwords the Teacher portal enforces.
- **Remarks**: one password per class (fixed 6 inputs for secondary's fixed classes; dynamically rendered per class for primary) → `settings/remarkPasswords` — these are the per-class remark-unlock passwords the Teacher portal enforces.

### 4.8 `signup.html` (both repos)
- A **standalone admin self-registration page**, not linked to from `index.html`'s login screen but present as a directly-reachable static file (`/signup.html`).
- Collects Full Name, Email, Password, Confirm Password, and an "Admin Registration Key".
- **Security-critical finding**: the registration key is a **hardcoded plaintext string compared entirely client-side** — `ALEEMAN_SUPER_ADMIN_2025` (secondary repo) / `ALEEMAN_PRIMARY_ADMIN_2025` (primary repo), visible to anyone who views the page's JavaScript source or intercepts the request. Anyone who obtains this string (by reading the deployed source, which requires no auth) can call `createUserWithEmailAndPassword` + write `admins/{uid}` `{name,email,role:'super_admin',createdAt,isActive:true}` and obtain full administrative access to student PII, payment status, and result data — there is no server-side verification of the key at all (no Cloud Function, no Firestore rule referencing it). See §6 for the consolidated security summary.

### 4.9 Differences: primary vs secondary
- Primary admin has the extra **Classes** settings tab (dynamic class list) that secondary lacks (secondary's classes are hardcoded JSS1-3/SS1-3 throughout the app).
- Assessment CA/Exam split: 30/70 (secondary) vs 40/60 (primary).
- Otherwise the two admin apps are structurally identical — same panel layout, same modals, same promotion/payment-reset/CSV-export logic, same secondary-Firebase-app trick for add/delete-without-affecting-own-session — strongly suggesting one was copy-pasted from the other and lightly adapted (down to shared helper function names like `_getNextClass`, which explicitly branches on `typeof getAllClasses === 'function'` to detect which variant it's running in).

---

## 5. Data Model (inferred from Firestore calls across all repos)

Every repo/section uses this same document shape even though the **projectId differs by section** (see §6). Collection/document names below are consistent across all apps.

### `students` (doc ID = Firebase Auth UID)
Written by: Admin (create/edit), Promotion batch. Read by: Teacher portal, Admin portal, Result-checker.
- `uid` (string, = doc ID)
- `name` (string)
- `email` (string, immutable after creation — doubles as the Firebase Auth login identity)
- `class` (string, e.g. "JSS1", "Primary 3", "Ibtidaiyah 2")
- `gender` (string: "Male"/"Female")
- `number` (string — **always equal to `uid`**; a legacy/compatibility field name so the Teacher portal's `where('number','==',...)`-style logic still works)
- `hasPaid` (boolean — gates result-checker access)
- `paymentUpdatedAt` (server timestamp, set whenever `hasPaid` is toggled)
- `createdAt` / `updatedAt` (server timestamps)
- `promotionHistory` (array of `{from, to, session, promotedAt}`, appended via `arrayUnion` on each promotion)

### `teachers` (doc ID = Firebase Auth UID)
Written by: Admin (create/delete only — no edit UI). Read by: Teacher-portal auth guard, Admin/teacher-role disambiguation checks.
- `uid`, `name`, `email`, `role:'teacher'`, `createdAt`.

### `admins` (doc ID = Firebase Auth UID)
Written only by `signup.html` (see 4.8's security note). Not read/enforced anywhere in the main admin app's logic (role is inferred by *absence* from `teachers`/`students`, not presence in `admins`).
- `name`, `email`, `role:'super_admin'`, `createdAt` (ISO string, not serverTimestamp — inconsistent with other collections), `uid`, `isActive:true`.

### `results` (doc ID = deterministic `{uid}__{class}__{term}__{session}`, slugified)
Written by: Teacher portal (create/update/partial-delete of subjects), via `writeBatch` + `merge:true`. Read by: Result-checker, Admin Results panel, Promotion preview.
- `studentNumber` (= student uid), `studentName`, `class`, `term`, `session`, `gender`
- `subjects`: array of `{name, tests:[{id,name,score,max}], caTotal, exam, total, grade, remark}`
- `totalScore` (sum of all subject totals), `average` (mean of subject totals)
- `assessmentConfig`: `{tests:[{id,name,max}]}` — a **snapshot** of the test config at time of save (so historic results keep their original column structure even if the admin later changes `settings/assessment`)
- `teacherRemark`, `principalRemark` (strings, independently unlockable)
- `submittedBy` (present in schema/UI but not observed being set anywhere in the read code — likely a stale/planned field), `submittedAt`, `updatedAt` (server timestamps)

### `settings/*` (a set of fixed-ID documents, not a growing collection)
- `settings/school` — `{name, principal, phone, motto, address, updatedAt}`
- `settings/session` — `{activeSession, activeTerm, nextTermBegins, termEnds, updatedAt}` — the single global "current term" switch that both caps teacher submissions and pre-fills the result-checker/teacher dropdowns
- `settings/classes` — **primary only** — `{prePrimary:[...], primary:[...], updatedAt}`
- `settings/assessment` — `{tests:[{id,name,max}], caMax, examMax, updatedAt}`
- `settings/subjects` — `{JSS:[...], SS:[...]}` (secondary) or `{prePrimary:[...], primary:[...]}` (primary)
- `settings/subjectPasswords` — mirrors `subjects` shape but maps subject-name → plaintext password string (stored directly in Firestore, not hashed)
- `settings/remarkPasswords` — map of class-name → plaintext password string

### Security note on passwords-as-data
Subject-unlock passwords and per-class remark passwords are stored as **plaintext strings in ordinary Firestore documents**, readable by any authenticated user with read access to `settings/*` (and since no `firestore.rules` file exists in any repo, the project is very likely running on Firestore's insecure default/test-mode rules, meaning these could be readable by *any* signed-in — or even anonymous — client, not just teachers/admins).

---

## 6. Cross-cutting observations

### 6.1 Four separate Firebase projects, not one
Despite the task brief's known-so-far reference to a single `aleeman-school` project, this inventory found **four distinct Firebase projects** in active use, each with its own `apiKey`/`authDomain`/`projectId`, meaning each is a **fully separate, non-federated database**:

| Section | projectId | Used by |
|---|---|---|
| Secondary (English) | `aleeman-school` | `aleemanschool-teacher-portal`, `admin-aleemanschool-admin-portal`, `portal/secondary.html` |
| Primary (English) | `aleeman-primary` | `aleemanschool-primary-teacher-portal`, `admin-aleemanschool-primary-admin-portal`, `portal/index.html` (hub), `portal/primary.html` |
| Primary Arabic | `aleeman-primary-arabic` | `portal/arabic-primary.html` only |
| Secondary Arabic | `aleeman-arabic` | `portal/arabic-secondary.html` only |

There is **no admin or teacher portal at all for the two Arabic sections** in this codebase — only student result-checkers exist for `aleeman-primary-arabic` and `aleeman-arabic`, meaning either those two Firebase projects' `students`/`results`/`settings` data is populated through some other means not present in these 5 repos, or those two result-checkers are currently non-functional/unpopulated in production. This 4-way split also means a student or family with children in both the primary and secondary sections has two completely separate logins/records with no shared identity.

### 6.2 Primary vs secondary duplication
The teacher portal pair and the admin portal pair are each near-line-for-line forks of one another (shared variable names, shared helper functions like `mergeSubjectsWithRemovals`, `_getNextClass`, `resultDocId`), adapted only for: class lists (fixed vs. dynamic), subject lists, and the CA/Exam mark split (30/70 vs 40/60). This is copy-paste duplication rather than a shared/parameterized codebase — any bugfix or feature added to one must be manually re-applied to the other (and evidently sometimes isn't: e.g. only the primary admin has the Classes settings tab).

### 6.3 Role/permission model
There is no formal roles table. "Which portal a user is allowed into" is decided purely by **collection membership**, checked at login time in each app:
- Teacher portal: allow only if `teachers/{uid}` exists.
- Admin portal: allow if `teachers/{uid}` does **not** exist AND `students/{uid}` does **not** exist (i.e. admin is the default/fallback role, not an explicit membership check against `admins/{uid}`).
- Student result-checker: no collection-membership gate beyond requiring a `students/{uid}` doc to exist and `hasPaid===true`; any Firebase Auth account in that project's user pool can attempt to sign in.

Because there is no `firestore.rules` file in any of the 5 repos, all of the above "gates" are enforced only by client-side JavaScript that happens to run in the browser — a user with slightly more technical knowledge could call the Firebase SDK directly (or edit the deployed JS) to bypass every one of these checks, including the admin-signup secret key (§4.8) and the payment gate (§2.1).

### 6.4 `vvv.html` and `signup.html` — what they are
- **`vvv.html`** (in `aleemanschool-primary-teacher-portal/`, 273 lines): an earlier/alternate draft of the portal landing hub page. It is visually and structurally almost identical to `portal/index.html` but links to three files that do not exist anywhere in these 5 repos — `admin.html`, `teacher.html`, `student.html` — implying an earlier architecture (separate admin/teacher/student pages per section, all under one folder) that was later abandoned in favor of the current per-section-repo structure (`admin-aleemanschool-...`, `aleemanschool-...-teacher-portal`, `portal/primary.html`). It is dead/unreferenced code left in the repo.
- **`signup.html`** (one per admin-portal repo): the standalone admin self-registration page described in §4.8 — live, deployed, and reachable, but not linked from the admin login screen itself (a user would need to know/guess the URL). Its hardcoded secret-key check is the single most serious security issue found in this inventory.

### 6.5 Dead/orphaned code
- `aleemanschool/footer.js` (237 lines, an elaborately animated version of the "floating academic-year badge" widget) is **not referenced by any `<script src>` tag in any HTML file** in the repo — it is fully orphaned. The simpler 98-line `floating.js` (present identically, byte-for-byte except one CSS value, in all 5 repos) is the version actually wired up everywhere via `<script src="floating.js">`.
- `academics/index.html` references `<script src="../js/academics.js">`, but `js/academics.js` does not exist anywhere in the `aleemanschool` repo — a guaranteed 404 in production (silently ignored since none of the visible tab-switching functionality actually depends on it; that logic lives in the shared `js/main.js`).
- Multiple marketing-site sections (main contact form, campus-tour booking form, home-page contact form, scholarship-application form, structured job-application form) are fully built out in HTML/CSS/JS but **commented out of the rendered DOM** — functioning but dormant code, not deleted.
- The `og:site_name` meta tag on the homepage (`content="JOYIN"`) and the "JOYIN" branding baked into every `sw.js`/`pwa-install.js` file's comments and offline-fallback page ("You're Offline… JOYIN", a stylized "J" placeholder image) reveal that the PWA/service-worker layer across **all four app-like repos** (both teacher portals, both admin portals) was copied from a generic starter template/boilerplate named "JOYIN" and never rebranded — confirmed byte-identical (`diff` shows zero differences) between the secondary and primary versions of both `sw.js` and `pwa-install.js`.

### 6.6 PWA/offline features actually wired up
Real (not boilerplate-only) offline support exists in the four app portals (both teacher portals, both admin portals) via `sw.js` + `pwa-install.js`:
- Install-prompt handling (`beforeinstallprompt`), standalone-mode detection, and an auto-update flow that polls `registration.update()` every 5 minutes and shows an in-page "New version available" banner when a new service worker is detected.
- Fetch strategy: **network-first** for navigations/scripts/styles (always tries the network, falls back to cache only if offline, and falls back further to a generated offline HTML page for navigations); **cache-first** for images/fonts (serves from cache immediately, falls back to a generated SVG placeholder if both cache and network fail).
- Explicitly bypasses caching for anything hitting `firestore`/`firebase`/`googleapis`/`gstatic.com` — i.e. the offline mode covers the app shell only, not any live data (a student/teacher/admin cannot view or enter results while offline; they can only reopen the last-loaded shell UI).
- The **marketing site (`aleemanschool`) and the student result-checker pages under `portal/` have no service worker / manifest at all** — PWA/offline behavior is exclusive to the 4 app-like repos.

### 6.7 Other security-relevant observations beyond what's already known
- No `firestore.rules` in any repo (confirmed already known; reiterated here because everything above compounds it — every client-side "gate" in this system is advisory only without rules to back it up).
- Firebase Web API keys for all four projects are hardcoded directly in publicly-served JavaScript (expected/normal for Firebase client SDKs, but combined with the missing rules file, this is a materially higher-risk configuration than usual).
- Student "PIN"/password is literally their full Firebase Auth password, and there is no way for a student to self-service reset it (no "forgot password" flow present anywhere); the admin cannot reset it either (admin "Edit Student" explicitly hides the password field and defers to "Firebase Console").
- Deleting a teacher or student **requires knowing that person's current password** (re-authentication pattern) — meaning an admin who has forgotten/never known a teacher's password **cannot delete that account** through the UI at all; there is no admin-privileged force-delete path in these apps.
- The subject-unlock and remark-unlock passwords are shared secrets typed into a plain `<input type="password">` each time (with a visible "eye" toggle), transmitted and stored as plaintext in Firestore — not hashed, not per-teacher, just a single shared string per subject/class that every teacher who needs to enter that class's scores must know.
