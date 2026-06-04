# Sınav Salonu — Yazılım Kalite Değerlendirme Raporu

**Tarih:** 2026-06-04
**Çalışma türü:** Zamanlanmış görev (`kalite-kontrol`) — otomatik koşum, kullanıcı yok
**Kriter dosyası:** `KALITE-DEGERLENDIRME.md` (ISO/IEC 25010 tabanlı 14 boyut)
**Kapsam:** `C:\Users\mtulu\dal` üzerinde fiziksel disk taraması
**Sürüm:** kök `package.json` → v1.6.0 (en güncel git tag: `B13`)
**Önceki rapor:** `KALITE-RAPORU-2026-06-01.md` (skor 9.4/10)

---

## Özet

Bu, kriter dosyasındaki ISO/IEC 25010 14-boyut çerçevesine göre yapılan dördüncü zamanlanmış değerlendirme. 1 Haziran raporunun kurduğu **"yalnızca diskten doğrulanmış kanıt"** disiplini bu turda da korundu — tüm sayımlar canlı `find`/`grep` ile sayıldı, hiçbiri `CLAUDE.md` veya eski raporlardan kopyalanmadı.

1–4 Haziran arası **yapısal bir değişiklik yok**: en güncel commit (`7c4372a`, 31 Mayıs) "moderasyon kapsamı + marketplace UX + soru editörü düzeltmeleri" ve birkaç use-case'te commit'lenmemiş düzenleme (review/admin/live) mevcut. Sayımlar 1 Haziran taramasıyla **birebir aynı** kaldı. Bu raporun katkısı, önceki raporun açık bıraktığı iki borcun **hâlâ kapanmadığını** doğrulamak ve bir **yeni güvenilirlik bulgusunu** kanıtlamak: circuit breaker yazılmış ve test edilmiş ama hiçbir üretim çağrısına bağlanmamış.

**Genel skor: 9.3 / 10** (▼ 0.1) — Üretime hazırlık yüksek; düşüş yeni bulgu nedeniyle, gerileme değil.

---

## Bu Turda Doğrulanan Sayımlar (canlı tarama, 04 Haziran)

| Ölçüm | Bu tarama | 01 Haz | Kanıt |
|---|---|---|---|
| Use-case dosyaları | **225** | 225 | `find use-cases -name "*.ts"` |
| Use-case domain klasörü | **22** | 22 | `ls use-cases` |
| Controller (`*.controller.ts`) | **60** | 60 | `find controllers` |
| Prisma migration | **52** | 52 | `ls prisma/migrations` |
| Prisma model | **58** | 58 | `grep "^model "` |
| Backend test (`*.test.ts`) | **303** | 303 | `find tests` |
| Frontend sayfa (`*.jsx`) | **98** | 98 | `find pages` |
| E2E spec (Playwright) | **24** | 24 | `find e2e` |
| Frontend Vitest dosyası | **32** | 24 | `find src -name "*.test.{js,jsx}"` |
| Yerel dil (locale) | **5** (tr/en/es/zh/de) | 5 | `ls locales` |
| ADR | **8** | 8 | `ls docs/adr` |
| Helm template | **10** | — | `ls helm/templates` |
| GitHub workflow | **7** | 7 | `ls .github/workflows` |

> Not: Vitest sayımı bu turda `*.test.js` + `*.test.jsx` deseniyle 32 çıktı (01 Haz yalnız `.test.jsx` saymış olabilir). Diğer tüm sayımlar değişmedi.

**Anahtar altyapı dosyaları — hepsi diskte mevcut ve doğrulandı:**
`infrastructure/resilience/circuitBreaker.ts`, `nest/services/graceful-shutdown.service.ts`, `infrastructure/database/dbRouter.ts`, `infrastructure/metrics/`, Helm `servicemonitor.yaml` + `prometheusrule.yaml` + `grafana-dashboards/`, `docs/runbooks/production-deploy-hetzner.md`, `docs/observability/slo.md`, `docs/legal/` (4 sözleşme + README).

---

## Yeni Bulgu: Circuit Breaker Üretimde Bağlı Değil 🟠

1 Haziran raporu circuit breaker'ı "diskte mevcut" diye doğruladı; bu doğru. Ancak bu turda **kullanım yerleri** arandığında ortaya çıkan tablo şu:

