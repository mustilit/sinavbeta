-- Backfill: Yayınlanmış test paketlerine bağlı ExamTest kayıtlarına publishedAt ve
-- status = 'PUBLISHED' yaz. publish() artık her iki alanı da güncelliyor; bu migration
-- geçmişte yayınlanmış paketlerdeki ExamTest'lerin tutarsız durumunu düzeltir.
UPDATE exam_tests et
SET "publishedAt" = tp."publishedAt",
    status = 'PUBLISHED'
FROM test_packages tp
WHERE et."packageId" = tp.id
  AND tp."publishedAt" IS NOT NULL
  AND et."deletedAt" IS NULL
  AND (et."publishedAt" IS NULL OR et.status != 'PUBLISHED');
