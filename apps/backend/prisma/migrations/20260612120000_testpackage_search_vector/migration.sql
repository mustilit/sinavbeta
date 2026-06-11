-- TestPackage tam-metin arama (Home/Explore search).
-- 'simple' config ile title (ağırlık A) + description (ağırlık B) üzerinden
-- GENERATED ALWAYS AS ... STORED tsvector kolonu + GIN index.
-- ListMarketplacePackagesUseCase $queryRaw bunu `to_tsquery('simple', ...)` ile kullanır.
-- (Prisma generated column'ı yönetemediği için schema.prisma'da alan tutulmaz; raw SQL.)
-- IF NOT EXISTS: idempotent — tekrar uygulanırsa hata vermez.

ALTER TABLE "test_packages"
  ADD COLUMN IF NOT EXISTS "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'B')
  ) STORED;

CREATE INDEX IF NOT EXISTS "test_packages_search_idx"
  ON "test_packages" USING GIN ("search_vector");
