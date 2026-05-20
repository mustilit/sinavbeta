-- AlterTable: Purchase.paymentProvider
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "paymentProvider" TEXT;

-- CreateTable: payment_settings
CREATE TABLE IF NOT EXISTS "payment_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "mode" TEXT NOT NULL DEFAULT 'test',
    "iyzicoEnabled" BOOLEAN NOT NULL DEFAULT true,
    "iyzicoApiKey" TEXT,
    "iyzicoSecretKey" TEXT,
    "iyzicoBaseUrl" TEXT NOT NULL DEFAULT 'https://sandbox-api.iyzipay.com',
    "googlePayEnabled" BOOLEAN NOT NULL DEFAULT true,
    "googlePayMerchantId" TEXT,
    "amazonPayEnabled" BOOLEAN NOT NULL DEFAULT true,
    "amazonPayMerchantId" TEXT,
    "companyName" TEXT,
    "companyTaxId" TEXT,
    "companyAddress" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_settings_pkey" PRIMARY KEY ("id")
);

-- Seed: test verileri
INSERT INTO "payment_settings" ("id", "mode", "iyzicoApiKey", "iyzicoSecretKey", "companyName", "companyTaxId", "companyAddress", "updatedAt")
VALUES (1, 'test', 'sandbox-iyzicoApiKey', 'sandbox-secretKey', 'Sinav Salonu A.Ş.', '1234567890', 'Atatürk Cad. No:1, İstanbul', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
