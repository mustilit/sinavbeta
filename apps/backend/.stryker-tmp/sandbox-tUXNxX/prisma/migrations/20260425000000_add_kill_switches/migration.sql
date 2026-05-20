-- Kill-switch columns for admin_settings
ALTER TABLE "admin_settings"
  ADD COLUMN IF NOT EXISTS "packageCreationEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "testPublishingEnabled"  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "testAttemptsEnabled"    BOOLEAN NOT NULL DEFAULT true;
