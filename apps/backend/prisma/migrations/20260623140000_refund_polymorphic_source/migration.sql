-- İade akışı TUNNEL ve WRITTEN modüllerine genişletildi (polymorphic source).
-- RefundRequest'te FK yok; purchaseId/testId artık nullable, kaynak ayrımı `source` ile.
ALTER TABLE "refund_requests" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'TEST';
ALTER TABLE "refund_requests" ADD COLUMN "tunnelPurchaseId" TEXT;
ALTER TABLE "refund_requests" ADD COLUMN "writtenPurchaseId" TEXT;
ALTER TABLE "refund_requests" ADD COLUMN "tunnelId" TEXT;
ALTER TABLE "refund_requests" ADD COLUMN "writtenPackageId" TEXT;

ALTER TABLE "refund_requests" ALTER COLUMN "purchaseId" DROP NOT NULL;
ALTER TABLE "refund_requests" ALTER COLUMN "testId" DROP NOT NULL;

CREATE UNIQUE INDEX "refund_requests_tunnelPurchaseId_key" ON "refund_requests" ("tunnelPurchaseId");
CREATE UNIQUE INDEX "refund_requests_writtenPurchaseId_key" ON "refund_requests" ("writtenPurchaseId");
CREATE INDEX "refund_requests_source_idx" ON "refund_requests" ("source");
