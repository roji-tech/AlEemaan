-- CreateEnum
CREATE TYPE "AnnouncementStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable: TimetableSlot
CREATE TABLE "TimetableSlot" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "classArmId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "staffRecordId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "periodNumber" INTEGER,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "room" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimetableSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Announcement
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "branchId" TEXT,
    "classArmId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "targetRoles" "Role"[] DEFAULT ARRAY[]::"Role"[],
    "status" "AnnouncementStatus" NOT NULL DEFAULT 'PUBLISHED',
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "authorUserId" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TimetableSlot_branchId_id_key" ON "TimetableSlot"("branchId", "id");

-- CreateIndex
CREATE INDEX "TimetableSlot_branchId_classArmId_idx" ON "TimetableSlot"("branchId", "classArmId");

-- CreateIndex
CREATE INDEX "TimetableSlot_branchId_staffRecordId_idx" ON "TimetableSlot"("branchId", "staffRecordId");

-- CreateIndex
CREATE INDEX "TimetableSlot_branchId_dayOfWeek_idx" ON "TimetableSlot"("branchId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "Announcement_status_idx" ON "Announcement"("status");

-- CreateIndex
CREATE INDEX "Announcement_branchId_idx" ON "Announcement"("branchId");

-- CreateIndex
CREATE INDEX "Announcement_classArmId_idx" ON "Announcement"("classArmId");

-- CreateIndex
CREATE INDEX "Announcement_publishedAt_idx" ON "Announcement"("publishedAt");

-- AddForeignKey: TimetableSlot -> Branch
ALTER TABLE "TimetableSlot" ADD CONSTRAINT "TimetableSlot_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: TimetableSlot -> ClassArm
ALTER TABLE "TimetableSlot" ADD CONSTRAINT "TimetableSlot_branchId_classArmId_fkey" FOREIGN KEY ("branchId", "classArmId") REFERENCES "ClassArm"("branchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: TimetableSlot -> Subject
ALTER TABLE "TimetableSlot" ADD CONSTRAINT "TimetableSlot_branchId_subjectId_fkey" FOREIGN KEY ("branchId", "subjectId") REFERENCES "Subject"("branchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: TimetableSlot -> StaffRecord
ALTER TABLE "TimetableSlot" ADD CONSTRAINT "TimetableSlot_branchId_staffRecordId_fkey" FOREIGN KEY ("branchId", "staffRecordId") REFERENCES "StaffRecord"("branchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: Announcement -> Branch
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: Announcement -> ClassArm
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_classArmId_fkey" FOREIGN KEY ("classArmId") REFERENCES "ClassArm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: Announcement -> User
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
