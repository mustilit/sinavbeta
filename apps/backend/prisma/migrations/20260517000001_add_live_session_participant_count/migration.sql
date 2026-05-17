-- Migration: add_live_session_participant_count
-- Adds currentParticipantCount column for atomic capacity control in JoinLiveSessionUseCase

ALTER TABLE "live_sessions"
  ADD COLUMN "current_participant_count" INTEGER NOT NULL DEFAULT 0;

-- Backfill: mevcut katılımcı sayısını doldur
UPDATE "live_sessions" ls
SET "current_participant_count" = (
  SELECT COUNT(*) FROM "live_participants" lp WHERE lp."sessionId" = ls.id
);
