-- E-Sınıf dönemsel arşiv: öğrenci / ödev / okul-canlı kayıtlarına dönem (periodId) eklenir.
-- Additive + nullable. Mevcut kayıtlar okulun GÜNCEL dönemine backfill edilir (kaybolmasın).
ALTER TABLE "school_assignments" ADD COLUMN "periodId" TEXT;
ALTER TABLE "school_users" ADD COLUMN "periodId" TEXT;
ALTER TABLE "live_sessions" ADD COLUMN "schoolPeriodId" TEXT;

CREATE INDEX "school_assignments_schoolId_periodId_idx" ON "school_assignments"("schoolId", "periodId");
CREATE INDEX "school_users_schoolId_periodId_idx" ON "school_users"("schoolId", "periodId");
CREATE INDEX "live_sessions_schoolId_schoolPeriodId_idx" ON "live_sessions"("schoolId", "schoolPeriodId");

UPDATE "school_assignments" sa SET "periodId" = s."periodId" FROM "schools" s WHERE sa."schoolId" = s."id";
UPDATE "school_users" su SET "periodId" = s."periodId" FROM "schools" s WHERE su."schoolId" = s."id" AND su."schoolRole" = 'STUDENT';
UPDATE "live_sessions" ls SET "schoolPeriodId" = s."periodId" FROM "schools" s WHERE ls."schoolId" = s."id";
