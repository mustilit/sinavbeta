-- E-Sınıf: Zümre kapsamı — Department.branchId (şube geneli) + levelId (seviyeye özel). Additive.
ALTER TABLE "departments" ADD COLUMN "branchId" TEXT;
ALTER TABLE "departments" ADD COLUMN "levelId" TEXT;
CREATE INDEX "departments_branchId_idx" ON "departments"("branchId");
CREATE INDEX "departments_levelId_idx" ON "departments"("levelId");
ALTER TABLE "departments" ADD CONSTRAINT "departments_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "departments" ADD CONSTRAINT "departments_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "school_levels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
