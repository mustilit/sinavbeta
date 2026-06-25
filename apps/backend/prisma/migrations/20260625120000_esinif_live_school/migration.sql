-- E-Sınıf Sprint 4-B — canlı sınav okul entegrasyonu (additive).
ALTER TABLE "live_sessions" ADD COLUMN "schoolId" TEXT;
CREATE INDEX "live_sessions_schoolId_idx" ON "live_sessions"("schoolId");
