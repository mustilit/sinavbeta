-- Tünel/Yazılı soru hata bildirimlerine eğitici izahı + admin notu (nullable, additive)
ALTER TABLE "tunnel_question_reports"
  ADD COLUMN "educatorAnswer" TEXT,
  ADD COLUMN "educatorAnsweredAt" TIMESTAMP(3),
  ADD COLUMN "adminNote" TEXT,
  ADD COLUMN "adminNotedAt" TIMESTAMP(3),
  ADD COLUMN "adminNotedById" TEXT;

ALTER TABLE "written_question_reports"
  ADD COLUMN "educatorAnswer" TEXT,
  ADD COLUMN "educatorAnsweredAt" TIMESTAMP(3),
  ADD COLUMN "adminNote" TEXT,
  ADD COLUMN "adminNotedAt" TIMESTAMP(3),
  ADD COLUMN "adminNotedById" TEXT;
