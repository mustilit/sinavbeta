-- BlockedTerm tenant başına unique (term)
-- Önce mevcut duplicate'leri temizle: aynı (tenantId, term) için en eski kaydı tut

DELETE FROM "blocked_terms" a
USING "blocked_terms" b
WHERE a."tenantId" = b."tenantId"
  AND a."term" = b."term"
  AND a."createdAt" > b."createdAt";

CREATE UNIQUE INDEX IF NOT EXISTS "blocked_terms_tenantId_term_key"
  ON "blocked_terms" ("tenantId", "term");
