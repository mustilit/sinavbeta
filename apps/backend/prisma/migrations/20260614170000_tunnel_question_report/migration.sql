-- Aday tünel sorusu hata bildirimi (hafif scalar tablo)
CREATE TABLE "tunnel_question_reports" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "tunnelId" TEXT NOT NULL,
  "questionId" TEXT,
  "candidateId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tunnel_question_reports_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "tunnel_question_reports_tunnelId_status_idx" ON "tunnel_question_reports"("tunnelId", "status");
