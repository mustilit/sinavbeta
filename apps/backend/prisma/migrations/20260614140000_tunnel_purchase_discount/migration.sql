-- Tünel satın almaya indirim snapshot alanları (Faz 3).
ALTER TABLE "tunnel_purchases" ADD COLUMN "discountCodeId" TEXT;
ALTER TABLE "tunnel_purchases" ADD COLUMN "discountAmountCents" INTEGER;
