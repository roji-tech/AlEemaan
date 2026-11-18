-- Student and parent sign-in switches, PER BRANCH (task 0091; the maintainer, 2026-11-18: "we want superadmin/admin to be able to turn on/off student and parent login, it will be off by
-- default", then "admin can only switch on login for the student/parent in his branch or branches; superadmin can switch it for all or some branches").
-- Two switches on each Branch row, both OFF for every existing and every new branch. Adding a column with a constant default is safe on a live table.
-- ORDER: the production workflow runs from the `prod` ref, so the order is: merge to prod, THEN run the migrate-production workflow, straight after the deploy. Until it has run, the new code
-- cannot read these columns, and every sign-in and every request of a signed-in person fails (the session check selects them): do not leave a gap between the two.
-- Once the new code is released and this has run, no student or parent can sign in, and a signed-in one is signed out on the next request, until an administrator of their branch (or a
-- superadmin) turns the switch on in Settings (Sign-in access) or on the Users page.
ALTER TABLE public."Branch" ADD COLUMN "studentLoginEnabled" boolean NOT NULL DEFAULT false;
ALTER TABLE public."Branch" ADD COLUMN "parentLoginEnabled" boolean NOT NULL DEFAULT false;
