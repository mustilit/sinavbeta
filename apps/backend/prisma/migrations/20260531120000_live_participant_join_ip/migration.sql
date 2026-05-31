-- Canlı oturum kapatma saldırısı koruması: katılım IP'si.
-- Aynı cihaz/IP'den bir oturuma katılım sayısını sınırlamak için kullanılır
-- (JoinLiveSessionUseCase — tek cihazın tüm kotayı doldurmasını engeller).

ALTER TABLE "live_participants" ADD COLUMN IF NOT EXISTS "join_ip" TEXT;

-- Aynı oturum + IP sorgusu için kompozit index (limit kontrolü hot path).
CREATE INDEX IF NOT EXISTS "live_participants_sessionId_join_ip_idx"
  ON "live_participants" ("sessionId", "join_ip");
