-- test_packages tablosuna tsvector generated column + GIN index
-- 'simple' config: Türkçe kelimeleri lowercase yapar, noktalama temizler, kök bulmaz.
-- A ağırlığı: title (en önemli), B ağırlığı: description

ALTER TABLE "test_packages"
  ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'B')
  ) STORED;

-- GIN index — tsvector araması için zorunlu
CREATE INDEX "test_packages_search_idx"
  ON "test_packages" USING GIN ("search_vector");
