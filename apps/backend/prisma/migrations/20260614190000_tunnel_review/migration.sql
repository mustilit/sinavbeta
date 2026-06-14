-- Aday tünel değerlendirmesi (puan + yorum), aday başına tek satır
CREATE TABLE "tunnel_reviews" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "tunnelId" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tunnel_reviews_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tunnel_reviews_tunnelId_candidateId_key" ON "tunnel_reviews"("tunnelId", "candidateId");
CREATE INDEX "tunnel_reviews_tunnelId_idx" ON "tunnel_reviews"("tunnelId");
