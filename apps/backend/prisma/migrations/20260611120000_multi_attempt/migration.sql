-- Çok-denemeli test: aynı (test, aday) için birden fazla deneme tutulabilir.
-- Eski tek-deneme unique index'i kaldırılır; attemptNumber eklenir (mevcut satırlar 1
-- olur); (testId, candidateId, attemptNumber) yeni unique olur.
-- Eski unique ≤1 satır/pair garanti ettiği için backfill çakışması olmaz.

DROP INDEX "test_attempts_testId_candidateId_key";

ALTER TABLE "test_attempts" ADD COLUMN "attemptNumber" INTEGER NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX "test_attempts_testId_candidateId_attemptNumber_key"
  ON "test_attempts" ("testId", "candidateId", "attemptNumber");