- `breakerFor(...)` çağrısı kod tabanında **yalnızca 2 yerde** geçiyor: tanım dosyasının kendisi (`circuitBreaker.ts`) ve birim testi (`tests/infrastructure/circuitBreaker.test.ts`).
- `circuitBreaker` modülünü **import eden hiçbir use-case / repository / service yok** (`grep -rn "from.*circuitBreaker"` → tanım dışı 0 eşleşme).
- Yani Stripe / Iyzico / Brevo / Turnstile / Google OAuth çağrılarının **hiçbiri** breaker ile sarmalanmış değil.

**Sonuç:** Circuit breaker üretim trafiğinde retry storm / p99 patlaması korumasını **şu an sağlamıyor**. Modül hazır ve testli, fakat devrede değil. Bu, v6 raporunun kendi aksiyon listesindeki *"circuitBreaker kullanım yerleri: Stripe + Iyzico + Brevo çağrılarını sarmala"* maddesinin **hâlâ açık** olduğunu kanıtlıyor. Güvenilirlik skorunu bu nedenle 9.5 → 9.0'a çekiyorum.

**Olumlu karşılık — graceful shutdown bağlı:** Aynı şüpheyle kontrol edilen graceful shutdown ise **gerçekten devrede**: `apps/backend/src/nest/main.ts:50` → `app.enableShutdownHooks();`. Service `OnApplicationShutdown` hook'u ile SIGTERM'de Prisma/Redis/Sentry sıralı kapanışını yürütüyor.

---

## Önceki Borçlar — Durum Takibi (1 Haz → 4 Haz)

| Bulgu (01 Haz) | Durum | Kanıt |
|---|---|---|
| 🟡 Controller'da doğrudan Prisma (9 controller, 22 çağrı) | **❌ Kapanmadı** | `admin.dlq`, `admin.educators`, `admin.email`, `attempts`, `auth`, `educators`, `health`, `reviews`, `site` controller'ları hâlâ doğrudan `prisma.` çağırıyor |
| 🟡 `platform-promo` audit enum `as any` kaçışı | **❌ Kapanmadı** | `CreatePlatformPromoCodeUseCase`, `DeletePlatformPromoCodeUseCase`, `TogglePlatformPromoCodeUseCase` — 3 dosyada `'DISCOUNT_CREATED' as any`; `PROMO_CREATED/TOGGLED/DELETED` enum değerleri `schema.prisma`'da hâlâ yok |
| 🟠 Circuit breaker kullanıma bağlama | **❌ Açık (yeni doğrulandı)** | Üretim kodunda hiç çağrılmıyor |

İki açık borç da bir önceki sprintten taşınmış ve bu turda dokunulmamış. `health.controller.ts`'teki doğrudan Prisma (`SELECT 1`, lag probe) meşru kabul edilebilir; geri kalan 8 controller'daki sorgular `CLAUDE.md`'nin "ince controller — controller'da direkt Prisma yasak" kuralını ihlal ediyor ve Use Case / Repository katmanına taşınmalı.

---

## Pozitif Kalite İşaretleri (1 Haz'dan taşınan, halen geçerli)

- **Sabit kodlanmış sır yok** — gizli anahtarlar `process.env` üzerinden okunuyor (01 Haz taramasıyla doğrulandı; bu turda güvenlik-kritik dosyalarda değişiklik yok).
- **Test odak sızıntısı yok** — `.only` / `fdescribe` / `fit` = 0.
- **i18n parite korunuyor** — 5 dil (tr/en/es/zh/de) senkron.
- **Coverage threshold + mutation test aktif** — `jest.config.cjs` path-spesifik threshold bloğu, `.stryker-tmp` sandbox mevcut.
- **Geniş test tabanı** — 303 backend test + 24 e2e (POM altyapısı) + 32 Vitest + k6 yük testi + Lighthouse CI.
- **Olgun süreç** — 7 workflow, semantic-release, Husky pre-commit, Dependabot, coverage-ratchet.

---

## Skor Tablosu (ISO/IEC 25010 — 14 Boyut)

