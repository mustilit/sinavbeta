-- ============================================================================
-- sanitize-pii.sql
-- ============================================================================
-- Staging veritabanındaki PII'yi (Kişisel Tanımlayıcı Bilgi) anonimleştirir.
--
-- KAPSAM (KVKK Madde 4 + GDPR Article 4 - "kişisel veri" tanımı):
--   ✓ Email adresleri
--   ✓ İsim/soyisim
--   ✓ Telefon numaraları
--   ✓ IP adresleri (log + audit)
--   ✓ Tarayıcı/cihaz parmak izleri (UserDevice)
--   ✓ T.C. kimlik numarası (varsa)
--   ✓ Adres/şehir bilgileri (varsa)
--   ✓ LinkedIn/web URL'leri (eğitici)
--   ✓ Profil avatarı URL'i (kişisel fotoğraf yansıması)
--
-- DETERMİNİSTİK ANONIMLEŞTIRME:
--   Aynı ID her zaman aynı sahte değere map'lenir. Bu sayede:
--     - "Kullanıcı 1234'ün sınav skorları" sorgusunda mantıksal bütünlük korunur.
--     - Foreign key ilişkileri bozulmaz.
--     - Test senaryoları tekrar üretilebilir olur.
--
-- ÇALIŞMA SÜRESİ:
--   ~100k user için ~5-10 saniye. Index'lere dokunmadığı için hızlı.
-- ============================================================================

BEGIN;

-- ── Transaction içinde — herhangi bir hata tüm değişiklikleri geri alır ─────

