-- Sınav türü/konu seçilmemiş testlere sistem "Diğer" fallback'i atar.
-- "Diğer" sınav türü + konu oluşturur (idempotent), birbirine bağlar, mevcut
-- null examTypeId/topicId değerlerini backfill eder. Fresh install'da da çalışır.

-- "Diğer" sınav türü (slug unique → çakışırsa mevcut korunur)
INSERT INTO "exam_types" ("id", "name", "slug", "active", "createdAt", "updatedAt")
VALUES ('11111111-1111-4111-8111-111111111111', 'Diğer', 'diger', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;

-- "Diğer" konu (topics.slug unique DEĞİL → NOT EXISTS guard)
INSERT INTO "topics" ("id", "name", "slug", "active", "createdAt")
SELECT '22222222-2222-4222-8222-222222222222', 'Diğer', 'diger', true, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "topics" WHERE "slug" = 'diger');

-- Konu ↔ sınav türü bağlantısı (idempotent)
INSERT INTO "topic_exam_types" ("topicId", "examTypeId")
SELECT t."id", e."id"
FROM "topics" t, "exam_types" e
WHERE t."slug" = 'diger' AND e."slug" = 'diger'
ON CONFLICT ("topicId", "examTypeId") DO NOTHING;

-- Mevcut: sınav türü boş testlere "Diğer" ata
UPDATE "exam_tests"
SET "examTypeId" = (SELECT "id" FROM "exam_types" WHERE "slug" = 'diger' LIMIT 1)
WHERE "examTypeId" IS NULL;

-- Mevcut: konu boş testlere "Diğer" ata
UPDATE "exam_tests"
SET "topicId" = (SELECT "id" FROM "topics" WHERE "slug" = 'diger' LIMIT 1)
WHERE "topicId" IS NULL;