| # | Boyut | v7 (04 Haz) | Δ 01 Haz | Dayanak |
|---|---|---|---|---|
| 1 | İşlevsellik | 9.5 | — | 225 use-case / 22 domain / 58 model |
| 2 | Güvenilirlik | **9.0** | ▼ 0.5 | graceful shutdown bağlı; **circuit breaker üretimde bağlı değil** |
| 3 | Kullanılabilirlik | 9.5 | — | 98 sayfa, dark mode, PWA, i18n 5 dil |
| 4 | Verimlilik / Performans | 9.5 | — | cursor pagination, Sharp pipeline, Lighthouse CI, k6 |
| 5 | Bakım Yapılabilirlik | 9.0 | — | Clean Arch güçlü; **controller-Prisma ihlali sürüyor** |
| 6 | Taşınabilirlik | 9.5 | — | Helm tam + Hetzner runbook + Docker 4 varyant |
| 7 | Güvenlik | 9.5 | — | webhook imza + 2FA + audit + sır sızıntısı yok |
| 8 | Uyumluluk | 9.0 | — | URI versioning + 4 yasal sözleşme + mobile matrix |
| 9 | Kod Kalitesi | 9.0 | — | sır yok / test temiz; **`as any` audit kaçışı sürüyor** |
| 10 | Dokümantasyon | 9.5 | — | 8 ADR + runbook + SLO + legal + architecture |
| 11 | Test Kalitesi | 9.5 | — | 303 backend + 24 e2e + 32 Vitest + mutation + ratchet |
| 12 | Süreç Kalitesi | 9.5 | — | 7 workflow + semantic-release + Husky + Dependabot |
| 13 | Müşteri Memnuniyeti | N/A | — | PostHog + OnboardingTour altyapısı; canlı veri yok |
| 14 | Ekonomik / İş Değeri | N/A | — | Subscription tier + Stripe/Iyzico; canlı değil |

**Genel ortalama (12 ölçülebilir boyut): 9.3 / 10** (▼ 0.1)

Düşüşün tek nedeni Güvenilirlik'teki yeni bulgu (circuit breaker bağlı değil). Başka hiçbir boyutta gerileme yok; iki açık mimari borç zaten 01 Haz'da 9.0'a yansıtılmıştı.

---

## Sıradaki Aksiyon Önceliklendirmesi

### 🔴 Bu sprint
- **Circuit breaker'ı bağla.** Stripe / Iyzico / Brevo / Turnstile / Google OAuth çağrılarını `breakerFor('<name>', {...})` ile sarmala. Modül + test hazır; tek eksik entegrasyon. (En yüksek güvenilirlik getirisi.)
- **Controller'daki ~22 doğrudan Prisma çağrısını taşı** (health probe hariç) — Use Case / Repository katmanına. En yüksek mimari borç.
- **`platform-promo` audit enum'unu ekle** — `PROMO_CREATED` / `PROMO_TOGGLED` / `PROMO_DELETED` schema'ya, 3 `as any` kaldırılsın.

### 🟡 Sonraki sprint
- Hetzner runbook'una göre canlı geçiş + `DATABASE_REPLICA_URL` / `VITE_CDN_BASE_URL` set.
- Bağımsız penetration test (ASVS L2 self-audit hazır).
- `prisma.service.ts` multi-tenant enforcement TODO'sunu kapat.

### 🟢 Q3+
- Frontend test oranını yükselt (32 Vitest : 303 backend).
- Contract test (OpenAPI schema validation), OAuth Microsoft/Apple, multi-currency migration.

---

## Genel Yargı

Kod tabanı tam, doğrulanabilir ve olgun. Tüm kritik altyapı modülleri diskte mevcut; graceful shutdown, read-replica routing, idempotency, webhook imza doğrulama, Helm + Prometheus + Grafana, Hetzner runbook ve yasal sözleşmeler kanıtlandı. Güvenlik hijyeni güçlü.

Bu turun tek anlamlı yeni bulgusu: **circuit breaker yazılmış ve birim-testli olmasına rağmen hiçbir üretim çağrısına bağlanmamış** — yani güvenilirlik korumasını şu an sağlamıyor. Bu, "kod var" ile "koruma devrede" arasındaki farkın somut bir örneği ve önceki raporlarda gözden kaçmış bir noktaydı. Bununla birlikte iki mimari borç (controller-Prisma, audit `as any`) 1 Haziran'dan beri kapatılmadı.

**Üretime hazırlık: Yüksek.** Canlı geçiş öncesi makul kalan işler: circuit breaker'ın bağlanması (hızlı), controller refactor'u, bağımsız pen-test ve staging smoke testi. Üçü de iyi tanımlı ve düşük riskli.

---

*Bu rapor `C:\Users\mtulu\dal` üzerinde 4 Haziran 2026'da yapılan canlı `find`/`grep` taramasıyla hazırlanmıştır. Sayımlar diskten doğrulanmıştır; doğrulanamayan iddialar dışlanmıştır. Güvenlik hijyeni bulguları (sır sızıntısı yok, test odak sızıntısı yok) güvenlik-kritik dosyalarda değişiklik olmadığı için 1 Haziran taramasından taşınmıştır. Skorlar ISO/IEC 25010 çerçevesi temelinde görece ve önceliklendirme amaçlıdır. Üretim öncesi üçüncü taraf güvenlik değerlendirmesi önerilir.*
