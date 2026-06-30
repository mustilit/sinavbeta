-- Backfill: E-Sınıf (SCHOOL kaynaklı) aday notlarında ders snapshot'ı (topicName).
--
-- f0bdbde öncesi oluşturulan SCHOOL notlarında "Ders" snapshot'ı (candidate_notes."topicName")
-- doldurulmuyordu; bu yüzden Notlarım "Ders" filtresi facet'i boş kalıyor ve alan görünmüyordu.
-- Her SCHOOL notunda contextId = school_exams.id set edilir (soru-bağlı notta da q.examId'ye düşer),
-- bu yüzden ders güvenle school_exams.subject'ten türetilebilir.
--
-- Idempotent: yalnızca topicName boş olanları doldurur. Birden çok kez çalıştırılabilir.
--
-- Çalıştırma (staging = lokal):
--   docker exec -i docker-postgres-1 psql -U postgres -d sinavsalonu_v2 \
--     < apps/backend/scripts/backfill-school-note-subjects.sql

UPDATE candidate_notes cn
SET "topicName" = se.subject
FROM school_exams se
WHERE cn."contextId" = se.id
  AND cn.source = 'SCHOOL'
  AND (cn."topicName" IS NULL OR cn."topicName" = '')
  AND se.subject IS NOT NULL
  AND se.subject <> '';
