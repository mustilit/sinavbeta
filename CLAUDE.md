# Sinav Salonu

Test marketplace uygulaması. Eğiticiler (educators) sınav (test) oluşturur ve satar; adaylar (candidates) satın alır, çözer, skorlarını takip eder.

## Stack

- **Frontend:** React 18 + Vite, JavaScript (JSX), Tailwind CSS, React Router DOM v6, TanStack Query, next-themes (dark mode), react-i18next (i18n: tr/en/es/zh/de), PostHog (consent-gated ürün analitiği), **vite-plugin-pwa + Workbox (offline shell + service worker)**, **vite-plugin-compression2 (Brotli + Gzip pre-compression)**
- **Backend:** NestJS (REST + DTO + Validation), Clean Architecture (Use Cases katmanı), **opossum (circuit breaker)**, **prom-client (`/metrics` endpoint)**, **Sharp (image pipeline)**
- **Veritabanı:** PostgreSQL + Prisma ORM (cursor pagination + tsvector full-text search), **read replica routing (`prismaRead()` raporlar için)**
- **Ödeme:** Stripe (abonelik + checkout) + Iyzico; webhook imza doğrulama + replay koruması
- **Test:** Vitest + Testing Library (frontend), Jest (NestJS), Playwright (e2e — desktop + `mobile-360` Galaxy S5 + `mobile-iphone` projeleri), @axe-core/playwright (a11y), **Lighthouse CI (Performance ≥ 85 + Accessibility ≥ 95)**
- **Gözlem:** Sentry (frontend + backend), Prometheus Operator (`ServiceMonitor` + `PrometheusRule` SLO alert'leri), Grafana dashboard (`infra/helm/sinavsalonu/grafana-dashboards/sinavsalonu-overview.json`)
- **Paket yöneticisi:** npm (backend ve frontend ayrı `package.json`; kök `package.json` yalnızca Husky + lint-staged içerir)
- **Konteyner & Orkestrasyon:** Docker Compose (geliştirme + üretim + CI) ve Helm chart (Kubernetes deploy), **nginx (brotli + gzip + static asset cache + SPA fallback + CSP)**

## Dizin Yapısı (gerçek)

```
apps/
  backend/               → NestJS backend
    src/
      application/
        use-cases/           → İş mantığı buradadır — 20 domain alt klasörüne ayrılmış
          auth/              → Kayıt, giriş, şifre sıfırlama, 2FA (Setup/Disable/VerifyTwoFactorLogin), cihaz doğrulama (VerifyDevice/NotifyNewDeviceLogin)
          billing/           → Abonelik & ödeme: StartCheckout, CreatePortalLink, GetMySubscription, HandleStripeWebhook, HandleIyzicoWebhook
          moderation/        → AI içerik moderasyonu: ModerateQuestionContent, ProcessModerationJob, BlockedTerm CRUD, risk skoru, ihlal/aksiyon yönetimi (17 use-case)
          educator/          → Eğitici profil, takip
          test/              → Test CRUD, yayımlama, arama
          question/          → Soru & seçenek CRUD
          attempt/           → Deneme başlatma, cevap, submit, timeout
          purchase/          → Satın alma akışı
          refund/            → İade talebi ve yönetimi
          discount/          → İndirim kodu (eğitici → aday, paket bazlı). `ValidateDiscountCodeUseCase` aday "Uygula" akışında.
          platform-promo/    → Sprint 15 — Admin platform promo kodu (admin → eğitici). Scope: LIVE_SESSION / AD_PACKAGE. CRUD + Validate (5 use case)
          review/            → Değerlendirme
          objection/         → İtiraz akışı
          ad/                → Reklam paketi
          package/           → Test paketi CRUD, yayımlama
          live/              → Canlı sınav oturumu
          admin/             → Kullanıcı yönetimi, ayarlar, raporlar
          contract/          → Eğitici sözleşmesi
          report/            → Raporlama
          notification/      → Bildirim tercihleri, digest
          tunnel/            → Tünel (adaptif ustalık öğrenme): Create/Update/Save/Submit/Approve/Reject, List/Get, Purchase/ValidateDiscount, Start/SubmitAnswer/GetState, Review×3, Reports, Report + engine (saf adaptif motor) + tunnelPlay
        services/        → Yardımcı servisler (ReviewAggregation, AuditLogService, RefundProcessor, TestAttemptService)
          email/         → EmailDispatcher, EmailRenderer, providers (Brevo/SMTP/Console), workers
          content-safety/→ AI moderasyon (Claude/Nsfwjs providers)
          image/         → ImageProcessor.ts (Sharp pipeline: origin + 320w/640w/1024w WebP + thumbnail + EXIF strip)
          backup/        → BackupService
          security/      → SecretsVault, TurnstileVerifier
      domain/
        interfaces/      → Repository arayüzleri
        types.ts         → Domain tipleri (AdminSettings vb.)
      infrastructure/
        repositories/    → Prisma repository implementasyonları
        database/        → Prisma client singleton + dbRouter.ts (prismaRead() read replica)
        cache/           → RedisCache
        resilience/      → circuitBreaker.ts (opossum named breaker registry + prom-client metrics)
        metrics/         → prom-client registry (request count, latency histogram, queue depth)
      nest/
        controllers/     → HTTP katmanı (ince — iş mantığı YOK)
        controllers/dto/ → DTO sınıfları (class-validator)
        guards/          → JWT, Roles, WorkerPermissions
        decorators/      → @Public, @Roles, @WorkerPermissions
        interceptors/    → idempotency.interceptor.ts (Idempotency-Key → Redis, çift fatura koruması), metrics.interceptor.ts
        modules/         → NestJS modülleri (cron, vb.)
        services/        → BackupSchedulerService, GracefulShutdownService (SIGTERM → Prisma+Redis+Sentry flush)
        security/        → CSP builder, verifyWebhookSignature.ts (Stripe HMAC-SHA256 + Iyzico SHA-1, timing-safe)
    prisma/
      schema.prisma      → Tek şema dosyası
      migrations/        → Numbered migration SQL dosyaları
  frontend/              → React/Vite frontend
    src/
      pages/             → Sayfa bileşenleri (Her route bir dosya, lazy import için default export)
      components/        → Paylaşılan React bileşenleri
        layout/          → Sidebar, Header, Layout, ThemeToggle
        ui/              → Radix UI primitive'leri (shadcn tarzı), Skeleton, ResponsiveImage (Sharp pipeline tüketicisi)
        test/            → Test'e özgü bileşenler
        onboarding/      → OnboardingTour (5 adım + analytics events), tourSteps (candidate + educator persona flow)
        ErrorBoundary.jsx → Root error boundary
      api/
        dalClient.js     → Tüm API çağrıları burada merkezi
      lib/               → Util fonksiyonları, hook'lar
        i18n.js          → react-i18next init (LanguageDetector; tr/en/es/zh/de; namespace: common/auth/pages/onboarding)
        analytics.js     → PostHog wrapper (track/identify/reset; KVKK/GDPR consent-gated; session replay opt-in)
        pwa.js           → setupPwa() — vite-plugin-pwa SW registration + online/offline event'leri
        cdn.js           → CDN URL helper (VITE_CDN_BASE_URL rewrite)
      locales/           → Çeviri JSON dosyaları: <lang>/<namespace>.json
      pages.config.js    → Sayfa-route eşlemesi (React.lazy ile)
      lib/routeRoles.js  → Sayfa bazlı rol erişim kontrolü
    public/
      pwa-source.svg     → PWA ikon kaynağı
      pwa-{192,512}.png  → Android home screen + splash
      apple-touch-icon.png (180×180) → iOS home screen
      favicon.png (32×32)
    scripts/
      generate-pwa-icons.mjs → public/pwa-source.svg → 32/180/192/512 PNG (Sharp ile)
    e2e/
      specs/
        a11y.spec.ts        → axe-core ile masaüstü a11y testleri
        mobile-a11y.spec.ts → 360px + iPhone — yatay scroll, touch target ≥ 40px, skip link
        purchase-flow.spec.ts, refund-flow.spec.ts, live-session-flow.spec.ts, ...
    lighthouserc.json    → Lighthouse CI thresholds (perf ≥ .85, a11y ≥ .95, LCP < 2.5s, CLS < .1, TBT < 300ms)
    playwright.config.js → 3 project: desktop / mobile-360 (Galaxy S5) / mobile-iphone (iPhone 12)
infra/
  docker/
    docker-compose.yml            → Geliştirme ortamı
    docker-compose.prod.yml       → Üretim ortamı
    docker-compose.ci.yml         → CI ortamı
    docker-compose.pgbouncer.yml  → PgBouncer connection pooling
    backend.Dockerfile
    frontend.Dockerfile           → Nginx + ngx_http_brotli (Alpine edge community) + envsubst CSP
  helm/
    sinavsalonu/                  → Kubernetes Helm chart (Chart.yaml v0.1.0, appVersion 1.0.0)
      values.yaml                 → Yapılandırılabilir değerler (metrics.enabled vb.)
      templates/                  → backend/frontend/worker-deployment, configmap, secret, migration-job, ingress,
                                    servicemonitor.yaml (Prometheus Operator), prometheusrule.yaml (8 SLO alert)
      grafana-dashboards/         → sinavsalonu-overview.json (7 panel: latency, error rate, queue, replica lag, breaker)
  nginx/
    default.conf.template → envsubst ile CSP başlığı, SPA fallback, brotli_static + gzip_static, asset cache
.github/
  dependabot.yml         → Otomatik bağımlılık güncelleme (haftalık, gruplu)
  workflows/
    lighthouse.yml       → PR + main push → 4 sayfa Lighthouse audit, perf/a11y eşiğin altına düşerse PR red
    ... (npm audit, CI, e2e)
.husky/
  pre-commit             → Backend tsc + frontend lint-staged
.lintstagedrc.cjs        → Staged JS/JSX dosyaları için ESLint
docs/
  observability/slo.md   → SLO hedefleri + error budget
  ops/graceful-shutdown.md
```

## Domain Sözlüğü

- **Test (ExamTest):** Satılabilir sınav paketi. Alanlar: `title`, `description`, `priceCents`, `durationMinutes`, `questions[]`. Para `Int` cents olarak saklanır.
- **TestPackage:** Birden fazla Test'i bir araya getiren paket. `maxTestsPerPackage` admin ayarı ile sınırlandırılır.
- **ExamQuestion (Soru):** Teste ait çoktan seçmeli soru. Alanlar: `content`, `options[]`, `solutionText`.
- **TestAttempt (Deneme):** Kullanıcının bir sınavı çözme oturumu.
- **User:** Rol `CANDIDATE | EDUCATOR | ADMIN | WORKER`. Educator sınav yazar ve satar. **AUTHOR ve STUDENT terimleri kullanılmaz** — `EDUCATOR` ve `CANDIDATE`.
- **Purchase:** Kullanıcı-Test ilişkisi, ödeme kaydı.
- **AdminSettings:** Admin panelinden yönetilen global ayarlar (komisyon, içerik limitleri, kill-switch'ler, yedekleme zamanlayıcısı).
- **BackupLog:** Veritabanı yedekleme sonuçlarının audit log kaydı.
- **DiscountCode:** Eğitici veya admin'in oluşturduğu, **adayın paket satın alırken** kullandığı indirim kodu. `createdById` kapsamı belirler: **eğitici kodu** (`createdById = educatorId`) yalnızca o eğiticinin paketlerinde, %50 üst sınırla; **admin kodu GLOBAL** (`createdById = null`) herhangi bir teste/pakete uygulanır, eğiticiye bağlı değil, 1-100 serbest. `PurchaseUseCase` + `ValidateDiscountCodeUseCase` eşleşmesi `OR: [{createdById: educatorId}, {createdById: null}]` ile birebir hizalı. `usedCount` artırma `PurchaseUseCase` transaction'ı içinde race-safe (`updateMany ... lt: maxUses`). **Çapraz benzersizlik:** kod string'i `PlatformPromoCode` ile aynı olamaz (`CODE_EXISTS_AS_PROMO`/`CODE_EXISTS_AS_DISCOUNT`).
- **PlatformPromoCode / PlatformPromoCodeUsage:** Sprint 15 — Admin-issued promo kodu; eğiticinin canlı test (LiveSession) veya reklam paketi (AdPurchase) satın almasında kullanılır. `DiscountCode`'tan AYRI bir model. `scopes: PlatformPromoScope[]` (`LIVE_SESSION` | `AD_PACKAGE`) kodun hangi satın almada geçerli olduğunu belirler. Usage her satın alma için `@@unique([promoCodeId, purchaseId])` ile tek satır. `LiveSession` ve `AdPurchase` modellerinde 3 snapshot kolonu (`paidCents`, `platformPromoCodeId`, `platformPromoDiscountCents`) audit/TKHK kanıt zinciri.
- **AdPackage / AdPurchase:** Reklam paketi ve satın alma kaydı.
- **Tenant:** Multi-tenant foundation; her veri kaydı `tenantId` ile bir tenant'a bağlı.
- **Subscription:** Tenant/educator aboneliği. `tier` (FREE…), `status`, `providerRef` (Stripe Subscription ID), `customerRef`, trial ve `currentPeriodStart/End`, `cancelAtPeriodEnd`. Enum'lar: `SubscriberKind`, `SubscriptionTier`, `SubscriptionStatus`.
- **PaymentSettings:** Admin panelinden yönetilen ödeme yapılandırması (test/live mode, Iyzico/GooglePay/AmazonPay anahtarları, şirket fatura bilgileri). Tek satırlık singleton (`id = 1`).
- **WebhookEvent:** Ödeme sağlayıcı webhook'larının idempotent işlenmesi için **replay koruması**. `@@unique([provider, providerEventId])` — aynı event ikinci kez işlenmez.
- **IdempotencyKey:** Para akışlı POST/PUT isteklerinde çift işlem koruması. `@@unique([userId, route, key])`. Çalışma zamanında Redis kullanılır (24h TTL, 60s lock); model kalıcı kayıt/audit içindir.
- **UserDevice:** Kullanıcının giriş yaptığı cihazlar. `fingerprint`, `trusted`, `trustToken`. Yeni/bilinmeyen cihazda uyarı e-postası tetiklenir (`NotifyNewDeviceLogin`).
- **Moderation (AI içerik moderasyonu):** `ModerationResult` (içerik tarama sonucu), `BlockedTerm` (yasaklı terim listesi), `ModerationViolation` (ihlal kaydı), `ModerationAction` (uygulanan yaptırım), `EducatorRiskScore` (eğitici risk skoru). Enum'lar: `ModerationStatus`, `ModerationCategory`, `ModerationProvider`, `EducatorRiskLevel`, `ModerationActionType`.
- **Tunnel (Tünel — adaptif ustalık öğrenme):** TestPackage'dan **ayrı** satış+çözme modülü. Eğitici katmanlı (kolay→zor) tünel yazar; aday satın alıp adaptif çözer — her soru 5 seçenekle (1 doğru + 4 çeldirici, doğru hep içeride, yeri değişken) gelir, bir soru **3 farklı pozisyonda** doğru → "öğrenildi", tüm katmanlar bitince tamamlanır. 9 model: `Tunnel`, `TunnelLayer`, `TunnelQuestion`, `TunnelOption`, `TunnelPurchase` (`@@unique[candidateId,tunnelId]`, indirim+TKHK snapshot), `TunnelAttempt` (`baseLayer/upperOpen/streakCount/current*`), `TunnelQuestionProgress` (`correctMask` bitmask, monoton ustalık), `TunnelReview` (`@@unique[tunnelId,candidateId]`, satın alma kapılı), `TunnelQuestionReport`. Enum: `TunnelStatus` (DRAFT/PENDING_APPROVAL/PUBLISHED/REJECTED), `TunnelAttemptStatus`. `layerCount/optionsPerQuestion/advanceStreak` AdminSettings'ten oluşturma-anı snapshot. Adaptif motor `use-cases/tunnel/engine.ts` (saf, `WINDOW_SIZE=5`, `REQUIRED_CORRECT=3`). Domain detayı: `exam-domain` skill.

## Komutlar

```bash
# Backend
cd apps/backend
npm run dev           # tsx watch ile geliştirme
npm test              # Jest unit testleri
npm run db:migrate    # prisma migrate dev

# Frontend
cd apps/frontend
npm run dev           # Vite dev server
npm test              # Vitest
npm run lint          # ESLint
npm run typecheck     # tsc --noEmit (jsconfig.json)
npm run test:e2e      # Playwright — desktop + mobile-360 + mobile-iphone projeleri
npm run test:e2e -- --project=mobile-360 e2e/specs/mobile-a11y.spec.ts
npm run pwa:icons     # public/pwa-source.svg → 32/180/192/512 PNG üret
ANALYZE=1 npm run build  # dist/stats.html bundle treemap
npx lhci autorun --config=./lighthouserc.json  # Lighthouse CI manuel koşum

# Güvenlik
cd apps/backend && npm audit --audit-level=high
cd apps/frontend && npm audit --audit-level=high
```

## Kodlama Kuralları

**Backend**
- Controller ince — yalnızca HTTP ↔ UseCase köprüsü. İş mantığı Use Case'te.
- Her endpoint için `Use Case` sınıfı — domain alt klasörüne yaz: `apps/backend/src/application/use-cases/<domain>/<AdUseCase>.ts` (örn. `discount/CreateDiscountCodeUseCase.ts`).
- DTO'lar `class-validator` ile, her endpoint için ayrı. Her query/body param için en az bir validator zorunlu.
- Prisma query'leri yalnızca Repository veya Use Case içinde — controller'da direkt Prisma yasak.
- **Read/Write ayrımı:** Admin raporları ve "stale tolerated" listeler `prismaRead()` ile replica'dan; transactional işlemler (purchase, attempt submit, audit) primary `prisma`'dan. Detay: `infrastructure/database/dbRouter.ts`.
- **Select discipline:** Liste endpoint'lerinde `findMany({ select: { ... } })` ile sadece UI'ın gösterdiği alanlar çekilir. `include: true` çıplak yasak.
- **Cursor pagination:** Büyüyebilen listelerde `cursor + take`, offset (`skip`) değil.
- **Composite index:** Yeni WHERE + ORDER BY kombinasyonu için `@@index([equality, range_or_sort, tie_breaker])` ekle.
- **Full-text search:** Arama endpoint'lerinde `ILIKE '%...%'` yerine `tsvector` + GIN.
- Birden fazla tablo değişiyorsa `prisma.$transaction`.
- Async fonksiyonlar `try/catch` yerine NestJS exception filter'a güvensin.
- **Circuit breaker:** 3. taraf servis çağrıları (Stripe, Iyzico, Brevo, Turnstile, Google OAuth) `breakerFor('<name>', { timeout, fallback })` ile sarmalanır — `infrastructure/resilience/circuitBreaker.ts`. DB/Redis için breaker YOK (Prisma/ioredis kendi retry'ını yapar).
- **Görsel yükleme:** `upload.controller.ts` Sharp pipeline'ından geçer (`application/services/image/ImageProcessor.ts`). Origin + 320w/640w/1024w WebP + 96px thumbnail diske yazılır; response `responsive: { srcset, sizes, thumb, width, height }` döner. EXIF strip + auto-rotate + magic byte validation zorunlu — controller'da `validateImageUpload()` çağrısı atlanamaz.
- **Graceful shutdown:** Yeni provider `OnModuleDestroy` implement etmeli (DB/Redis pool/cron); cross-cutting concern'ler `GracefulShutdownService`'te (`Prisma $disconnect` + `RedisCache.quit()` + `Sentry.flush()`). `main.ts` `app.enableShutdownHooks()` zorunlu.
- **Metrik:** Yeni iş kuyruğu, breaker veya hot-path için `infrastructure/metrics/` registry'sine counter/histogram ekle. Grafana dashboard (`infra/helm/sinavsalonu/grafana-dashboards/`) ve `PrometheusRule` alert template'lerini güncelle.

**Frontend**
- Fonksiyonel component, named export. Varsayılan export yok. **İstisna:** `pages/` altındaki sayfalar React.lazy için default export verir.
- API çağrıları yalnızca `dalClient.js` üzerinden — component'te direkt `fetch`/`axios` yasak.
- Sayfalar `apps/frontend/src/pages/` altında; her route bir `.jsx` dosyası.
- Yeni sayfa **lazy import** ile `pages.config.js`'e kayıt: `lazy(() => import('./pages/X'))`.
- Rol kontrolü `apps/frontend/src/lib/routeRoles.js` ile merkezi yapılır.
- Tailwind utility-first. Dinamik class ismi üretme (`bg-${color}-500`) yasak.
- **Dark mode:** Renkli her utility için `dark:` karşılığı (`bg-white dark:bg-gray-900`). `<ThemeProvider>` App.jsx'te kurulu, persistency `next-themes` ile.
- **Accessibility:** Semantic HTML, `<label htmlFor>` / `aria-label`, focus-visible ring, ikon-only buton'da `aria-label`. Yeni sayfa için `e2e/specs/a11y.spec.ts`'e test ekle. **Mobil (360px) için `e2e/specs/mobile-a11y.spec.ts`** — touch target ≥ 40×40, yatay scroll yok.
- **Görsel kullanımı:** Backend `/upload/image` `responsive` payload'unu döner — `<ResponsiveImage>` ile bas: srcset (320w/640w/1024w WebP) + sizes + `loading="lazy"` + `decoding="async"`. Hero için `priority` prop'u eager + `fetchpriority=high` yapar. Hardcoded `<img src>` üretme.
- **i18n:** Kullanıcıya görünen tüm metinler `t('namespace:key')` ile; **5 dile (tr/en/es/zh/de) anahtarı senkron ekle.** Tek dile ekleyip diğerlerini atlamak yasak.
- **PWA:** `vite-plugin-pwa autoUpdate` aktif. `manifest.webmanifest` + `sw.js` build çıktısı. Yeni ikona ihtiyaç varsa `public/pwa-source.svg` güncellenip `npm run pwa:icons` çalıştırılır. Service worker runtime caching: fonts/uploads cache-first, marketplace API network-first (4s timeout). `setupPwa()` `main.jsx`'te çağrılır.
- **Bundle discipline:** Heavy lib (>100 KB) sayfa açılışında gerekli **değilse** `await import(...)` ile dinamik yükle (örnek: `xlsx`, `html2canvas`, `recharts`, `jspdf`). Yeni vendor lib eklerken `vite.config.js` `manualChunks`'a uygun grubu seç (react/radix/query/i18n/icons/analytics/form/date) — entry chunk'a yeni vendor yüklemek yasak.
- **Touch target ≥ 40×40:** Tüm interaktif elementler (buton, link, ikon-buton) en az 40×40 px. `<Button>` component'i variantları zaten garanti eder (`default h-10`, `sm h-8 min-h-10`, `lg h-11`, `icon h-10 w-10`). Custom `<button>` veya `<a>` yazıyorsan `min-h-10 min-w-10` veya `p-2.5` ekle. CI `mobile-a11y.spec.ts` strict — 40px altı eleman PR'ı kırar.

**Genel**
- Türkçe/İngilizce: kod İngilizce, UI Türkçe, yorumlar Türkçe olabilir.
- Pre-commit hook otomatik çalışır: backend `tsc --noEmit` + frontend ESLint (staged dosyalar).
- Dependabot haftalık + CI `npm audit` (high/critical) PR'ı kırar.

## Yeni Özellikler (son eklenenler)

- **Yedekleme zamanlayıcısı:** Admin panelinden saat ve dizin seçilerek otomatik `pg_dump` → gzip yedekleme.
- **Kopya soru tespiti:** Eğitici soru girerken (blur), Jaccard benzerliği ≥ %75 ise amber uyarı.
- **Nginx (CSP):** Frontend `Content-Security-Policy-Report-Only` başlığıyla sunulur.
- **Cursor pagination + composite index disiplini:** Büyüyebilen tüm listeler cursor tabanlı, sıralama anahtarları indexed.
- **tsvector full-text search:** Test/Educator/Topic isim aramaları için GIN-indexed `searchVector`.
- **Frontend code splitting:** `pages.config.js` `React.lazy` ile route-bazlı chunk; ilk yüklemede 47 sayfa indirilmiyor.
- **Dark mode:** `next-themes` ile aktif, `<html class="dark">` toggle, localStorage persist.
- **A11y testleri:** Playwright + axe-core ile kritik sayfalar WCAG 2.1 AA bekçisinde.
- **Canlı sınav (LiveSession):** Educator oturum oluşturur/yönetir; candidate koda girerek katılır, soruları cevaplar. HTTP polling (2s) + heartbeat (15s). 6 yeni Prisma modeli: `LiveSessionTier`, `LiveSession`, `LiveQuestion`, `LiveOption`, `LiveParticipant`, `LiveAnswer`.
- **Use-case domain refaktörü:** Use-case'ler `application/use-cases/` altında domain alt klasörlerine taşındı. Başlangıçta 17 domain (auth, educator, test, question, attempt, purchase, refund, discount, review, objection, ad, package, live, admin, contract, report, notification); sonradan `billing` ve `moderation` eklenerek 19, ardından `tunnel` ile **20 domain** oldu.
- **Sentry hata izleme:** Backend `src/instrument.ts` + `HttpExceptionFilter` (5xx → captureException); frontend `main.jsx` + `ErrorBoundary`. DSN yoksa devre dışı. Sample rate prod'da %10. PII filtresi: authorization ve cookie header'ları event'ten kaldırılır.
- **Bundle analyzer:** `ANALYZE=1 npm run build` → `dist/stats.html` treemap. CI'da `frontend_build` job'ı artifact yükler.
- **settings.local.json wildcard izinler:** `Bash(*) PowerShell(*) Read(*) Write(*) Edit(*) Glob(*) Grep(*)` — yerel araçlarda onay istenmez.
- **Abonelik & ödeme (Stripe + Iyzico):** `use-cases/billing/` — checkout başlatma, Stripe customer portal linki, abonelik sorgulama, Stripe/Iyzico webhook handler'ları. `Subscription` + `PaymentSettings` modelleri. Webhook imzaları `verifyWebhookSignature.ts` ile doğrulanır (Stripe HMAC-SHA256 + 5dk tolerans, Iyzico SHA-1 base64, `timingSafeEqual`).
- **Webhook replay koruması:** `WebhookEvent` modeli `@@unique([provider, providerEventId])` ile aynı sağlayıcı event'inin iki kez işlenmesini engeller (idempotent webhook).
- **IdempotencyKey interceptor:** `nest/interceptors/idempotency.interceptor.ts` — para akışlı POST/PUT'larda `Idempotency-Key` header'ı ile "ağ retry → çift fatura" hatasını önler. Redis tabanlı: completed response 24h cache'lenir, in-progress lock 60s, body hash uyuşmazlığında 409.
- **AI içerik moderasyonu:** `use-cases/moderation/` (17 use-case) — soru içeriği AI ile taranır (`ModerateQuestionContent`, `ProcessModerationJob`), yasaklı terim listesi, ihlal kaydı, yaptırım uygulama ve eğitici risk skoru. `ModerationResult`, `BlockedTerm`, `ModerationViolation`, `ModerationAction`, `EducatorRiskScore` modelleri.
- **2FA (iki faktörlü doğrulama):** `use-cases/auth/` — `SetupTwoFactorUseCase`, `DisableTwoFactorUseCase`, `VerifyTwoFactorLoginUseCase`.
- **Yeni cihaz uyarısı (UserDevice):** Girişlerde cihaz parmak izi takip edilir; bilinmeyen cihazda `NotifyNewDeviceLoginUseCase` ile uyarı e-postası, `VerifyDeviceUseCase` ile güven token'ı. `UserDevice` modeli.
- **i18n (çoklu dil):** `frontend/src/lib/i18n.js` — react-i18next + LanguageDetector. Diller: tr/en/es/zh/de. Namespace'ler: common/auth/pages/onboarding. Çeviriler `src/locales/<lang>/<namespace>.json`.
- **Frontend ürün analitiği:** `frontend/src/lib/analytics.js` — PostHog wrapper (EU host). `track`/`identify`/`reset`. KVKK/GDPR uyumu: consent verilmeden PII gönderilmez, session replay default kapalı + opt-in.
- **Helm / Kubernetes deploy:** `infra/helm/sinavsalonu/` — backend/frontend/worker deployment, configmap, secret, migration-job, ingress template'leri. Docker Compose'a ek olarak K8s'e deploy için.

### Sprint 10 — Production sertifikasyonu

- **Graceful shutdown:** `nest/services/graceful-shutdown.service.ts` — `OnApplicationShutdown` ile SIGTERM yakalanır, sırasıyla Prisma `$disconnect` (5s timeout) → Redis `quit()` (3s) → Sentry `flush()` (2s) çalıştırılır. `main.ts` `app.enableShutdownHooks()` + SIGTERM log handler. K8s `terminationGracePeriodSeconds: 30` + `preStop sleep 5` beklenir.
- **Circuit breaker (opossum):** `infrastructure/resilience/circuitBreaker.ts` — named breaker registry. `breakerFor('stripe', { timeout, errorThresholdPercentage, resetTimeout, fallback })`. State: CLOSED/OPEN/HALF_OPEN. Stripe, Iyzico, Brevo, Turnstile, Google OAuth için kullanılır. State değişimleri prom-client metric'ine yansır (`circuit_breaker_state{name}`).
- **Prometheus / Grafana stack:** `infra/helm/sinavsalonu/templates/servicemonitor.yaml` (Prometheus Operator CRD) + `prometheusrule.yaml` (8 SLO alert: HighLatencyP95, VeryHighLatencyP99, ElevatedErrorRate, CriticalErrorRate, PaymentWebhookFailures, ReplicaLagHigh, CircuitBreakerOpen, EmailQueueBacklog, PodRestartingFrequently). Grafana dashboard JSON: `grafana-dashboards/sinavsalonu-overview.json` (7 panel).
- **Read replica routing:** `infrastructure/database/dbRouter.ts` `prismaRead()` — admin raporları (`GetCommissionReportUseCase`, `GetCandidateReportUseCase`) replica'dan; transactional işlemler primary'den. Replica lag toleranslı endpoint'ler için.
- **SLO dokümantasyonu:** `docs/observability/slo.md` (140 satır, error budget hesabı), `docs/ops/graceful-shutdown.md`.

### Sprint 11 — Mobil UX + performans

- **Brotli compression:** `infra/docker/frontend.Dockerfile` Alpine edge community'den `nginx-mod-http-brotli` paketini kurar, `/etc/nginx/modules-enabled/00-brotli-*.conf` ile module load eder. `infra/nginx/default.conf.template`: `brotli on / brotli_static on / brotli_comp_level 5`. Vite tarafı `vite-plugin-compression2` ile build sırasında `.br` + `.gz` dosyaları üretir (threshold 1024B) — nginx `brotli_static + gzip_static` runtime sıkıştırma yapmadan servisler.
- **Sharp image pipeline:** `application/services/image/ImageProcessor.ts` — origin (rotate + EXIF strip + sRGB normalize) + 320w/640w/1024w WebP + 96×96 thumbnail. GIF pass-through (animasyon korunur). `upload.controller.ts` `validateImageUpload` + opsiyonel ClamAV + `processImage()` zinciri. Response shape: `{ url, filename, responsive: { srcset, sizes, thumb, width, height }, variants[] }`. Frontend `<ResponsiveImage>` (`components/ui/ResponsiveImage.jsx`) bu payload'u doğrudan `<img srcset>` + `loading=lazy + decoding=async` ile basar; `priority` prop'u hero için `eager + fetchpriority=high`.
- **PWA + service worker:** `vite-plugin-pwa` (`registerType: 'autoUpdate'`). Manifest plugin tarafından üretilir (`dist/manifest.webmanifest`). Workbox runtime caching: fonts cache-first 30d, `/uploads/` cache-first 30d, marketplace API network-first 4s timeout. Navigation fallback `/index.html` (offline shell), API path'leri denylist. Icons: `public/pwa-source.svg` → `npm run pwa:icons` (`scripts/generate-pwa-icons.mjs` Sharp ile 32/180/192/512 PNG üretir). `src/lib/pwa.js` `setupPwa()` + online/offline event'leri; `main.jsx`'te çağrılır.
- **Lighthouse CI:** `apps/frontend/lighthouserc.json` — 4 URL × 3 run. Thresholds: Performance ≥ .85 (error), Accessibility ≥ .95 (error), Best Practices ≥ .9 (warn), SEO ≥ .85 (warn). LCP < 2500ms, CLS < .1, TBT < 300ms. `.github/workflows/lighthouse.yml` PR + main push trigger, artifact 30 gün.
- **360px mobile viewport:** `playwright.config.js` 3 project: `desktop` / `mobile-360` (Galaxy S5) / `mobile-iphone` (iPhone 12). `e2e/specs/mobile-a11y.spec.ts` her sayfa için axe-core WCAG AA + yatay scroll yok + touch target ≥ 40×40 + skip-link Tab erişimi (26 test × 2 mobil project).
- **Onboarding wizard + activation analytics:** `components/onboarding/OnboardingTour.jsx` `tourKey` + `persona` prop'ları, PostHog event'leri: `onboarding_tour_started`, `onboarding_tour_step_viewed` (her adımda), `onboarding_tour_completed`, `onboarding_tour_skipped`. Activation funnel drop-off oranı PostHog dashboard'da görünür. `CANDIDATE_WELCOME` ve `EDUCATOR_WELCOME` 4 → 5 adıma genişledi (aday: skor takibi; eğitici: reklam + indirim kodu). 5 dilde (`s4`) çeviri.

### Sprint 12 — Performance polish

- **Bundle code-split:** `apps/frontend/vite.config.js` `build.rollupOptions.output.manualChunks` — 8 vendor grup (react / radix / query / i18n / icons / analytics / form / date). Vendor chunk'lar stable hash → tekrar ziyarette sadece değişen entry indirilir. **Sprint 11 sonu 1117 KB / 354 KB gzip entry → Sprint 12 sonu 496 KB / 159 KB gzip** (vendor'lar ayrı + cached). `xlsx` (429 KB) ve `html2canvas` (202 KB) ihtiyaç anında `await import(...)` ile yüklenir (`MyResults`, `MyTestPackages`, `AdminCommissionReport` handler'ları).
- **AVIF varyantları (Sharp pipeline):** `ImageProcessor.ts` her responsive width için WebP + AVIF iki encode (320w/640w/1024w × 2). Thumbnail tek format (WebP — küçük boyutta AVIF avantajı yok). AVIF config: `quality=60, effort=4` (WebP q=80'e eşdeğer kalite). `buildImageUrls()` `srcsetWebp` + `srcsetAvif` ayrı stringler; `srcset` legacy alias. `<ResponsiveImage>` `<picture><source type="image/avif"><source type="image/webp"><img>` fallback chain'i kurar. **AVIF destekli tarayıcıda mobil byte ~%30 azalır** (320w: 80 KB → 50 KB). AVIF encode WebP'ye göre ~12x yavaş; yüksek upload hacminde Phase 3'te BullMQ worker'a taşınacak.
- **Strict touch target:** `Button` component variantları yeniden boyutlandı — `default h-9 → h-10` (40px), `sm h-8 → h-8 min-h-10` (görsel kompakt, hit area 40), `lg h-10 → h-11` (44px Apple HIG), `icon h-9 w-9 → h-10 w-10` (40×40). Tek edit ile 110+ buton kullanımı düzeldi. Carousel prev/next + Sidebar trigger override'ları da 40×40. `mobile-a11y.spec.ts` artık **strict** (`expect(violations).toEqual([])`) — yeni component 40px altında buton üretirse CI kırılır. WCAG 2.5.5 "Target Size" Level AAA-near uyumlu.

### Sprint 14 — Sözleşme onayı zorunluluğu

Kayıt + satın alma + eğitici onboarding akışlarında yasal sözleşme onayı uygulama katmanından zorlanır. KVKK + TKHK + TBK gereksinimlerini karşılar (placeholder metinler, **production öncesi avukat onayı zorunlu**).

- **Schema:** `ContractType` enum'una `PRIVACY` + `DISTANCE_SALE` eklendi (önceden CANDIDATE + EDUCATOR vardı). `Purchase` modeline mesafeli satış acceptance snapshot alanları: `distanceSaleContractId`, `distanceSaleAcceptedAt`, `distanceSaleAcceptedIp`, `distanceSaleAcceptedUserAgent` — her satın alma satırı kendi içinde TKHK m.48 kanıt zinciri taşır. Migration: `20260528200000_sprint14_contract_extensions`.
- **Seed (`SeedService.seedLegalContracts`):** Her sistem boot'unda `docs/legal/*.md` markdown dosyaları okunur ve 4 contract idempotent upsert edilir (`CANDIDATE/PRIVACY/DISTANCE_SALE/EDUCATOR`, hepsi version 1, isActive=true). Admin paneli runtime'da yeni versiyon yayımlayabilir.
- **RegisterUseCase:** `acceptedTermsContractId` + `acceptedPrivacyContractId` zorunlu (DI verilmişse). Aktif contract ID'leri ile karşılaştırır; eşleşmezse 400 `TERMS_NOT_ACCEPTED`. Backward compatible — DI verilmezse contract kontrolü atlanır (test ortamı).
- **RegisterEducatorUseCase:** Aynı pattern + EDUCATOR sözleşmesi de zorunlu (`acceptedEducatorContractId` + `acceptedPrivacyContractId`). 2 acceptance kaydı (EDUCATOR + PRIVACY) IP/UA delili ile yazılır.
- **PurchaseUseCase:** `ctx.acceptedDistanceSaleContractId` zorunlu — aktif DISTANCE_SALE contract ID ile eşleşmezse 400. Purchase satırına snapshot olarak yazılır (contract ID + acceptedAt + IP + UA).
- **Frontend:**
  - `Register.jsx` 2 zorunlu checkbox (Üyelik + KVKK; eğitici mode'da Üyelik → Eğitici Hizmet). `contracts.getActive()` mount'ta fetch, submit butonu kabul olmadan disabled.
  - `PaymentModal.jsx` "Mesafeli Satış Sözleşmesi'ni onaylıyorum" checkbox + sözleşmeye yeni sekmede link. Hem ücretli hem ücretsiz akışta zorunlu.
  - `LegalDocument.jsx` + route `/sozlesmeler/:slug` (4 slug: `uyelik`, `kvkk`, `mesafeli-satis`, `egitici-hizmet`) — public sayfa, markdown render.
  - `dalClient.contracts.getActive(type)` + `.accept(contractId)` API metodları.
- **Yasal metinler:** `docs/legal/` altında 4 markdown şablon dosya — her birinin başında ⚠️ "ŞABLON METİN — AVUKAT ONAYI GEREKLİ" uyarısı. README'de production checklist + KVKK/TKHK kapsamı.
- **Test:** Backend `auth-register.test.ts` 6 → 11 test (5 yeni Sprint 14 case'i: backward compat, missing ID, mismatch, success path, unavailable contract). Frontend `Register.test.jsx` + `PaymentModal.test.jsx` mock'lar `contracts.getActive` ekledi; helper `acceptContract()`/`acceptContracts()` zorunlu adımı simüle eder. 215/215 frontend + 11/11 register pass.

### Sprint 15 — İndirim kodu kullanım akışı (3 kademe)

Her satın alma türünde indirim kodu girişi tam-akış: backend doğrulama + atomik usedCount + denormalize snapshot, frontend "Uygula/Kaldır" deneyimi. **3 kademe:**

- **Kademe 1 — Aday paket (`DiscountCode`, eğitici → aday):** `ValidateDiscountCodeUseCase` aday "Uygula" tıklayınca kodu doğrular: paket sahipliği (`DiscountCode.createdById === TestPackage.educatorId`), aktiflik, tarih penceresi, usage limit. Hata kodları: `DISCOUNT_NOT_FOUND/NOT_ACTIVE/NOT_OWNED/OUT_OF_WINDOW/USAGE_EXHAUSTED`. `usedCount` artırma asıl `PurchaseUseCase` transaction'ı içinde race-safe (`updateMany ... lt: maxUses`). %50 indirim üst sınırı clamp. UI: `PaymentModal.jsx` `<DiscountCodeInput>` (input + Uygula butonu / applied badge + Kaldır). Endpoint: `POST /discounts/validate` (CANDIDATE rolü).
- **Kademe 2 — Eğitici canlı test (`PlatformPromoCode`, admin → eğitici, scope `LIVE_SESSION`):** Admin panelinden `ManagePromoCodes.jsx` ile CRUD; eğitici `LiveSessionCreate.jsx` ödeme modalında kodu girer → `ValidatePlatformPromoCodeUseCase` (`POST /platform-promo-codes/validate`) doğrular, başarılıysa indirimli fiyat ve "Uygula/Kaldır" durumu UI'da. Ödeme `liveApi.pay(id, { promoCode })` → `PayLiveSessionUseCase` `$transaction` içinde atomik `updateMany ... lt: maxUses` + `PlatformPromoCodeUsage` (unique `[promoCodeId, purchaseId]`) + `LiveSession` snapshot (`paidCents`, `platformPromoCodeId`, `platformPromoDiscountCents`).
- **Kademe 3 — Eğitici reklam paketi (`PlatformPromoCode`, scope `AD_PACKAGE`):** Aynı pattern; eğitici `MyAds.jsx` satın alma sekmesinde paket seç → promo gir → `PurchaseAdUseCase` 5. parametre olarak `promoCode`. `AdPurchase` snapshot 3 kolonu (`paidCents`, `platformPromoCodeId`, `platformPromoDiscountCents`). Paket değiştirildiğinde uygulanmış promo otomatik reset (fiyat değişebilir).
- **Schema:** `PlatformPromoCode` (code, percentOff 1-100, scopes[] enum, maxUses opsiyonel, validFrom/Until opsiyonel, isActive, createdById, usedCount), `PlatformPromoCodeUsage` (`@@unique([promoCodeId, purchaseId])`). Enum: `PlatformPromoScope` (`LIVE_SESSION` | `AD_PACKAGE`). Migration: `20260529100000_sprint15_platform_promo`.
- **Use case'ler:** `application/use-cases/platform-promo/` (5 use case: Create/List/Toggle/Delete/Validate). `discount/` klasörüne `ValidateDiscountCodeUseCase` eklendi (mevcut 5 use case → 6).
- **Frontend:** `pages/ManagePromoCodes.jsx` admin CRUD; `pages/LiveSessionCreate.jsx` + `pages/MyAds.jsx` eğitici "promo uygula" UI; `components/ui/PaymentModal.jsx` aday "indirim uygula" UI. dalClient: `platformPromoCodes` namespace (list/create/toggle/delete/validate) + `discounts.validate`. `routeRoles.js`: `ManagePromoCodes: [ROLES.ADMIN]`.
- **Test:** 6 yeni Jest suite + 66 unit test (`tests/usecases/platform-promo/` 5 dosya + `tests/usecases/discount/ValidateDiscountCodeUseCase.test.ts`). Coverage: validation hataları, sahiplik, tarih penceresi, usage limit, küçük→büyük harf normalize, atomik race senaryoları, audit log best-effort. 66/66 pass.
- **TKHK + audit kanıt zinciri:** Her satın alma satırı kendi promo bilgisini snapshot olarak taşır (`paidCents/platformPromoCodeId/platformPromoDiscountCents` — LiveSession/AdPurchase'ta; `discountCodeId/discountAmount` — Purchase'ta). Promo silinse bile raporlama bozulmaz.

### Tünel modülü — adaptif ustalık öğrenme (v1.7.0)

Gamified, **TestPackage'dan ayrı** satış+çözme modülü. Eğitici katmanlı (kolay→zor) tünel yazar, onaya gönderir; admin onaylar; aday keşfeder/satın alır/adaptif çözer/değerlendirir.

- **Adaptif motor (`use-cases/tunnel/engine.ts`, saf):** Her soru 5 seçenekle (1 doğru + 4 rastgele çeldirici) gelir; doğru şık **her zaman içeride** ama yeri değişken. Bir soru **3 farklı pozisyonda** doğru cevaplanınca "öğrenildi" (`correctMask` bitmask, monoton). Tabanda `advanceStreak` kez üst üste doğru → üst katman açılır; taban yanlış → üst kapanır + streak sıfır. Taban katman bitince yukarı kayar, tüm katmanlar bitince `COMPLETED`.
- **9 Prisma modeli + migration `20260614190000_tunnel_review`** (TunnelReview eklenmesi). `layerCount/optionsPerQuestion/advanceStreak` AdminSettings'ten oluşturma-anı snapshot.
- **Akış:** DRAFT → PENDING_APPROVAL → PUBLISHED/REJECTED. Aday satın alma indirim kodu (%50 eğitici clamp / global clamp yok) + mesafeli satış sözleşmesi (TKHK) ile; çözme/değerlendirme/rapor/hata bildirimi **aktif satın alma** gerektirir.
- **Frontend:** Keşfet & Satın Aldıklarım'da **Tüneller sekmesi** (paylaşılan `TunnelGrid`, tek-satır filtre), TestDetail uyumlu `TunnelDetail` (Eğitici kartı + Özellikler + satış sayısı + yorum/puan), `TakeTunnel` (anti-kopya + filigran + tek güneş ikonlu bej mod), `MyResults` tünel raporu. dalClient `candidateTunnels` namespace.
- **Test:** tünel use-case kapsamı **%82** (engine + review + meta + discount + play + CRUD; `tests/usecases/tunnel/` 8 suite). Domain tek-kaynak: `exam-domain` skill.

## Delege Rehberi

| Task tipi | Agent |
|---|---|
| Kod inceleme / PR review | `code-reviewer` |
| Güvenlik denetimi (OWASP / yetki sızıntısı / PII / secret leakage / audit log eksikliği / idempotency açıkları / multi-tenant izolasyon) | `security-auditor` |
| Unit/integration test | `test-writer` |
| Playwright e2e test (a11y dahil) | `e2e-writer` |
| Yeni sayfa, form, UI bileşeni | `ui-builder` |
| Yeni endpoint, şema, Use Case, cursor pagination, tsvector | `backend-architect` |
| Duplikasyon temizliği, isim refaktörü | `refactor-specialist` |
| Mimari karar, kütüphane seçimi | `advisor` |

## Slash Komutlar

- `/ship "<commit-mesajı>"` — typecheck + lint + test + commit + push zinciri

## İmportlar

@.claude/skills/exam-domain/SKILL.md           <!-- domain modeli detayları -->
@.claude/skills/pagination/SKILL.md             <!-- cursor pagination pattern -->
@.claude/skills/full-text-search/SKILL.md       <!-- tsvector + GIN -->
@.claude/skills/accessibility/SKILL.md          <!-- axe-core + WCAG + mobil viewport + touch target -->
@.claude/skills/i18n/SKILL.md                   <!-- 5 dil (tr/en/es/zh/de) senkron çeviri disiplini -->
@.claude/skills/email-traffic/SKILL.md          <!-- 3 kuyruk + provider fallback + kill switch + SuppressedEmail -->
@.claude/skills/payment-domain/SKILL.md         <!-- Stripe + Iyzico + webhook imza + replay koruması -->
@.claude/skills/idempotency/SKILL.md            <!-- Idempotency-Key interceptor + webhook + para akışı çift işlem koruması -->
@.claude/skills/error-handling/SKILL.md         <!-- 500 önleme + HttpExceptionFilter + Prisma error mapping + ApiError -->
@.claude/skills/security-hardening/SKILL.md     <!-- AES-256-GCM secret encryption + audit log + KVKK + secret rotation -->
@.claude/skills/observability/SKILL.md          <!-- SLO + circuit breaker + graceful shutdown + Prometheus -->
@.claude/skills/react-component/SKILL.md        <!-- ResponsiveImage + PWA + lazy + dark mode -->
@.claude/skills/prisma-schema/SKILL.md          <!-- model ekleme + composite index + select discipline + seed -->
@.claude/skills/migration-planner/SKILL.md      <!-- tehlikeli şema değişikliği → aşamalı güvenli migration -->
@.claude/skills/nestjs-module/SKILL.md          <!-- Controller/Service/DTO/Guard/Interceptor iskeleti -->
@.claude/skills/api-contract/SKILL.md           <!-- frontend ↔ backend endpoint kontratı + dalClient -->
@.claude/skills/form-mutation/SKILL.md          <!-- TanStack Query mutation + cache invalidation -->
@.claude/skills/purchase-flow/SKILL.md          <!-- TestPackage satın alma uçtan uca akış -->
@.claude/skills/backward-compatibility/SKILL.md <!-- additive değişiklik + eski yapıyı bozmama disiplini -->
@.claude/skills/tdd-workflow/SKILL.md           <!-- kırmızı/yeşil/refactor + test piramidi + AAA -->
@.claude/skills/coverage-discipline/SKILL.md    <!-- coverage threshold + Codecov + mutation testing -->
@.claude/skills/release-engineering/SKILL.md    <!-- Dependabot + commitlint + CHANGELOG + DORA -->
@.claude/skills/test-all/SKILL.md               <!-- tüm test paketini izole + loglu çalıştırma -->