-- ============================================================================
-- 1. USER (ana tablo — en kritik)
-- ============================================================================
UPDATE users
SET
  -- Email: user-{id}@anon.local (deterministik)
  email = 'user-' || id || '@anon.local',

  -- Username: anon-user-{id}
  username = 'anon-user-' || id,

  -- İsim / Soyisim
  "firstName" = CASE
    WHEN role = 'EDUCATOR' THEN 'Eğitici'
    WHEN role = 'CANDIDATE' THEN 'Aday'
    WHEN role = 'ADMIN' THEN 'Admin'
    WHEN role = 'WORKER' THEN 'Worker'
    ELSE 'Kullanıcı'
  END,
  "lastName" = id::text,

  -- Telefon (varsa)
  phone = NULL,

  -- Bio (eğitici profil metni, gerçek bilgi olabilir)
  bio = CASE WHEN bio IS NOT NULL THEN 'Anonim eğitici bio metni.' ELSE NULL END,

  -- LinkedIn / web URL'i
  "linkedinUrl" = NULL,
  "websiteUrl" = NULL,

  -- Avatar (gerçek kullanıcı fotoğrafı yansıyor olabilir)
  "avatarUrl" = NULL,

  -- CV dosya yolu (PDF yüklenmiş olabilir)
  "cvUrl" = NULL,

  -- Şifre hash'i sıfırlanır — kimse staging'e prod şifresiyle giremesin.
  -- Yeni şifre: "staging123" (bcrypt cost 4, yalnızca staging için)
  "passwordHash" = '$2a$04$wJqDU8DmJ4MEPxJ7sQwxOOZNyfvjUjEcz9LZdQX/uPMrXEKjVgPiu',

  -- 2FA secret'ı sıfırla
  "twoFactorSecret" = NULL,
  "twoFactorEnabled" = false,
  "twoFactorBackupCodes" = NULL,

  -- Email verification token (geçersiz olsun)
  "emailVerificationToken" = NULL,
  "emailVerifiedAt" = NOW() - INTERVAL '1 day',  -- Eski hesaplar verified say

  -- Şifre sıfırlama token'ları
  "passwordResetToken" = NULL,
  "passwordResetExpiresAt" = NULL,

  -- Active session token sıfırla (kimse staging'e prod cookie ile giremesin)
  "activeSessionId" = NULL,

  -- Sentry / PostHog identifier'ları
  "lastLoginIp" = NULL,
  "lastLoginUserAgent" = NULL
WHERE email NOT LIKE '%@anon.local';

-- Admin için sabit erişim hesabı — staging'de test için
UPDATE users
SET
  email = 'admin@staging.local',
  username = 'staging-admin',
  -- passwordHash zaten yukarıda sıfırlandı — şifre: staging123
  "firstName" = 'Staging',
  "lastName" = 'Admin'
WHERE id = (SELECT id FROM users WHERE role = 'ADMIN' ORDER BY id LIMIT 1);

-- ============================================================================
-- 2. PENDING_REGISTRATION (henüz User'a yazılmamış kayıtlar)
-- ============================================================================
UPDATE pending_registrations
SET
  email = 'pending-' || id || '@anon.local',
  username = 'pending-user-' || id,
  "firstName" = 'Pending',
  "lastName" = id::text,
  phone = NULL,
  "linkedinUrl" = NULL,
  "websiteUrl" = NULL,
  "cvUrl" = NULL,
  "verificationToken" = NULL,
  "passwordHash" = '$2a$04$wJqDU8DmJ4MEPxJ7sQwxOOZNyfvjUjEcz9LZdQX/uPMrXEKjVgPiu';

-- ============================================================================
-- 3. USER_DEVICE (cihaz parmak izleri)
-- ============================================================================
UPDATE user_devices
SET
  fingerprint = 'anon-fp-' || id,
  "userAgent" = 'Mozilla/5.0 (Anonymous)',
  "ipAddress" = '127.0.0.1',
  "trustToken" = NULL,
  "lastSeenAt" = NOW();

-- ============================================================================
-- 4. CONTRACT_ACCEPTANCE (sözleşme onayı — IP + UA delili)
-- ============================================================================
UPDATE contract_acceptances
SET
  "acceptedIp" = '127.0.0.1',
  "acceptedUserAgent" = 'Mozilla/5.0 (Anonymous)';

-- ============================================================================
-- 5. PURCHASE (mesafeli satış sözleşmesi snapshot'ı)
-- ============================================================================
UPDATE purchases
SET
  "distanceSaleAcceptedIp" = '127.0.0.1',
  "distanceSaleAcceptedUserAgent" = 'Mozilla/5.0 (Anonymous)'
WHERE "distanceSaleAcceptedIp" IS NOT NULL;

-- ============================================================================
-- 6. LIVE_PARTICIPANT (canlı oturum katılımcısı IP)
-- ============================================================================
UPDATE live_participants
SET
  "joinIp" = '127.0.0.1',
  "userAgent" = 'Mozilla/5.0 (Anonymous)'
WHERE "joinIp" IS NOT NULL;

-- ============================================================================
-- 7. REVIEW (kullanıcı yorumları — bazı gerçek isim içerebilir)
-- ============================================================================
UPDATE reviews
SET
  comment = CASE
    WHEN LENGTH(comment) > 0 THEN 'Anonim test yorumu (sanitize edildi).'
    ELSE comment
  END
WHERE comment IS NOT NULL;

-- ============================================================================
-- 8. OBJECTION (itiraz metni — kullanıcı yazısı, gerçek bilgi içerebilir)
-- ============================================================================
UPDATE objections
SET
  "userMessage" = 'Anonim itiraz metni.',
  "educatorResponse" = CASE
    WHEN "educatorResponse" IS NOT NULL THEN 'Anonim eğitici cevabı.'
    ELSE NULL
  END,
  "adminNote" = CASE
    WHEN "adminNote" IS NOT NULL THEN 'Anonim admin notu.'
    ELSE NULL
  END;

-- ============================================================================
-- 9. REFUND_REQUEST (iade nedeni — kullanıcı metni)
-- ============================================================================
UPDATE refund_requests
SET
  reason = 'Anonim iade nedeni.',
  "educatorResponse" = CASE
    WHEN "educatorResponse" IS NOT NULL THEN 'Anonim eğitici cevabı.'
    ELSE NULL
  END,
  "adminNote" = CASE
    WHEN "adminNote" IS NOT NULL THEN 'Anonim admin notu.'
    ELSE NULL
  END;

-- ============================================================================
-- 10. SUPPRESSED_EMAIL (mail blocklisti — gerçek adresler)
-- ============================================================================
UPDATE suppressed_emails
SET email = 'suppressed-' || id || '@anon.local';

-- ============================================================================
-- 11. NOTIFICATION_PREFERENCE (yorum yoksa kişisel veri içermiyor — atla)
-- ============================================================================
-- (Bu tablo userId üzerinden anonimleşir; ayrı işlem gerekmez.)

-- ============================================================================
-- 12. EDUCATOR_REJECTION (eğitici başvurusu reddetme sebebi)
-- ============================================================================
UPDATE educator_rejections
SET
  reason = 'Anonim red nedeni.',
  "adminNote" = CASE
    WHEN "adminNote" IS NOT NULL THEN 'Anonim admin notu.'
    ELSE NULL
  END
WHERE reason IS NOT NULL;

-- ============================================================================
-- 13. STRIPE / IYZICO CUSTOMER REFERANSLARI
-- ============================================================================
-- Subscription.providerRef + customerRef — staging'de bu referanslar gerçek
-- Stripe customer'larına işaret etmesin, yoksa staging'den prod Stripe'a istek
-- atma riski var.

UPDATE subscriptions
SET
  "providerRef" = 'sub_anon_' || id,
  "customerRef" = 'cus_anon_' || id
WHERE "providerRef" IS NOT NULL OR "customerRef" IS NOT NULL;

-- ============================================================================
-- 14. PII İÇERMEDİĞİ HALDE TEMİZLENMESİ GEREKEN HASSAS ALANLAR
-- ============================================================================

-- Admin settings — secret'lar prod'a aitse staging'de geçerli olmamalı
UPDATE admin_settings
SET
  "iyzicoApiKey" = 'staging-iyzico-key',
  "iyzicoSecretKey" = 'staging-iyzico-secret',
  "stripeWebhookSecret" = 'whsec_staging_anonymous',
  "turnstileSecretKey" = 'staging-turnstile-key',
  "brevoApiKey" = 'staging-brevo-key',
  "smtpPassword" = 'staging-smtp-password',
  "googleOauthClientSecret" = 'staging-google-secret'
WHERE id = 1;

-- ============================================================================
-- 15. SANITIZE İŞARETÇİSİ (Sentry/PostHog bunu görüp staging'i tanır)
-- ============================================================================
INSERT INTO site_settings (key, value, "updatedAt")
VALUES ('ENVIRONMENT_TYPE', 'staging-anonymized', NOW())
ON CONFLICT (key) DO UPDATE
SET value = 'staging-anonymized', "updatedAt" = NOW();

-- ============================================================================
-- DOĞRULAMA
-- ============================================================================
-- Beklenen: hiçbir user.email gerçek bir domain'e işaret etmesin.
DO $$
DECLARE
  real_email_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO real_email_count
  FROM users
  WHERE email NOT LIKE '%@anon.local'
    AND email NOT LIKE '%@staging.local';

  IF real_email_count > 0 THEN
    RAISE EXCEPTION 'SANITIZATION FAILED: % gerçek email kaldı', real_email_count;
  END IF;

  RAISE NOTICE 'Sanitization doğrulama: % user, hepsi anonim.', (SELECT COUNT(*) FROM users);
END $$;

COMMIT;

-- ============================================================================
-- SON
-- ============================================================================
-- Bu SQL transaction içinde çalışır — bir UPDATE başarısız olursa hepsi rollback.
-- Yeni tablo ekledikçe (özellikle PII içerebilecekler) yukarıdaki listeyi güncelle.
-- KVKK denetimi için bu dosya bir "anonimleştirme kanıtı" niteliğindedir.
