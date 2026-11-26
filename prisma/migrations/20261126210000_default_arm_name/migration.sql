-- Task 0133: the hidden default arm (task 0132) is stored under the reserved name "_" instead of "Main", so an ordinary arm can never share its name.
UPDATE "ClassArm" SET "name" = '_' WHERE "isDefault" AND "name" <> '_';
