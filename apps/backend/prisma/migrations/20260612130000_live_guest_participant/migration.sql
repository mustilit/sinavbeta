-- Login'siz (misafir) canlı oturum katılımı.
-- userId nullable (misafirde null), displayName (misafir adı), guest_token (misafir kimlik).
ALTER TABLE "live_participants" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "live_participants" ADD COLUMN IF NOT EXISTS "displayName" TEXT;
ALTER TABLE "live_participants" ADD COLUMN IF NOT EXISTS "guest_token" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "live_participants_guest_token_key" ON "live_participants"("guest_token");
