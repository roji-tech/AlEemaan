-- Task 0115 (task 0101 D4): school details per branch. Additive: one new table, nothing existing is changed.
CREATE TABLE "BranchProfile" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "principal" TEXT,
    "phone" TEXT,
    "motto" TEXT,
    "address" TEXT,
    "email" TEXT,
    "website" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BranchProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BranchProfile_branchId_key" ON "BranchProfile"("branchId");

ALTER TABLE "BranchProfile" ADD CONSTRAINT "BranchProfile_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
