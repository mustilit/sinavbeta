-- Tünel satın almada paket akışıyla aynı: ödeme sağlayıcısı + mesafeli satış snapshot
ALTER TABLE "tunnel_purchases" ADD COLUMN "paymentProvider" TEXT;
ALTER TABLE "tunnel_purchases" ADD COLUMN "distanceSaleContractId" TEXT;
ALTER TABLE "tunnel_purchases" ADD COLUMN "distanceSaleAcceptedAt" TIMESTAMP(3);
ALTER TABLE "tunnel_purchases" ADD COLUMN "distanceSaleAcceptedIp" TEXT;
ALTER TABLE "tunnel_purchases" ADD COLUMN "distanceSaleAcceptedUserAgent" TEXT;
