# 0094: The pupil and guardian sign-in (admission number + secret) on parent. and student. /login, under the per-branch switch, and hardened

- **Period / Focus:** 2026-11-18 (the maintainer: "shouldn't we port the actual logins we intend for parents and students to parent.aleemanschool.com/login and student.aleemanschool.com/login, and don't forget the admin control on them, and we have to think of a way to make it secure"; earlier: "are they secure? are they same with ... parent./student. /login")
- **Status:** Designed; the maintainer decided D1 to D8 below on 2026-11-18; phase 1 not started (it extends task 0091)
- **Priority:** High
- **Assignee:** Claude
- **Target Branch / PR:** to be opened after task 0091 / PR into `dev`
- **Started:** 2026-11-18

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

A guardian and a pupil sign in where the school expects them to: `parent.<school>/login` and `student.<school>/login`, with what the school actually has (an admission number and a secret, or the link it sent), not an email account they never created. An administrator controls it per branch, and it is as hard to guess into as we can make it without an SMS bill.

## 2. What exists (read from the code, 2026-11-18)

- **`/portal`** (the school's own host, open): admission number + one secret (the pupil's date of birth, the guardian's phone, or the guardian's e-mail) or a link token. No account, no password. One generic failure for every wrong try (no account is confirmed). Limits per 5 minutes: 30 per client, 5 per client and pupil, 10 per pupil from anywhere. A signed, HttpOnly, SameSite=Lax cookie (`__Host-` on https), 7 days, **stateless: it cannot be revoked**.
- **Weak points** (open-items 1b, ISS-0022, ISS-0023): the phone secret also matches on its **last 4 or more digits** (10,000 possibilities: one pupil in about 3.5 days at the current ceiling, and the same ceiling can lock a family out); a date of birth is known to classmates and relatives (about 5,500 plausible dates); admission numbers are sequential; no revocation.
- **`parent.` and `student.` `/login`**: the e-mail and password sign-in of the accounts that hold a STUDENT or PARENT membership. A different system (strong: hashed password, lockout, MFA, revocable sessions), with no accounts yet.
- The **per-branch switch of task 0091** covers those accounts only; the portal above is outside it.

## 3. Decisions

