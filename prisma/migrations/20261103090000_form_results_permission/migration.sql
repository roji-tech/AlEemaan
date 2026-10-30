-- A fifth extra capability for staff: CAN_VIEW_FORM_RESULTS. Non-teaching staff keep the question bank, the list of forms, the print log and the reports, but read no form results,
-- answers or turn-ins unless an administrator gives them this. It opens the READ side of the forms module only (results, answers, turn-ins, marking queues, analytics) and only for
-- the forms of the holder's own branch; editing, closing, marking, recording turn-ins and printing, and the answer key, stay with the form's creator and the administrators.
-- (The same capability, with the same name, exists in Octalve Edu.)
--
-- Run it BEFORE the code that names the value is deployed (the additive-migration rule of this repository). It adds one enum value and nothing else: no row is changed, nobody holds the
-- value until an administrator gives it, and the release before it keeps working (it never reads the new value; give nobody the capability until the new release is out).

-- AlterEnum
ALTER TYPE "Permission" ADD VALUE 'CAN_VIEW_FORM_RESULTS';
