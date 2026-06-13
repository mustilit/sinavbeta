-- Aday kişisel notları (CandidateNote) — soru çözerken "+ Not" ile alınır.
-- Soru-bağlı (adresli) veya serbest (genel). Adresleme: FK (kaynak silinince SetNull)
-- + snapshot kolonları (silinse de Notlarım'da adres korunur).
CREATE TABLE "candidate_notes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "testId" TEXT,
    "questionId" TEXT,
    "topicId" TEXT,
    "examTypeId" TEXT,
    "attemptId" TEXT,
    "testTitle" TEXT,
    "topicName" TEXT,
    "examTypeName" TEXT,
    "questionExcerpt" TEXT,
    "questionOrder" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "candidate_notes_candidateId_createdAt_id_idx" ON "candidate_notes"("candidateId", "createdAt" DESC, "id" DESC);
CREATE INDEX "candidate_notes_candidateId_topicId_idx" ON "candidate_notes"("candidateId", "topicId");
CREATE INDEX "candidate_notes_candidateId_testId_idx" ON "candidate_notes"("candidateId", "testId");
CREATE INDEX "candidate_notes_candidateId_examTypeId_idx" ON "candidate_notes"("candidateId", "examTypeId");
CREATE INDEX "candidate_notes_candidateId_questionId_idx" ON "candidate_notes"("candidateId", "questionId");

ALTER TABLE "candidate_notes" ADD CONSTRAINT "candidate_notes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "candidate_notes" ADD CONSTRAINT "candidate_notes_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "candidate_notes" ADD CONSTRAINT "candidate_notes_testId_fkey" FOREIGN KEY ("testId") REFERENCES "exam_tests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "candidate_notes" ADD CONSTRAINT "candidate_notes_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "exam_questions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "candidate_notes" ADD CONSTRAINT "candidate_notes_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "candidate_notes" ADD CONSTRAINT "candidate_notes_examTypeId_fkey" FOREIGN KEY ("examTypeId") REFERENCES "exam_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
