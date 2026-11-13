# 0056: The info icon's invisible touch area covered the controls beside it

- **Period / Focus:** 2026-11-12 (looked at because of a failing phone run of Octalve's Broadcast Composer, task 0056 there, which uses the same component; that run's failure turned out to have another cause, see section 2)
- **Status:** Done
- **Priority:** Medium
- **Assignee:** Claude
- **Target Branch / PR:** `claude/infotip-hit-area` / PR into `dev`
- **Started:** 2026-11-12

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

An info icon must never take a tap that was meant for another control. The icon is 16 px; its touch target was made 44 px by an invisible pseudo-element (`after:-inset-3.5`, 14 px beyond the icon on every side). Anything placed less than 14 px from the icon had its edge under that area, and the icon is drawn above it.

## 2. Context

- **What I got wrong first.** Octalve's phone run of its composer failed with `getByRole("button", { name: "+ {{class_arm}}" }).click()` refused 57 times ("the info button intercepts pointer events"), and I took the 44 px area to be the cause and wrote that down here and in task 0054. **It was not the cause.** Shrinking the area to 24 px did not change that failure, which a debug run in Octalve then explained: the Communication page there was 16 px wider than a phone's screen (three tabs that did not fit), so Chrome's visual viewport sat out of step with the coordinates Playwright clicks. That is Octalve's task 0056 (D9). The wrong reading is corrected in 0054's update.
- **What is true, and is shown by this task's spec.** The 44 px area was still too big. It reached 14 px beyond the icon, so it sat on top of any control closer than that. With the old area put back at run time (a throwaway copy of the browser spec, deleted), the new check reports an overlap of 8 px with the neighbouring control in **four places, on desktop and on a phone**: the Attendance date field, the Communication channel select, the Communication status filter and the Students "Show" select. It reports none for the four Academics buttons or for the composer's tag chips (their gap is wider, which is why AlEemaan's own composer test never failed).
- The wrong number was mine: task 0054's D5 said "the 44 px touch target the rest of the app uses", which is right for a button of its own and wrong for an icon that sits next to other controls.
- The same component is in Octalve (its PR #127, and the same change in its task 0056).

## 3. Decisions (mine; the maintainer may correct)

- **D1. The touch target is 24 px (`after:-inset-1`)**, not 44. 24 px is WCAG 2.2 AA's minimum target size (2.5.8). Four pixels beyond the icon is the smallest gap on any page here, so the area reaches a neighbour's edge at most and never covers it. The trade-off is a smaller target for a finger; the alternative, keeping 44 px and moving every neighbour 14 px away, would change layouts all over the app for an icon that is meant not to change them.
- **D2. The browser spec proves it for every icon, geometrically.** It reads the pseudo-element's inset from the computed style, grows the icon's box by it (asserting the result is 24 px by 24 px, so a value that failed to parse cannot pass silently), and requires that this area does not overlap the neighbouring control's box by more than half a pixel. **The first version did not do this**: it sampled `document.elementFromPoint` just inside the neighbour's four corners and its top middle. Run against the old 44 px area it flagged only two of the four overlapping places (one sample point on the channel select, four on the status filter) and missed the Date field and the "Show" select, because the icon sits near the left of a wide control and the samples were not under it. A check that cannot fail where the defect is proves nothing, so it was replaced.
- **D3. The spec scrolls the icon to the centre of the window** before it measures, because on a phone "scroll if needed" can leave a control under the fixed bottom bar, which then takes the click (the same reason the old composer test used `force: true`).

## 4. Work breakdown

- [x] Design (this file).
- [x] `InfoTip.tsx`: 24 px; the comment says why. Octalve has the same change in its own PR.
- [x] The browser spec: the geometric overlap check and the centred scroll.
- [x] Docs: the 0054 record (D5 and a corrected update), the component catalogue, the tracker.

## 5. Not in this task

- A touch target of 44 px for the icon (see D1). A second wrong cause for Octalve's failing run is not "fixed" here: it was Octalve's tab strip, fixed there. Mutation passes are deferred to the end of PHASE 2 (the maintainer's call).

## 6. Build record and tests

Filled in from the logs of 2026-11-12 (the AlEemaan test stack on :5434, one run at a time, a production build of this branch).

**Gate:** `tsc --noEmit` exit 0; ESLint on `InfoTip.tsx` and the spec, no findings; `prettier --check` clean on the two sources and the three docs; `pnpm build` compiled and generated all 99 pages (the build the runs used); `verify_catalogs` clean before the commit.

**Run 1 (the first, sampled check): 74 passed, 0 failed, 4 skipped, 3.1 minutes.** Unit `info-tips` 5, e2e `info-tips` 30, `communication-composer-tags` 12, `academics-structure` 10, `students-screen` 8, `attendance-permissions` 8, on desktop and phone (e2e-desktop 35, e2e-mobile 33, unit 5, setup 1). The four skipped are the device-only info-tip tests (a phone has no hover; a desktop has no tap).

**Does the check have teeth? (a throwaway copy of the spec with the old 44 px area injected, deleted afterwards).**
- A first attempt injected a `<style>` tag and the app's Content-Security-Policy refused it (the browser spec's own CSP-violation guard failed the test); a constructable stylesheet, which that policy does not govern, was used instead.
- The sampled check against 44 px: it flagged only 2 of the 4 overlapping places. **Too weak, replaced** (D2).
- The geometric check against 44 px: **overlap of 8 px in four places** (`attendance.window` 44 x 8, `communication.channel` 44 x 8, `students.show` 44 x 8, `communication.status` 8 x 34), the same on desktop and phone; clear for the four Academics keys and for `communication.tags`. The throwaway's own result: 31 passed, 4 skipped.

**Run 2 (the real spec, the geometric check, 24 px): 36 passed, 0 failed, 4 skipped, 1.1 minutes.** Unit `info-tips` 5, e2e `info-tips` 30 (desktop 16, phone 14), setup 1.

**Not run:** the whole suite; the API project; mutation passes (deferred to the end of PHASE 2); a real phone or a real finger (a 24 px target is a smaller target than 44 px: approved by the maintainer on 2026-11-12, D1); Octalve's own run of this check against the old area (the component and the check are the same; it ran there against the new area and passed).

**Found and not mine to fix here:** Octalve's Communication page was 16 px wider than a phone's screen; fixed in Octalve's task 0056.
