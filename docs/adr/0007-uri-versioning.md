# ADR-0007: API versiyonlama — URI prefix (`/v1/`)

## Statü
Accepted

## Bağlam

KALITE-DEGERLENDIRME §8: "API versiyonlama yok. Mevcut endpoint'ler `/auth/login`, `/tests`, `/purchases` — public SDK çıkarsa breaking change kontrol edilemez."

Frontend Vite SPA aynı repo → breaking change yönetimi mümkün, ama:
- Mobile app (gelecek)
- 3rd party SDK / webhook subscriber
- Iyzico/Stripe inbound webhook

Versiyonlama olmadan API evolusyonu mümkün değil.

## Karar

NestJS `enableVersioning({ type: URI, prefix: 'v', defaultVersion: VERSION_NEUTRAL })`.

- **Legacy endpoint'ler (mevcut):** `/auth/login`, `/tests` — VERSION_NEUTRAL, URL değişmez.
- **Yeni endpoint'ler:** `@Controller({ path: 'foo', version: '1' })` → `/v1/foo`.
- **Breaking change:** Eski endpoint'e `Sunset` header + 6 ay geçiş süresi, yeni endpoint yeni v ile yazılır.

Detay: `docs/api-versioning.md`.

## Sonuçlar

**Olumlu**

- Public API'ya breaking change kontrollü yapılabilir.
- Eski client'lar çalışmaya devam eder (6 ay sunset).
- Swagger UI'da version-aware gruplaması.

**Olumsuz / takas**

- 47 mevcut endpoint geçişi için 6 ay ek effort (yapmama kararı: legacy URL'ler kalır).
- Controller dosya organizasyonu: `v1/` alt klasörü öneririz.
- OpenAPI export: tek dosya, hem legacy hem v1.

## Alternatifler

- **Header-based versioning** (`Accept: application/vnd.sinavsalonu.v1+json`) — Reddedildi: cache + CDN ile karmaşık, debug zor.
- **Query param** (`?v=1`) — Reddedildi: standart değil.
- **Subdomain** (`v1.api.sinavsalonu.com`) — Reddedildi: DNS + cert maliyeti.

## Uygulama notları

- `apps/backend/src/nest/main.ts` → `enableVersioning(...)` aktif.
- Yeni controller şablonu `docs/api-versioning.md` içinde.
- SDK üretimi (`openapi-generator`) için `openapi.json` yeterli — version'lar tag ile ayrılır.

## Tarih

Q2 2026 — bu çeyrekte KALITE-DEGERLENDIRME aksiyonu olarak kabul edildi.

## İlgili

- `docs/api-versioning.md`
- Skill: `release-engineering` (sunset policy)
