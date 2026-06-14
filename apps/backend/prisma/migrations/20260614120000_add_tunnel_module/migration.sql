-- TÜNEL modülü (Faz 1): içerik + onay. Aday attempt/satış Faz 2'de.

-- AdminSettings — tünel limitleri
ALTER TABLE "admin_settings" ADD COLUMN "maxLayersPerTunnel" INTEGER NOT NULL DEFAULT 7;
ALTER TABLE "admin_settings" ADD COLUMN "minQuestionsPerLayer" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "admin_settings" ADD COLUMN "maxQuestionsPerLayer" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "admin_settings" ADD COLUMN "tunnelAdvanceStreak" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "admin_settings" ADD COLUMN "tunnelOptionsPerQuestion" INTEGER NOT NULL DEFAULT 10;

-- Enum
CREATE TYPE "TunnelStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'PUBLISHED', 'UNPUBLISHED');

-- tunnels
CREATE TABLE "tunnels" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "educatorId" TEXT NOT NULL,
    "examTypeId" TEXT,
    "topicId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "currency" "Currency" NOT NULL DEFAULT 'TRY',
    "layerCount" INTEGER NOT NULL,
    "optionsPerQuestion" INTEGER NOT NULL,
    "advanceStreak" INTEGER NOT NULL,
    "status" "TunnelStatus" NOT NULL DEFAULT 'DRAFT',
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tunnels_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "tunnels_tenantId_status_idx" ON "tunnels"("tenantId", "status");
CREATE INDEX "tunnels_educatorId_status_idx" ON "tunnels"("educatorId", "status");
CREATE INDEX "tunnels_examTypeId_idx" ON "tunnels"("examTypeId");
CREATE INDEX "tunnels_topicId_idx" ON "tunnels"("topicId");

-- tunnel_layers
CREATE TABLE "tunnel_layers" (
    "id" TEXT NOT NULL,
    "tunnelId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tunnel_layers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tunnel_layers_tunnelId_index_key" ON "tunnel_layers"("tunnelId", "index");

-- tunnel_questions
CREATE TABLE "tunnel_questions" (
    "id" TEXT NOT NULL,
    "tunnelId" TEXT NOT NULL,
    "layerId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tunnel_questions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "tunnel_questions_tunnelId_idx" ON "tunnel_questions"("tunnelId");
CREATE INDEX "tunnel_questions_layerId_order_idx" ON "tunnel_questions"("layerId", "order");

-- tunnel_options
CREATE TABLE "tunnel_options" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tunnel_options_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "tunnel_options_questionId_idx" ON "tunnel_options"("questionId");

-- FKs
ALTER TABLE "tunnels" ADD CONSTRAINT "tunnels_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tunnels" ADD CONSTRAINT "tunnels_educatorId_fkey" FOREIGN KEY ("educatorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tunnels" ADD CONSTRAINT "tunnels_examTypeId_fkey" FOREIGN KEY ("examTypeId") REFERENCES "exam_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tunnels" ADD CONSTRAINT "tunnels_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tunnels" ADD CONSTRAINT "tunnels_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tunnel_layers" ADD CONSTRAINT "tunnel_layers_tunnelId_fkey" FOREIGN KEY ("tunnelId") REFERENCES "tunnels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tunnel_questions" ADD CONSTRAINT "tunnel_questions_tunnelId_fkey" FOREIGN KEY ("tunnelId") REFERENCES "tunnels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tunnel_questions" ADD CONSTRAINT "tunnel_questions_layerId_fkey" FOREIGN KEY ("layerId") REFERENCES "tunnel_layers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tunnel_options" ADD CONSTRAINT "tunnel_options_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "tunnel_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
