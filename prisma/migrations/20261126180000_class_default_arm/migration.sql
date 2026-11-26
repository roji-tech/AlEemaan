-- Task 0132: a class can be used without arms. The arm it then gets is flagged, so the Classes tab can leave it out of the arm list.

-- AlterTable
ALTER TABLE "ClassArm" ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false;

-- At most one live default arm per class.
CREATE UNIQUE INDEX "ClassArm_one_live_default_key" ON "ClassArm" ("classGroupId") WHERE "isDefault" AND "archivedAt" IS NULL;
