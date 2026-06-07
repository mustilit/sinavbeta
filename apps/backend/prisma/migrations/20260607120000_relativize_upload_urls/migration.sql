-- Mutlak upload URL'lerini GÖRECELİ yola çevirir:
--   http(s)://<host>/uploads/...  ->  /uploads/...
--
-- Sebep: Yükleme akışı eskiden BACKEND_URL'i (örn. http://178.105.231.185) DB'ye
-- gömüyordu. Host/IP/domain değişince DB'deki tüm görsel/CV URL'leri kırılıyordu
-- (2026-06-07 olayı). upload.controller.ts artık göreceli yol kaydediyor; bu migration
-- mevcut kayıtları da host bağımsız hale getirir.
--
-- Idempotent: WHERE guard'ları sayesinde tekrar çalıştırmak zararsızdır, taze DB'de no-op'tur.
-- Host-agnostic: regex herhangi bir host'u (`[^/]+`) eşler, sabit IP'ye bağlı değildir.

-- 1) Düz metin kolonları — değerin tamamı URL, başa demirli (^) replace.
UPDATE "exam_questions"
  SET "mediaUrl" = regexp_replace("mediaUrl", '^https?://[^/]+/uploads/', '/uploads/')
  WHERE "mediaUrl" ~ '^https?://[^/]+/uploads/';

UPDATE "exam_questions"
  SET "solutionMediaUrl" = regexp_replace("solutionMediaUrl", '^https?://[^/]+/uploads/', '/uploads/')
  WHERE "solutionMediaUrl" ~ '^https?://[^/]+/uploads/';

UPDATE "exam_options"
  SET "mediaUrl" = regexp_replace("mediaUrl", '^https?://[^/]+/uploads/', '/uploads/')
  WHERE "mediaUrl" ~ '^https?://[^/]+/uploads/';

UPDATE "test_packages"
  SET "coverImageUrl" = regexp_replace("coverImageUrl", '^https?://[^/]+/uploads/', '/uploads/')
  WHERE "coverImageUrl" ~ '^https?://[^/]+/uploads/';

UPDATE "pending_registrations"
  SET "cvUrl" = regexp_replace("cvUrl", '^https?://[^/]+/uploads/', '/uploads/')
  WHERE "cvUrl" ~ '^https?://[^/]+/uploads/';

-- 2) JSONB snapshot kolonları — URL JSON içinde gömülü, global (g) replace, text üzerinden.
--    Host parçası tırnak/slash içermez: [^/"]+ . jsonb '/' kaçışı yapmaz, güvenli.
UPDATE "purchases"
  SET "testsSnapshot" = regexp_replace("testsSnapshot"::text, 'https?://[^/"]+/uploads/', '/uploads/', 'g')::jsonb
  WHERE "testsSnapshot"::text ~ 'https?://[^/"]+/uploads/';

UPDATE "test_attempts"
  SET "questionsSnapshot" = regexp_replace("questionsSnapshot"::text, 'https?://[^/"]+/uploads/', '/uploads/', 'g')::jsonb
  WHERE "questionsSnapshot"::text ~ 'https?://[^/"]+/uploads/';

UPDATE "draft_snapshots"
  SET "payload" = regexp_replace("payload"::text, 'https?://[^/"]+/uploads/', '/uploads/', 'g')::jsonb
  WHERE "payload"::text ~ 'https?://[^/"]+/uploads/';
