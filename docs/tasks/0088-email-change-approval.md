# 0088: A change of email address needs approval (a member's by an administrator, an administrator's by a superadmin)

- **Period / Focus:** 2026-11-18 (the maintainer: "email change should need approval: a member's by an admin/superadmin, an admin's by a superadmin")
- **Status:** Built; the record is section 6
- **Priority:** High (the address is the recovery channel of an account)
- **Assignee:** Claude
- **Target Branch / PR:** `claude/email-change-approval` (stacked on `claude/portals-subdomains`) / PR into `dev`
- **Started:** 2026-11-18

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

Until now anyone signed in could change the address on their account with only their password and a link to the new address. The address decides where password-reset links go, so a stolen session plus a known password was enough to take an account over. Now the change waits for a person with authority over the account.

## 2. Decisions

- **D1. Who decides.** A superadmin's change needs nobody (there is no one above them): the link goes to the new address at once, as before. An administrator's change (an active ADMIN membership somewhere) needs a **superadmin**. Everyone else's (teaching and non-teaching staff, pupils, parents) needs an **administrator of a branch the person belongs to**, or a superadmin. Nobody decides their own request, a superadmin included.
- **D2. The link is sent only after approval.** The old flow mailed the link to the new address straight away. Now a request creates a row (`EmailChangeRequest`, status PENDING) and mails only the OLD address ("an administrator has to approve it first"). Approving issues the link in the same transaction that claims the request and mails it to the NEW address; the old address is told again. Denying changes nothing and tells the old address, without naming the new one.
- **D3. The password is still asked** when the request is made, and the limits (5 wrong passwords, 3 verified requests per account per window) are unchanged. The per-address mail limit does not apply to a waiting request, because nothing is mailed to that address until an administrator approves.
- **D4. Nothing reveals who has an account.** The person asking gets the same answer for a free and a taken address. The only difference in the body (`needsApproval: true`) depends on who is asking, never on the address. If the address has been taken by the time an administrator approves, no link is issued, the address gets the same "someone tried to use your address" notice as before, and the administrator is answered exactly as for a normal approval.
- **D5. A request that is not yours to decide is a 404**, the same one as for an id that does not exist or a request already decided (an administrator of another branch cannot tell that a request exists). A caller with no administrator role at all is refused at the gate (403).
- **D6. Two administrators at once**: the request is claimed by a conditional update (`status = PENDING`), so exactly one wins; the other gets the 404. One link exists.
- **D7. The level can only rise** between asking and deciding: the decision route works out the person's level again and uses the higher of the stored and the current one (someone promoted to administrator in between now needs a superadmin).
- **D8. One open request per person**: asking again replaces the waiting one. The person sees it on the Account page ("Waiting for approval", with Cancel this request) and can withdraw it (`DELETE /api/v1/auth/email-change/request`).
- **D9. Where administrators decide**: a new **Email changes** tab on Approvals, with the number waiting on the tab. The list is narrowed on the server to the requests that administrator may decide.
- **D10. Requests already mailed a link before this change keep working** (`EmailChangeToken` is untouched); the migration is additive.

## 3. Not in this task

Mailing administrators when a request arrives (they see the count on Approvals; mail is a later, separate decision); changing an account's address by an administrator on someone's behalf (the Users page); approval of a name change.

## 4. Files

Schema and migration: `prisma/schema/auth.prisma` (`EmailChangeStatus`, `EmailChangeRequest`), `prisma/migrations/20261118120000_email_change_approval/`. Rules and service: `src/lib/auth/email-change-approval.ts` (`requiredLevelFor`, `mayApprove`, `effectiveLevel`, `createPendingRequest`, `pendingFor`, `decideRequest`, `cancelOwnRequest`, `openRequestFor`), `src/lib/auth/email-change.ts` (`issueEmailChangeToken` for use inside a transaction). Routes: `src/app/api/v1/auth/email-change/request/route.ts` (pending path and DELETE), `src/app/api/v1/email-change-requests/route.ts` and `[id]/route.ts`. Mail: `emailChangeAwaitingApprovalNotice`, `emailChangeDeniedNotice` in `src/lib/email/messages.ts`. Screens: `src/components/auth/ChangeEmailPanel.tsx`, `src/components/approvals/EmailChangesPanel.tsx`, `ApprovalsSections.tsx`, `src/app/(app)/account/page.tsx`, `src/app/(app)/approvals/page.tsx`.

## 5. Tests

`tests/unit/email-change-approval.spec.ts` (who may decide, the level rule), `tests/api/email-change-approval.spec.ts` (who waits, the list per role and branch, approve, deny, wrong decider, two at once, taken meanwhile, bad input), `tests/e2e/email-change-approval.spec.ts` (the whole journey in a browser, withdraw, deny, a superadmin's direct path). The existing direct-path tests (`tests/api/account-self-service.spec.ts`, `tests/e2e/account-self-service.spec.ts`) now sign in as a superadmin, the one person whose change needs no approval; `tests/unit/route-role-guard.spec.ts` lists the new DELETE.

## 6. Build record and tests

(filled in with the real counts when the suites have run)
