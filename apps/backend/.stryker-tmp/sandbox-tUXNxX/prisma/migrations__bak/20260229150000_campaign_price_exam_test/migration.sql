-- FR-E-04: Süreli kampanya - test başına kampanya fiyatı ve geçerlilik süresi
ALTER TABLE "exam_tests" ADD COLUMN IF NOT EXISTS "campaignPriceCents" INTEGER;
ALTER TABLE "exam_tests" ADD COLUMN IF NOT EXISTS "campaignValidFrom" TIMESTAMP(3);
ALTER TABLE "exam_tests" ADD COLUMN IF NOT EXISTS "campaignValidUntil" TIMESTAMP(3);
