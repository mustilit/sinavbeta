-- Okul Yöneticisi (SCHOOL_ADMIN) yeni-cihaz onayı admin kontrolüne alınır.
-- Varsayılan kapalı (false) → "şu an pasif"; admin panelinden açılabilir.
ALTER TABLE "admin_settings"
  ADD COLUMN IF NOT EXISTS "schoolAdminDeviceCheckEnabled" BOOLEAN NOT NULL DEFAULT false;