- **D1. The portal sign-in is what `parent.` and `student.` `/login` show.** The e-mail account sign-in stays reachable from a small link under the form ("I have an account with an e-mail address"), because administrators may still invite such accounts.
- **D2. The host decides who is signing in.** On `student.`: admission number + the pupil's date of birth (actor PUPIL). On `parent.`: the guardian's full phone number or e-mail, or the link (actor GUARDIAN). A secret meant for the other host is the same generic failure as a wrong one, so each host has half the guessing surface and the actor is no longer inferred from which secret matched.
- **D3. The phone secret is the whole number** (national digits compared, so 0801... and +234801... both work). The "last 4 or more digits" match is removed: it is the weakest part of the whole sign-in.
- **D4. The switch applies to this sign-in, by the pupil's branch.** A pupil's branch is known once the admission number is read, so there is no "which branch is this page for" problem. Student sign-in is open for a pupil whose branch has `studentLoginEnabled`; guardian sign-in for a branch with `parentLoginEnabled`; a guardian of children in several branches reaches only those in open branches. Default OFF. Who may change it: an administrator for their own branches, a superadmin for any, several or all (task 0091). A refusal before the secret is checked is the same generic failure; once the secret is right, the closed state is said plainly ("sign-in for your school is closed at the moment"), which leaks nothing an attacker does not already have.
- **D5. Turning a branch off signs its pupils and guardians out**: the session check on every request reads the switch (cached for seconds, as in 0091), not just the sign-in.
- **D6. Failures leave a trail**: the number of failed and refused attempts per pupil and per client is audited (not the secrets), so an administrator can see a pupil being hammered.
- **D7. Phase 2 (the strong part)**: a school-issued **access code** per pupil (8 characters from an alphabet without look-alikes, about 40 bits, random, stored hashed, shown once to the administrator to print or send, reset on request); the sign-in becomes admission number + access code, and date of birth and phone become a per-branch fallback ("allow date of birth / phone sign-in", off once codes are out). A challenge (Cloudflare Turnstile) after three failures, a short idle timeout (12 hours), and server-side revocation (a version on the pupil's record, so a reset or a switch-off ends every open session at once). One-time codes by e-mail or SMS are a later option: they need a provider the school pays for.

### 3a. The maintainer's answers (2026-11-18) and what they add

- **One door, yes.** A guardian signs in at `parent.<school domain>/login` and a pupil at `student.<school domain>/login` (for this school `parent.aleemanschool.com/login`, `student.aleemanschool.com/login`). Each shows the admission-number form families can use; the e-mail and password form is a small link under it. (They asked whether this meant those two addresses: it does.)
- **Delete the `/portal` door, keep the workspace, yes.** `/portal` has no sign-in form any more. Opened without a session it redirects to the `/login` of the address it was opened on (on the school's own address, to `/select-role`), so old bookmarks and the website's "Portal" link keep working. After signing in on `parent.` or `student.` the family lands in the workspace at `/portal` on that same address; the session cookie is per address, so a sign-in on one is not a sign-in on the other. The hand-pasted "link token" tab goes with the form (nothing in the app sends such a link: the generator has no caller outside a unit test, and the address it builds, `/portal/guardian`, has no page).
- **D8. The branch switch governs this one door**, as D4 and D5 say; with `/portal`'s own form gone there is nothing outside it. Default OFF, so a branch's families cannot sign in until an administrator (their branch) or a superadmin (any, several or all) switches it on.
- **Printed slips first, access codes right after phase 1, yes.**
- **A forgotten code is regenerated by the school, from the admin screens** (the maintainer: "if a parent forgot the passcode, the admin or superadmin will have to regenerate it on their dashboard and give or send it to them, so we have to add this to the admin dashboard"). In phase 2, on the Students screen: the pupil's row has "Access code" (administrator of the pupil's branch, or a superadmin; not a teacher): it shows whether a code has been issued and when, and **Regenerate** makes a new one, shown once with Print and Copy (and later "Send to guardian" by e-mail or WhatsApp link). Regenerating makes the old code stop working at once and ends the family's open sessions (the version on the pupil's record), is rate-limited, and is audited (who, which pupil, when; never the code). A class sheet ("Print access codes for this class") makes the whole class's slips in one go; that also regenerates, so it asks first and says how many codes it replaces. A pupil in a branch whose switch is off still shows "Access code", with a note that the branch is closed.
- **D9. Two codes per pupil: a pupil code and a guardian code** (the maintainer: "so how do students log in? do they receive passcodes too?"). Until the codes exist, a pupil signs in at `student.` with the admission number and the date of birth, and a guardian at `parent.` with the admission number and the phone number or e-mail. When codes come (phase 2): the pupil signs in at `student.` with the admission number and the **pupil code**, a guardian at `parent.` with the admission number and the **guardian code**. They are separate because the two do different things in the workspace (what a pupil may see of fees and results is a per-branch setting, task 0040): one shared code would let a child who finds the slip open the guardian's view. The slip has two halves, one for the pupil and one for the family, so the school can hand each to its own person; the Students screen's "Access code" dialog shows both and regenerates each on its own ("Regenerate pupil code", "Regenerate guardian code"). A branch that does not want pupils signing in (nursery, early primary) leaves its student switch off and the pupil code is simply never used. A guardian with several children uses the admission number of one child and that child's guardian code; the family's other children are still linked by the shared phone or e-mail until explicit guardian links replace that guess (ISS-0022).
- **Database-backed rate limiter**, in phase 1: a small table (key, window start, count) with one atomic update per attempt, so the limit holds across Vercel instances; the staff sign-in and every other caller of `reserveAttempt` use it. The migration is the maintainer's to run.

## 4. Not in this task

The walkthrough; the staff and administrator sign-ins; any change to the result portal's pages after sign-in.

## 5. Tests (to write with the code)

Unit: the host-to-actor rule, the phone matcher without the suffix, the switch rule by branch. API: each host accepts only its own secrets; a closed branch is the generic failure before the secret and the plain notice after it; siblings in closed branches are left out; a switch-off ends an open session; the rate limits; the audit rows. Browser: both login pages at 360 and 1280 px, axe, the closed notice.

## 6. Build record and tests

(filled in with the real counts when the suites have run)
