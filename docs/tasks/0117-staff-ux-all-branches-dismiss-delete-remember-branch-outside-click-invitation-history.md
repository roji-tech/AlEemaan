# 0117: Staff and navigation fixes: all-branches staff view, dismiss "not on the staff list yet", superadmin delete of a staff record, the chosen branch is remembered, outside click closes popups, history of invitations

- **Period / Focus:** 2026-11-20 (the maintainer: "I wanna be able to select all branches to view all staff"; "I wanna be able to close the add to staff message completely or pend it for later"; "I mistakenly added the main superadmin to staff, how can I remove the superadmin (maybe you should have the option to delete staff record for superadmins only, what do you think)"; "can we retain selections, for example the branch I selected now, if I go to another page and come back, it resets to the first item"; "add a useoutsideclick or similar to most popups and dropdowns"; "can we keep the record of revoked invites, maybe in audit log")
- **Status:** Built; the API and browser specs are written and not yet run (see section 6)
- **Priority:** High
- **Assignee:** Claude
- **Target Branch / PR:** `claude/staff-ux` / to be opened into `dev`
- **Started:** 2026-11-20

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. What exists (read from the code, 2026-11-20)

- Every list page keeps its branch in `useState(branches[0].id)`: leaving the page and coming back starts again on the first branch. About twenty panels do this; the Students, Staff and Academics panels also take an `initialBranchId` from a link.
- `GET /api/v1/staff` needs one `branchId` and is wrapped in `withBranch`.
- "Signs in here, not on the staff list yet" (task 0112 D9) cannot be closed.
- A staff record can be archived and restored, never deleted. Nothing removes a record made by mistake.
- `usePopover` (the three-dots menu, the branch picker) closes on an outside press, on focus leaving and on Escape. Other floating panels each do it their own way, or not at all.
- Revoking an invitation by hand writes `INVITATION_REVOKED` with the address only. There is no screen that lists revoked or accepted invitations: the Pending invitations tab shows open ones only. (There is no audit log screen in the app: the `AuditLog` table is read by queries.)

## 2. Decisions

### D1. All branches
- The branch picker of Academics > Staff and Users > Staff gets "All branches" for a person who may read two or more branches (a superadmin sees every branch).
- `GET /api/v1/staff?branchId=all` answers the staff of the branches the caller holds a STAFF role in (`branchIdsFor`: every branch for a superadmin), never more. One query; at most 1000 records, with `truncated: true` when there are more ("Showing the first 1000").
- Each card names its branch. Search, filters and export work across branches.
- Write actions use the record's own branch: standing (suspend, terminate, reinstate), History, Archive/Restore and Delete work from the All view because they need only the record. What needs a branch's classes, subjects or the branch itself (Manage, Edit, Invite, Transfer, New record, Add many) is one button, "Open in <branch>", which switches the picker to that branch with the person's name in the search box. "New staff record", "Add many" and the invite selection are not offered in the All view: the page says "Choose a branch to add staff."
- "Signs in here, not on the staff list yet" is per branch; in the All view it is not shown.

### D2. Dismiss and snooze
- There is no per-user preference table, so this is kept in the browser (`localStorage`, every read and write in try/catch; a browser that refuses it just shows the panel). Per branch:
  - **Close (x):** hides the panel until a person it did not list before appears (the set of hidden ids is stored; a new id reopens it).
  - **Remind me later:** hides it for 7 days.
  - **Don't list** (per person): hides that person from the panel for good; "Show hidden (N)" brings them back. This is for an administrator or a superadmin who should not be on the list.
- The staff toolbar shows "N not on the list" (a chip) whenever the panel is hidden and there is somebody to add; it reopens the panel. Add to staff itself is never removed.

### D3. Delete a staff record (superadmin only)
- "Delete record" in the card's Actions list, for a superadmin only, with the person's name typed to confirm. `DELETE /api/v1/staff/[id]`: `withBranch` administer, then a superadmin check (an administrator of the branch gets 403).
- It deletes ONLY a record with no history. It is refused with 409 and the reasons when the record has teaching assignments, is an arm's class teacher (current or archived arms), has attendance grants or timetable slots, takes part in a program, or authored coursework (assignments, materials, quizzes, graded hand-ins); the answer says Archive is the way for those. A record that IS linked to an account can be deleted: the link goes with it, the account and its membership stay. An invitation sent from it stays, no longer tied to a record.
- The account and the membership are never touched. Audited `STAFF_DELETED` with the record's identifying fields (name, kind, e-mail, phone, branch, the account link that existed).
- This is the single, explicit, superadmin-only exception to "nothing here is ever deleted"; it is recorded as such in the pages and functions docs.

