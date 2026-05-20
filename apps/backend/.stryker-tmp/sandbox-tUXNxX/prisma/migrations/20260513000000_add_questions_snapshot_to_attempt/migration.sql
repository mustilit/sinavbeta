-- attempt başlangıcındaki soru versiyonunu saklayan snapshot alanı
ALTER TABLE "test_attempts" ADD COLUMN "questionsSnapshot" JSONB;
