-- A person may belong to several branches (design change, plan "a person may belong to several branches"). ADDITIVE / LIVE-SAFE: this only
-- swaps one index on the Invitation table, which the live school has never had rows in (it arrived in 20261007090000, unmerged until now).
-- One OPEN invitation per (address, branch) instead of one per address: inviting the same address to the SAME branch again still replaces the
-- earlier link (the application revokes it), inviting it to a DIFFERENT branch leaves the first open.
DROP INDEX "Invitation_one_live_per_address";
CREATE UNIQUE INDEX "Invitation_one_live_per_address_branch" ON "Invitation"(lower("email"), "branchId") WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL;