### D4. The branch is remembered
- One hook, `useBranchSelection(branches, { initial, allowAll, fallback })`, returns the same pair as `useState`. Precedence: what the person chose on this page; the address (`?branch=`); `initial` (a link's branch); what this browser last used; the fallback (the first branch). An id the person does not have is skipped at every step. Choosing a branch rewrites the address in place (`history.replaceState`, as `?tab=` does) and stores it in the browser.
- "All branches" is the reserved value `all`, honoured only where the page offers it, kept in the address, and never stored as the remembered branch (other pages cannot show it).
- The stored value is read with `useSyncExternalStore`, so the first paint equals the server's and the remembered branch is applied right after.
- Adopted by the panels that use `BranchPicker` and the page-level branch states of Academics, Students, Finance, Communication, LMS, Timetable and the Approvals requests.

### D5. Outside click
- One hook, `useOutsideClick(ref, onOutside, enabled)` (pointer and touch, ignores the element and its trigger). `usePopover` uses it. Audited every floating panel in `src`; see the record.

### D6. History of invitations
- Manual revoke audit rows now carry the address, the role and the branch. `GET /api/v1/invitations/history` lists invitations that are not open: accepted, revoked and expired, with who revoked (read from the audit rows) and when, scoped like the open list (a branch administrator: their branches, never ADMIN invitations). The Pending invitations tab gets "Show history".

## 3. Migration

None.

## 4. Work

- [x] D4: `components/ui/branch-selection.ts` (pure), `useBranchSelection.ts`; adopted in the Students, Academics, Staff, Finance, Communication, Learning, Timetable, Attendance, Grading and Approvals requests panels. Left as they were: the Results sections, the Settings panels and the Forms and Question bank panels, which choose a branch in their own way (a select, or an administrator-only list); they are the next to move.
- [x] D5: `useOutsideClick.ts` (used by `usePopover` and the account menu); `Dialog` closes on its backdrop when it has nothing to type into.
- [x] D1: `listStaffAcross`, `GET /api/v1/staff?branchId=all`, `branchName` on every staff view, `BranchPicker allOption`, the All view in `StaffPanel`.
- [x] D2: `unlisted-hidden.ts` (pure), `UnlistedMembers` (close, remind me later, don't list, the chip).
- [x] D3: `lib/academics/staff-delete.ts`, `DELETE /api/v1/staff/[id]`, `StaffDelete.tsx`, the menu item for a superadmin.
- [x] D6: `listInvitationHistory`, `GET /api/v1/invitations/history`, the revoke audit rows enriched, `InvitationHistory.tsx` and the toggle.
- [x] Tests written (section 5); not yet run.

## 5. Tests

Unit (`tests/unit/staff-ux.spec.ts`, 15, run alone: all pass): the branch precedence, `all` and invalid ids; close, snooze, don't list and the stored value; the delete blockers; the history sentences. API (`tests/api/staff-ux.spec.ts`): `branchId=all` (a superadmin gets every branch, a branch administrator and a teacher only their own, a parent and a stranger none, search and the archived filter); `DELETE /staff/[id]` (a superadmin, audit, the account stays, who may, a record with history is 409); the history (manual revoke audit fields, who revoked and why, accepted and run-out, replaced, scope, who may). Browser (`tests/e2e/staff-ux.spec.ts`, desktop and phone, axe): the All view, the panel's close, snooze and don't list across a reload, the delete with its typed name and a refusal, a branch administrator not offered Delete, the branch kept across pages, a dropdown and a read-only dialog closing on an outside press while a form does not, the invitation history.

## 6. Build record

- Gates: `tsc` clean; eslint 0 errors; prettier clean on the changed files; no schema change, no migration.
- The whole unit project on a server-less configuration with an unreachable database: 1467 passed, 7 failed before the fix below. Two were the route guard (the staff list's `GET` named a branch without `withBranch` in its own text: fixed by putting the `withBranch` inside the handler); five need a database (three `rate-limit` store tests, `communication-gateways:183`, `communication-templates:23`) and failed only on the deliberately unreachable one.
- Not run: the API and browser specs.
- Decisions beyond the brief: the All view hides Export (an export names one branch); a record that is linked to an account can be deleted (the link goes with it); `STAFF_DELETED` stores the record's identifying fields; the history includes accepted and run-out invitations as well as revoked ones; there is no audit log screen in the app, so "kept in the audit log" is the `AuditLog` table plus the history list; the remembered branch is per browser, not per user (an id the person does not have is ignored, so another account on the same browser is not affected).
