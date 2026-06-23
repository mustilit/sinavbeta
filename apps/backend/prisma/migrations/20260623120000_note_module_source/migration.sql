-- Aday notlarını tünel/yazılı modüllerine de taşı (FK YOK — modül-dışı adres).
ALTER TABLE "candidate_notes"
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'TEST',
  ADD COLUMN "contextId" TEXT,
  ADD COLUMN "contextQuestionId" TEXT;

CREATE INDEX "candidate_notes_candidateId_contextId_idx" ON "candidate_notes" ("candidateId", "contextId");
