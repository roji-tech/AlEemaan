# 0125: set New or Returning for many pupils at once

- **Status:** In Progress: built; tests running.

Asked 2026-11-20 by the maintainer: "how do I make multiple students returning students at the same time?" Task 0122 told them to mark the pupils already at the school as Returning, one by one in Fee lines, or through the "Admission status" column of the pupil file. The file column only applies when a pupil is created (re-importing a pupil is refused as a duplicate), so for pupils already in the app there was only the one-by-one way. That instruction was incomplete and this task fixes it.

## Decisions
1. One action, Students > Add many's neighbour "Admission status": choose New, Returning or "Work it out" (clears the setting), the class (all classes or one), and whether to touch only pupils with no setting yet (default on, so a pupil already set by hand is never overwritten by accident).
2. Which pupils: in the branch, not archived, not a draft, with an ACTIVE enrolment (in the chosen class when one is chosen). Pupils whose setting already equals the choice are not counted as changed.
3. A preview first: the dialog says how many pupils are in scope and how many will change, before the button that does it. The server does the same count for a dry run and again inside the save.
4. One audit entry per run (action, branch, choice, class, how many, and each pupil's earlier setting so it can be undone by hand), not one per pupil.
5. An administrator of the branch only (as the single-pupil setting is). A class from another branch is 404.
6. Order of use for the school: mark everybody Returning, then open the few genuinely new pupils (Fee lines) and set them to New; or do it class by class.

## Icons on the rest of the row menus
The maintainer (same day, with screenshots of the pupil and staff menus): "add icons to the rest of the items". `action-look.tsx` matches an action's id to an icon and tone; pupils' Guardians, Scholarships, Fee lines and Access codes and the staff menu's Make superadmin had none, and so did Duplicate, Detach, Make the default, Result template, Place in a branch, Open, Reject, Send and Resend. All now have one, from the one shared rule list (so every menu in the app gets them); two icons are new, a key and a broken link. A unit spec pins each id to its icon.

## Not in scope
Undo button (the audit entry holds the earlier values); invoices already made are never changed by this (it affects invoices still to be generated).
