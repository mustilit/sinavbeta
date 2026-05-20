-- Migration: add_live_sessions
-- LiveSession modülü için gerekli tablolar

CREATE TABLE IF NOT EXISTS "live_session_tiers" (
  "id"              TEXT NOT NULL,
  "label"           TEXT NOT NULL,
  "minParticipants" INTEGER NOT NULL DEFAULT 0,
  "maxParticipants" INTEGER,
  "priceCents"      INTEGER NOT NULL DEFAULT 0,
  "isActive"        BOOLEAN NOT NULL DEFAULT true,
  "order"           INTEGER NOT NULL DEFAULT 0,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "live_session_tiers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "live_sessions" (
  "id"                 TEXT NOT NULL,
  "educatorId"         TEXT NOT NULL,
  "tierId"             TEXT,
  "maxParticipants"    INTEGER,
  "title"              TEXT NOT NULL,
  "joinCode"           TEXT NOT NULL,
  "status"             TEXT NOT NULL DEFAULT 'DRAFT',
  "currentQuestionIdx" INTEGER NOT NULL DEFAULT 0,
  "showStats"          BOOLEAN NOT NULL DEFAULT false,
  "paidAt"             TIMESTAMP(3),
  "startedAt"          TIMESTAMP(3),
  "endedAt"            TIMESTAMP(3),
  "roundNumber"        INTEGER NOT NULL DEFAULT 1,
  "parentSessionId"    TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "live_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "live_sessions_joinCode_key" UNIQUE ("joinCode")
);

CREATE TABLE IF NOT EXISTS "live_questions" (
  "id"        TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "content"   TEXT NOT NULL,
  "mediaUrl"  TEXT,
  "order"     INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "live_questions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "live_options" (
  "id"         TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "content"    TEXT NOT NULL,
  "isCorrect"  BOOLEAN NOT NULL,
  "order"      INTEGER NOT NULL,
  CONSTRAINT "live_options_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "live_participants" (
  "id"         TEXT NOT NULL,
  "sessionId"  TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "joinedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "live_participants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "live_participants_sessionId_userId_key" UNIQUE ("sessionId", "userId")
);

CREATE TABLE IF NOT EXISTS "live_answers" (
  "id"            TEXT NOT NULL,
  "sessionId"     TEXT NOT NULL,
  "questionId"    TEXT NOT NULL,
  "participantId" TEXT NOT NULL,
  "optionId"      TEXT,
  "answeredAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "live_answers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "live_answers_questionId_participantId_key" UNIQUE ("questionId", "participantId")
);

-- İndeksler
CREATE INDEX IF NOT EXISTS "live_sessions_educatorId_idx"       ON "live_sessions"("educatorId");
CREATE INDEX IF NOT EXISTS "live_sessions_parentSessionId_idx"  ON "live_sessions"("parentSessionId");
CREATE INDEX IF NOT EXISTS "live_questions_sessionId_idx"       ON "live_questions"("sessionId");
CREATE INDEX IF NOT EXISTS "live_options_questionId_idx"        ON "live_options"("questionId");
CREATE INDEX IF NOT EXISTS "live_participants_sessionId_idx"    ON "live_participants"("sessionId");
CREATE INDEX IF NOT EXISTS "live_participants_sessionId_lastSeenAt_idx" ON "live_participants"("sessionId", "lastSeenAt");
CREATE INDEX IF NOT EXISTS "live_answers_sessionId_idx"         ON "live_answers"("sessionId");

-- Foreign key kısıtlamaları
ALTER TABLE "live_sessions"
  ADD CONSTRAINT "live_sessions_educatorId_fkey"
    FOREIGN KEY ("educatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "live_sessions_tierId_fkey"
    FOREIGN KEY ("tierId") REFERENCES "live_session_tiers"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "live_sessions_parentSessionId_fkey"
    FOREIGN KEY ("parentSessionId") REFERENCES "live_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "live_questions"
  ADD CONSTRAINT "live_questions_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "live_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "live_options"
  ADD CONSTRAINT "live_options_questionId_fkey"
    FOREIGN KEY ("questionId") REFERENCES "live_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "live_participants"
  ADD CONSTRAINT "live_participants_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "live_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "live_participants_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "live_answers"
  ADD CONSTRAINT "live_answers_questionId_fkey"
    FOREIGN KEY ("questionId") REFERENCES "live_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "live_answers_optionId_fkey"
    FOREIGN KEY ("optionId") REFERENCES "live_options"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "live_answers_participantId_fkey"
    FOREIGN KEY ("participantId") REFERENCES "live_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
