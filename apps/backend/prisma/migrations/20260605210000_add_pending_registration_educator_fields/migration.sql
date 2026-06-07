-- Eğitici kayıt akışı (RegisterEducatorUseCase) pending_registrations'a CV +
-- profil alanları yazar. Bu kolonlar tek-baseline squash'ında düşmüştü; kod
-- (PrismaPendingRegistrationRepository raw INSERT) yazmaya çalışınca
-- "column cvUrl does not exist" (42703) hatası → kayıt başarısız.
-- IF NOT EXISTS: canlıda elle eklenmiş olsa bile güvenli (idempotent).
ALTER TABLE "pending_registrations"
  ADD COLUMN IF NOT EXISTS "cvUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "specializations" TEXT[],
  ADD COLUMN IF NOT EXISTS "educationInfo" TEXT,
  ADD COLUMN IF NOT EXISTS "bio" TEXT,
  ADD COLUMN IF NOT EXISTS "linkedinUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "websiteUrl" TEXT;
