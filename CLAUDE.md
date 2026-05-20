# Sinav Salonu

Test marketplace uygulaması. Eğiticiler (educators) sınav (test) oluşturur ve satar; adaylar (candidates) satın alır, çözer, skorlarını takip eder.

## Stack

- **Frontend:** React 18 + Vite, JavaScript (JSX), Tailwind CSS, React Router DOM v6, TanStack Query, next-themes (dark mode)
- **Backend:** NestJS (REST + DTO + Validation), Clean Architecture (Use Cases katmanı)
- **Veritabanı:** PostgreSQL + Prisma ORM (cursor pagination + tsvector full-text search)
- **Test:** Vitest + Testing Library (frontend), Jest (NestJS), Playwright (e2e), @axe-core/playwright (a11y)
- **Paket yöneticisi:** npm (backend ve frontend ayrı `package.json`; kök `package.json` yalnızca Husky + lint-staged içerir)
- **Konteyner:** Docker Compose (geliştirme + üretim + yerel staging)

## Dizin Yapısı (gerçek)

```
apps/
  backend/               → NestJS backend
    src/
      application/
        use-cases/           → İş mantığı buradadır — 17 domain alt klasörüne ayrılmış
          auth/              → Kayıt, giriş, şifre sıfırlama
          educator/          → Eğitici profil, takip
          test/              → Test CRUD, yayımlama, arama
          question/          → Soru & seçenek CRUD
          attempt/           → Deneme başlatma, cevap, submit, timeout
          purchase/          → Satın alma akışı
          refund/            → İade talebi ve yönetimi
          discount/          → İndirim kodu
          review/            → Değerlendirme
          objection/         → İtiraz akışı
          ad/                → Reklam paketi
          package/           → Test paketi CRUD, yayımlama
          live/              → Canlı sınav oturumu
          admin/             → Kullanıcı yönetimi, ayarlar, raporlar
          contract/          → Eğitici sözleşmesi
          report/            → Raporlama
          notification/      → Bildirim tercihleri, digest
        services/        → Yardımcı servisler (ReviewAggregation vb.)
      domain/
        interfaces/      → Repository arayüzleri
        types.ts         → Domain tipleri (AdminSettings vb.)
      infrastructure/
        repositories/    → Prisma repository implementasyonları
        database/        → Prisma client singleton
        cache/           → RedisCache
      nest/
        controllers/     → HTTP katmanı (ince — iş mantığı YOK)
        controllers/dto/ → DTO sınıfları (class-validator)
        guards/          → JWT, Roles, WorkerPermissions
        decorators/      → @Public, @Roles, @WorkerPermissions
        modules/         → NestJS modülleri (cron, vb.)
        services/        → BackupSchedulerService vb. NestJS servisleri
        security/        → CSP builder
    prisma/
      schema.prisma      → Tek şema dosyası
      migrations/        → Numbered migration SQL dosyaları
  frontend/              → React/Vite frontend
    src/
      pages/             → Sayfa bileşenleri (Her route bir dosya, lazy import için default export)
      components/        → Paylaşılan React bileşenleri
        layout/          → Sidebar, Header, Layout, ThemeToggle
        ui/              → Radix UI primitive'leri (shadcn tarzı), Skeleton
        test/            → Test'e özgü bileşenler
        ErrorBoundary.jsx → Root error boundary
      api/
        dalClient.js     → Tüm API çağrıları burada merkezi
      lib/               → Util fonksiyonları, hook'lar
      pages.config.js    → Sayfa-route eşlemesi (React.lazy ile)
      lib/routeRoles.js  → Sayfa bazlı rol erişim kontrolü
      e2e/specs/a11y.spec.ts → axe-core ile a11y testleri
infra/
  docker/
    docker-compose.yml            → Geliştirme ortamı
    docker-compose.prod.yml       → Üretim ortamı
    docker-compose.local-staging.yml → Yerel staging ortamı
    docker-compose.pgbouncer.yml  → PgBouncer connection pooling
    backend.Dockerfile
    frontend.Dockerfile           → Nginx tabanlı (CSP başlıkları dahil)
  nginx/
    default.conf         → CSP-Report-Only, SPA fallback, gzip, asset cache
scripts/
  staging.sh             → Yerel staging ortamı yönetim betiği
.github/
  dependabot.yml         → Otomatik bağımlılık güncelleme (haftalık, gruplu)
  workflows/             → CI/CD (npm audit dahil)
.husky/
  pre-commit             → Backend tsc + frontend lint-staged
.lintstagedrc.cjs        → Staged JS/JSX dosyaları için ESLint
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
- **DiscountCode:** Eğiticinin oluşturduğu indirim kodu.
- **AdPackage / AdPurchase:** Reklam paketi ve satın alma kaydı.
- **Tenant:** Multi-tenant foundation; her veri kaydı `tenantId` ile bir tenant'a bağlı.

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
npm run test:e2e      # Playwright (a11y + akış testleri)

# Yerel Staging (repo kökünden)
./scripts/staging.sh up          # Derle ve başlat
./scripts/staging.sh down        # Durdur
./scripts/staging.sh reset       # DB sıfırla
./scripts/staging.sh logs        # Canlı log

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
- **Select discipline:** Liste endpoint'lerinde `findMany({ select: { ... } })` ile sadece UI'ın gösterdiği alanlar çekilir. `include: true` çıplak yasak.
- **Cursor pagination:** Büyüyebilen listelerde `cursor + take`, offset (`skip`) değil.
- **Composite index:** Yeni WHERE + ORDER BY kombinasyonu için `@@index([equality, range_or_sort, tie_breaker])` ekle.
- **Full-text search:** Arama endpoint'lerinde `ILIKE '%...%'` yerine `tsvector` + GIN.
- Birden fazla tablo değişiyorsa `prisma.$transaction`.
- Async fonksiyonlar `try/catch` yerine NestJS exception filter'a güvensin.

**Frontend**
- Fonksiyonel component, named export. Varsayılan export yok. **İstisna:** `pages/` altındaki sayfalar React.lazy için default export verir.
- API çağrıları yalnızca `dalClient.js` üzerinden — component'te direkt `fetch`/`axios` yasak.
- Sayfalar `apps/frontend/src/pages/` altında; her route bir `.jsx` dosyası.
- Yeni sayfa **lazy import** ile `pages.config.js`'e kayıt: `lazy(() => import('./pages/X'))`.
- Rol kontrolü `apps/frontend/src/lib/routeRoles.js` ile merkezi yapılır.
- Tailwind utility-first. Dinamik class ismi üretme (`bg-${color}-500`) yasak.
- **Dark mode:** Renkli her utility için `dark:` karşılığı (`bg-white dark:bg-gray-900`). `<ThemeProvider>` App.jsx'te kurulu, persistency `next-themes` ile.
- **Accessibility:** Semantic HTML, `<label htmlFor>` / `aria-label`, focus-visible ring, ikon-only buton'da `aria-label`. Yeni sayfa için `e2e/specs/a11y.spec.ts`'e test ekle.

**Genel**
- Türkçe/İngilizce: kod İngilizce, UI Türkçe, yorumlar Türkçe olabilir.
- Pre-commit hook otomatik çalışır: backend `tsc --noEmit` + frontend ESLint (staged dosyalar).
- Dependabot haftalık + CI `npm audit` (high/critical) PR'ı kırar.

## Yeni Özellikler (son eklenenler)

- **Yedekleme zamanlayıcısı:** Admin panelinden saat ve dizin seçilerek otomatik `pg_dump` → gzip yedekleme.
- **Kopya soru tespiti:** Eğitici soru girerken (blur), Jaccard benzerliği ≥ %75 ise amber uyarı.
- **Nginx (CSP):** Frontend `Content-Security-Policy-Report-Only` başlığıyla sunulur.
- **Yerel staging:** `docker-compose.local-staging.yml` + `scripts/staging.sh` ile izole ortam.
- **Cursor pagination + composite index disiplini:** Büyüyebilen tüm listeler cursor tabanlı, sıralama anahtarları indexed.
- **tsvector full-text search:** Test/Educator/Topic isim aramaları için GIN-indexed `searchVector`.
- **Frontend code splitting:** `pages.config.js` `React.lazy` ile route-bazlı chunk; ilk yüklemede 47 sayfa indirilmiyor.
- **Dark mode:** `next-themes` ile aktif, `<html class="dark">` toggle, localStorage persist.
- **A11y testleri:** Playwright + axe-core ile kritik sayfalar WCAG 2.1 AA bekçisinde.
- **Canlı sınav (LiveSession):** Educator oturum oluşturur/yönetir; candidate koda girerek katılır, soruları cevaplar. HTTP polling (2s) + heartbeat (15s). 6 yeni Prisma modeli: `LiveSessionTier`, `LiveSession`, `LiveQuestion`, `LiveOption`, `LiveParticipant`, `LiveAnswer`.
- **Use-case domain refaktörü:** 149 use-case `application/use-cases/` altında 17 domain alt klasörüne taşındı (auth, educator, test, question, attempt, purchase, refund, discount, review, objection, ad, package, live, admin, contract, report, notification).
- **Sentry hata izleme:** Backend `src/instrument.ts` + `HttpExceptionFilter` (5xx → captureException); frontend `main.jsx` + `ErrorBoundary`. DSN yoksa devre dışı. Sample rate prod'da %10. PII filtresi: authorization ve cookie header'ları event'ten kaldırılır.
- **Bundle analyzer:** `ANALYZE=1 npm run build` → `dist/stats.html` treemap. CI'da `frontend_build` job'ı artifact yükler.
- **settings.local.json wildcard izinler:** `Bash(*) PowerShell(*) Read(*) Write(*) Edit(*) Glob(*) Grep(*)` — yerel araçlarda onay istenmez.

## Delege Rehberi

| Task tipi | Agent |
|---|---|
| Kod inceleme / PR review | `code-reviewer` |
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
@.claude/skills/accessibility/SKILL.md          <!-- axe-core + WCAG kuralları -->
@.claude/skills/email-traffic/SKILL.md          <!-- 3 kuyruk + provider fallback + kill switch + SuppressedEmail -->
