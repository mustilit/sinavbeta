-- Tünel kapak görseli + şık görseli (normal test bileşeni paritesi)
ALTER TABLE "tunnels" ADD COLUMN "coverImageUrl" TEXT;
ALTER TABLE "tunnel_options" ADD COLUMN "mediaUrl" TEXT;
