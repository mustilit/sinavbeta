# Sınav Salonu — Yazılım Kalite Değerlendirme Raporu

**Proje:** Sınav Salonu (SaaS + Marketplace)
**Stack:** NestJS + Prisma/PostgreSQL + React 18/Vite
**Boyut:** 149 use-case · 45 controller · 35 Prisma modeli · 24 migration · 47 sayfa
**Tarih:** 17 Mayıs 2026
**Değerlendiren:** Mevcut kodbase analizi

---

## Özet Skor Tablosu

| # | Boyut | Durum | Skor |
|---|---|---|---|
| 1 | İşlevsellik | İyi | 8/10 |
| 2 | Güvenilirlik | Orta | 6/10 |
| 3 | Kullanılabilirlik | İyi | 7/10 |
| 4 | Verimlilik / Performans | İyi | 8/10 |
| 5 | Bakım Yapılabilirlik | Çok İyi | 9/10 |
| 6 | Taşınabilirlik | İyi | 8/10 |
| 7 | Güvenlik | İyi | 8/10 |
| 8 | Uyumluluk | Orta | 6/10 |
| 9 | Kod Kalitesi | Çok İyi | 9/10 |
| 10 | Dokümantasyon | Orta | 6/10 |
| 11 | Test Kalitesi | Zayıf | 4/10 |
| 12 | Süreç Kalitesi | İyi | 7/10 |
| 13 | Müşteri Memnuniyeti | Bilinmiyor | N/A |
| 14 | Ekonomik / İş Değeri | Bilinmiyor | N/A |

**Genel Ortalama (12 ölçülebilir boyut):** **7.2 / 10 — "İyi, ama test ve gözlemlenebilirlik tarafı yatırım istiyor"**

---

## 1. İşlevsellik (Functionality)

### Mevcut Durum
- 149 use-case'i 17 domain alt klasörü içinde organize edilmiş (auth, educator, test, question, attempt, purchase, refund, discount, review, objection, ad, package, live, admin, contract, report, notification).
- Tüm marketplace temel akışları kapsanmış: kayıt → test oluştur → yayımla → satın al → çöz → değerlendir → iade → itiraz.
- Multi-tenant foundation (`tenantId` her tabloda).
- Canlı sınav (LiveSession) altyapısı: 6 model + 18 use-case + 2s polling + 15s heartbeat.
- Reklam paketleri (AdPackage/AdPurchase/AdImpression).
- Admin paneli: kullanıcı yönetimi, ayarlar, raporlar, yedekleme zamanlayıcısı.

### Öneriler
- **Webhook altyapısı:** Ödeme sağlayıcı (Iyzico/Stripe) için imzalı webhook endpoint'leri + replay protection (idempotency key).
- **Feature flag sistemi:** LaunchDarkly veya self-hosted (Unleash) — kill-switch'leri AdminSettings'ten flag'a çıkar.
- **Bulk işlem API'leri:** Eğitici için toplu soru içe aktarma (CSV/JSON), toplu fiyat güncelleme.
- **Çoklu para birimi:** Şu an `priceCents` tek currency varsayıyor; `currency` alanı + FX servisi.
- **Sertifika üretimi:** Test başarıyla tamamlandığında PDF sertifika (puppeteer/wkhtmltopdf).
- **Coğrafi kısıtlama:** Bazı testler bazı bölgelerde satılamaz (geo-IP + tenant policy).

---

## 2. Güvenilirlik (Reliability)

### Mevcut Durum
- Sentry kurulumu var (`src/instrument.ts`) — DSN yoksa sessiz, prod %10 sample rate.
- `HttpExceptionFilter` 5xx hatalarını Sentry'ye yolluyor.
- Health endpoint'leri: `/health`, `/health/redis` (disable flag destekli).
- Frontend `ErrorBoundary` kök seviyede.
- Yedekleme zamanlayıcısı: `pg_dump` + gzip, audit log (`BackupLog`).
- Transaction kullanımı destekleniyor.

### Eksikler & Öneriler
- **SLO/SLA tanımı yok:** %99.9 uptime, p95 < 300ms gibi hedef koy ve dashboard'a bağla.
- **Circuit breaker:** Dış servis (ödeme, mail, S3) çağrılarında `opossum` veya `cockatiel` ile circuit breaker uygula.
- **Retry stratejisi:** BullMQ job'larında exponential backoff + DLQ (dead-letter queue) eksik.
- **Chaos testing:** Yedekten geri dönüş tatbikatı (haftalık restore test).
- **Graceful shutdown:** SIGTERM yakalanıp in-flight request'lerin tamamlanması (NestJS `enableShutdownHooks`).
- **Database failover:** PgBouncer var ama read replica yok; raporlama sorgularını replica'ya kaydır.
- **Idempotency:** POST endpoint'lerinde `Idempotency-Key` header desteği (özellikle ödeme, satın alma).
- **Heartbeat monitoring:** Canlı sınamada candidate disconnect tespiti var ama educator için yok.

---

## 3. Kullanılabilirlik (Usability)

### Mevcut Durum
- 47 sayfa, Radix UI + shadcn primitif tabanlı 50 UI component.
- Dark mode aktif (`next-themes`, localStorage persist).
- Skeleton loader bileşeni var.
- TanStack Query ile loading/error/empty state'leri yönetimi.
- Türkçe UI, kullanıcı rolü bazlı sidebar.

### Öneriler
- **Onboarding wizard:** İlk kayıt sonrası educator/candidate için 3-4 adımlı tur (intro.js veya driver.js).
- **Boş durum tasarımları:** Her listede "henüz veri yok" durumu için illüstrasyon + CTA.
- **Klavye kısayolları:** `?` ile help menü, `Cmd+K` ile command palette (`cmdk`).
- **Form auto-save:** Test oluşturma uzun formu — taslak olarak otomatik kaydetme.
- **Mobile-first kontrol:** 47 sayfanın kaçı 360px viewport'ta gerçekten kullanılabilir? Audit gerek.
- **Optimistic UI:** Beğeni, takip, oy gibi hızlı aksiyonlarda TanStack Query optimistic update.
- **Toast/notification merkezi:** `sonner` zaten kurulu — kullanım tutarlılığı için lint rule.
- **PWA:** Service Worker + manifest → offline test çözme + ana ekrana ekleme.
- **i18n hazırlığı:** Tüm UI Türkçe sabit string — `i18next` veya `react-intl` ile soyutla.

---

## 4. Verimlilik / Performans

### Mevcut Durum
- Cursor pagination disiplini CLAUDE.md'de zorunlu.
- 48 composite index Prisma'da.
- `tsvector` + GIN indexed full-text search (Test, Educator, Topic, TestPackage).
- Redis cache (`RedisCache.ts`) + BullMQ job queue.
- Frontend route-based code splitting (`React.lazy` + `pages.config.js`).
- Bundle analyzer CI'da artifact olarak yükleniyor (`ANALYZE=1`).
- Liste endpoint'lerinde `select: {...}` disiplini (no `include: true`).
- PgBouncer connection pooling docker-compose'ta hazır.

### Öneriler
- **Read replica:** Raporlama/analytics sorguları için ayrı PG instance.
- **CDN:** Frontend `dist/` + kullanıcı yüklediği resim/PDF → Cloudfront / Bunny CDN.
- **HTTP cache header:** `Cache-Control: public, max-age=...` statik içerik için (nginx zaten asset cache yapıyor mu kontrol et).
- **Brotli:** Nginx'te gzip yerine veya yanında brotli.
- **API response cache:** Public listings (popüler testler, eğitici profili) için Redis cache + ETag.
- **N+1 sorgu testi:** `prisma-query-log` veya `prisma-extension-counter` ile dev'de N+1 alarm.
- **Database vacuum/analyze:** Otomatik vacuum monitoring (pg_stat_user_tables → idx_scan oranları).
- **Image optimization:** Sharp ile yüklenen resimleri webp + multi-size üret.
- **HTTP/2 + Server Push:** Nginx config'inde HTTP/2 aktif mi? push hint mi?
- **Critical CSS inline:** Above-the-fold için inline CSS, geri kalan async.

---

## 5. Bakım Yapılabilirlik (Maintainability)

### Mevcut Durum
- Clean Architecture katmanları net: `application/use-cases` → `domain/interfaces` → `infrastructure/repositories` → `nest/controllers`.
- Repository pattern (Prisma + InMemory variant'lar test için).
- 149 use-case tek sorumluluk prensibinde, ortalama 50-150 satır.
- DTO sınıfları her endpoint için ayrı, `class-validator` zorunlu.
- TypeScript strict mode (backend), checkJs (frontend).
- Path alias: `@domain/*`, `@application/*`, `@infrastructure/*`, `@presentation/*`.
- TODO/FIXME yorum sayısı düşük (~birkaç dosya).
- Husky pre-commit + lint-staged (backend tsc + frontend ESLint).

### Öneriler
- **Mimari karar kayıtları (ADR):** `docs/adr/0001-clean-architecture.md` formatında — neden Use Case katmanı, neden REST + DTO vs.
- **Bağımlılık grafiği:** `dependency-cruiser` ile katmanlar arası ihlalleri CI'da kır (örn. controller'dan direkt Prisma çağrısı yasak).
- **Boy sınırı:** Use case dosyaları > 200 satır → refactor zorunlu (ESLint `max-lines`).
- **Karmaşıklık metriği:** `eslint-plugin-complexity` cyclomatic complexity > 10 hata.
- **Code ownership:** `CODEOWNERS` dosyası — domain klasörlerine sahip belirle.
- **Monorepo araçları:** `nx` veya `turborepo` ile cache + affected builds (CI hızlanır).
- **Shared types paketi:** Backend DTO ile frontend formatları paylaşacak `packages/shared` (zod schemas).
- **Otomatik migration review:** Yeni migration'da `DROP COLUMN`, `ALTER TYPE` gibi yıkıcı işlemler CI'da label gerektirsin.

---

## 6. Taşınabilirlik (Portability)

### Mevcut Durum
- Docker Compose 3 varyant: dev, prod, local-staging, pgbouncer.
- Multi-stage Dockerfile (Node 18-slim).
- Nginx tabanlı frontend image (CSP başlıkları dahil).
- `.env` üzerinden config: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `SENTRY_DSN`, `CSP_ENABLED`, vs.
- `validateDatabaseUrl()`, `validateRedisUrl()` boot-time validation.

### Öneriler
- **`.env.example` dosyası:** Tüm env değişkenleri default değerlerle dokümante et.
- **Helm chart:** Kubernetes deploy için Helm chart (production seri ölçek için).
- **Terraform/Pulumi modülleri:** Cloud kaynaklarını IaC ile (VPC, RDS, ElastiCache, S3).
- **12-factor uyumluluk kontrolü:** Heroku-style audit — config in env? stateless processes? backing services attached?
- **Multi-arch image:** `docker buildx` ile arm64 + amd64 (Apple Silicon dev + AWS Graviton prod).
- **Air-gapped deploy hazırlığı:** Tüm bağımlılıkları registry mirror'lardan çekebilme + offline npm cache.
- **Database backend soyutlaması:** Şu an Postgres bağımlı (`tsvector`); MySQL/SQLite fallback gerekirse interface katmanı eksik.

---

## 7. Güvenlik (Security)

### Mevcut Durum
- JWT auth + `@Public()` decorator + `JwtAuthGuard` global.
- Role-based access: `@Roles()` + `RolesGuard`, frontend tarafında `routeRoles.js`.
- Helmet kurulu, CSP env'den yapılandırılabilir (Report-Only başlangıç).
- Rate limit (`@nestjs/throttler` + Redis storage), login bruteforce guard.
- Sentry PII filtresi (authorization, cookie headers temizleniyor).
- Pre-commit `npm audit` + CI `audit --audit-level=high`.
- Multi-tenant izolasyonu `tenantId` middleware ile.

### Eksikler & Öneriler
- **`.env.example` ve secret rotasyon politikası eksik:** Vault/AWS Secrets Manager entegrasyonu.
- **CSRF koruması:** JWT cookie-based ise CSRF token, header-based ise SameSite=Strict doğrulaması.
- **SQL injection vektörü:** Prisma + parametreli sorgu zaten güvende ama raw `$queryRaw` kullanımları audit edilmeli.
- **XSS:** Kullanıcı içerikleri (soru, çözüm, yorum) `dangerouslySetInnerHTML` ile mi basılıyor? DOMPurify zorunlu.
- **Audit log:** Admin işlemleri için ayrı `AuditLog` tablosu (kim, ne zaman, hangi alan değişti).
- **2FA / TOTP:** Educator + Admin için zorunlu 2FA (`speakeasy` + recovery codes).
- **OAuth/SSO:** Google/Microsoft/Apple sign-in (next aşama).
- **File upload güvenliği:** Magic byte kontrolü, virus tarama (ClamAV), S3 pre-signed URL.
- **Dependency scanning:** Snyk veya GitHub Advanced Security + Trivy (container scan).
- **OWASP ASVS Level 2 audit:** Pen-test öncesi self-assessment.
- **Permission matrix testi:** Her endpoint × her rol için integration test (yetki sızıntısı).
- **GDPR/KVKK:** "Verilerimi sil" akışı, veri ihracı, açık rıza kayıtları.

---

## 8. Uyumluluk (Compatibility)

### Mevcut Durum
- API REST + DTO; OpenAPI/Swagger config var (`/docs`, `npm run openapi:export`).
- Modern browser hedefi (Vite default ~ES2020).
- PostgreSQL 14+ varsayımı (`tsvector` STORED column).

### Öneriler
- **Browser support matrix:** package.json `browserslist` açıkça tanımla; CI'da `@vitejs/plugin-legacy` ile IE/eski Safari fallback.
- **API versiyonlama:** `/v1/...` prefix + sunset header politikası. Şu an versiyon yok.
- **Webhook standardı:** CloudEvents v1.0 formatı (alıcı sistemlerle uyum).
- **OpenAPI sürekli yayın:** `openapi.json` artifact'ını her release'de paketle, SDK üretimi için (openapi-generator).
- **Test API contract:** Pact veya OpenAPI schema validation testleri.
- **Ekran okuyucu uyumu:** NVDA + VoiceOver + JAWS test (en az 3 kritik akış).
- **Eski cihaz testi:** Düşük-end Android (Chrome <100, RAM 2GB) gerçek cihaz test.
- **Postgres versiyon sözleşmesi:** README'de minimum PG sürümü ve neden (ör. `STORED` PG 12+).

---

## 9. Kod Kalitesi

### Mevcut Durum
- ESLint (flat config), React + hooks plugin, unused-imports plugin.
- TypeScript strict (backend).
- Path alias ile import temizliği.
- Use case dosyaları ortalama küçük ve odaklı.
- Repository pattern + DTO + Use case ayrımı çok temiz.
- CLAUDE.md kodlama kuralları detaylı.

### Öneriler
- **Prettier config eksplisit:** `.prettierrc` ekle, ESLint ile entegre.
- **Husky'de Prettier check:** Staged dosyalarda `prettier --check`.
- **SonarQube/SonarCloud:** Code smell, duplication, complexity metrikleri dashboard.
- **Coverage threshold:** Jest `coverageThreshold` 80% global, 90% use-case katmanı.
- **Naming convention lint:** `@typescript-eslint/naming-convention` kuralı (interface I prefix yasağı, vs.).
- **Magic number / string yasağı:** `no-magic-numbers` lint, sabitleri `domain/constants.ts`.
- **Konsol log yasağı:** `no-console` prod build'de (Sentry breadcrumb yeterli).
- **Import sıralama:** `eslint-plugin-import` + `simple-import-sort`.
- **Dead code:** `ts-prune` veya `knip` ile kullanılmayan export tespiti.

---

## 10. Dokümantasyon Kalitesi

### Mevcut Durum
- CLAUDE.md detaylı (mimari, komutlar, sözlük).
- `docs/` klasöründe 15 markdown dosyası (frontend security, performance, dev-env, agent guides).
- Swagger `/docs` endpoint'i dev ortamda.
- Inline kod yorumları Türkçe izinli.

### Eksikler & Öneriler
- **Root README.md yok:** Yeni geliştirici için onboarding kılavuzu (5 dakikada lokal çalıştır).
- **Architecture diagram:** C4 model (Context, Container, Component) — `structurizr` veya `mermaid`.
- **Database ER diagram:** Prisma → `prisma-erd-generator` otomatik üretsin.
- **Sequence diagram:** Kritik akışlar (satın alma, iade, canlı sınav) `mermaid sequenceDiagram`.
- **Runbook:** Üretim olayları için (DB down, Redis down, yüksek hata oranı) adım adım müdahale.
- **CHANGELOG.md:** Keep a Changelog formatı + semver.
- **API kullanım örnekleri:** `docs/api-examples/` curl + Postman collection.
- **Domain glossary:** İş terimleri sözlüğü (Türkçe-İngilizce eşleşmeli).
- **Onboarding video:** Yeni geliştirici için 10 dk loom kaydı.

---

## 11. Test Kalitesi  ⚠️ ÖNCELİKLİ ALAN

### Mevcut Durum
- Backend: Jest yapılandırılmış (`jest.config.js`); unit + integration scriptleri var ama test dosya sayısı 149 use-case için yetersiz.
- Frontend: Vitest ile **yalnızca 5 test dosyası** (Home, Login, MyResults, MyTestPackages, Explore).
- Playwright config var, `e2e/` klasörü tanımlı.
- **A11y test spec'i CLAUDE.md'de bahsedilmiş ama dosya bulunamadı** (`e2e/specs/a11y.spec.ts` yok).
- Repository pattern InMemory implementasyon ile test edilebilir hazır.

### Öneriler (kritik)
- **Coverage ölç ve raporla:** Jest `--coverage` + Codecov; PR'da delta zorunlu.
- **Use case unit test hedefi:** 149 use-case için minimum mutlu yol + hata yolu (~300 test).
- **Integration test:** Her controller için en az bir test (auth, role, validation, success).
- **E2E kritik akış:** Kayıt, satın alma, test çözme, iade, canlı sınav → 5 spec dosyası.
- **a11y spec yazılsın:** axe-core ile 10 kritik sayfayı CI'da test et.
- **Visual regression:** Percy / Chromatic / Playwright snapshot.
- **Load test:** k6 / Artillery — 100, 1000, 10000 concurrent user senaryoları.
- **Mutation testing:** Stryker ile test kalitesini ölç (60% mutation score hedef).
- **Contract test:** Frontend ↔ Backend Pact veya OpenAPI schema validation.
- **Database test:** Migration up/down testi (Atlas veya custom script).
- **Security test:** OWASP ZAP otomasyonu CI'da haftalık.

---

## 12. Süreç Kalitesi

### Mevcut Durum
- 2 GitHub workflow: `backend-migrate-and-test.yml`, `docker.yml`.
- Husky pre-commit (CLAUDE.md'de bahsedilmiş).
- Dependabot CLAUDE.md'de "haftalık, gruplu" deniyor ama `.github/dependabot.yml` bulunamadı.
- 24 numbered migration → düzenli şema evrimi.
- Multi-stage Docker build + Compose 3 varyant.
- `/ship` slash komutu (typecheck + lint + test + commit + push).

### Öneriler
- **`.github/dependabot.yml` ekle:** Haftalık + grouped + auto-merge minor/patch.
- **Branch protection:** Main branch için PR review zorunlu + CI green + linear history.
- **Conventional commits + commitlint:** `feat:`, `fix:`, `chore:` standardı → otomatik CHANGELOG (`changesets` veya `semantic-release`).
- **PR template:** `.github/pull_request_template.md` (etkilenen alanlar, test edildi mi, breaking change?).
- **Issue template:** Bug, feature, security ayrı şablonlar.
- **Release süreci:** GitHub Release + tag + Docker image push (workflow_dispatch veya tag push).
- **Staging → Prod promotion:** Aynı image hash'i promote, yeniden build yok.
- **Migration safety check:** PR'a migration eklendiğinde label + ekstra review zorunlu.
- **Performance budget:** CI'da bundle size + Lighthouse score threshold.
- **DORA metrikleri:** Deployment frequency, lead time, MTTR, change failure rate ölçülsün.

---

## 13. Müşteri / Kullanıcı Memnuniyeti

### Mevcut Durum
- Kullanıcıdan veri toplama mekanizması (analytics, feedback) görünmüyor.
- Sentry ile teknik hata toplama var ama UX telemetry yok.

### Öneriler
- **Ürün analitiği:** PostHog (self-hosted opsiyon) veya Mixpanel — funnel, retention, cohort.
- **NPS anketi:** 30 günde bir in-app NPS soru + segment'e göre raporlama.
- **In-app feedback:** Her sayfada "Bu sayfada bir sorun mu var?" butonu (canny.io veya kendi).
- **Session replay:** PostHog session replay veya FullStory (PII maskeli) — hata ardındaki davranış.
- **Destek metriği:** Zendesk/Intercom entegrasyonu + first-response time, CSAT.
- **Eğitici NPS / Candidate NPS:** İki ayrı persona için ayrı ölçüm.
- **Bug report shortcut:** Sentry user feedback widget.
- **A/B test altyapısı:** GrowthBook / Statsig — özellikleri yüzde yüzde rollout.
- **Public roadmap + changelog:** productboard veya canny — kullanıcıya "ne geliyor" görünür.

---

## 14. Ekonomik / İş Değeri

### Mevcut Durum
- Komisyon AdminSettings'ten yapılandırılabilir.
- Reklam paketleri ek gelir kaynağı.
- TestPackage ve canlı sınav farklı fiyatlama imkânı veriyor.
- Maliyet izleme altyapısı (cloud spend, per-tenant cost) görünmüyor.

### Öneriler
- **Unit economics dashboard:** Tenant başı maliyet (DB satır + storage + compute) vs. tenant başı gelir.
- **Fiyatlandırma katmanı:** Free / Pro / Enterprise tier — feature gate altyapısı.
- **Faturalandırma entegrasyonu:** Stripe Billing veya Paddle (KDV, otomatik fatura).
- **Abonelik akışı:** Educator için aylık platform fee veya komisyon hibrit.
- **Churn ölçümü:** Aylık aktif candidate / educator, terk oranı.
- **Pazara çıkış (GTM) ölçütleri:** Yeni feature → adoption rate (hangi % kullanıcı 1 hafta içinde denedi).
- **Cohort LTV:** Kayıt ayına göre 30/60/90/180 gün gelir izleme.
- **Cloud maliyet alarmı:** AWS Budgets / CloudWatch — aylık limit alarmı.
- **Refund oranı:** İade akışı zaten var; iş zekâsı dashboard'una bağla.
- **Top eğitici / top test paneli:** Marketplace dinamiklerini görselleştir → ürün kararı için sinyal.

---

## Sonuç ve Aksiyon Önceliklendirmesi

### 🔴 Bu Çeyrek (Yüksek Öncelik)
1. **Test coverage** — minimum 60% global, 80% use-case katmanı. (Test Kalitesi)
2. **a11y test spec'ini yaz** ve CI'ya bağla. (Test Kalitesi)
3. **Dependabot config + branch protection.** (Süreç Kalitesi)
4. **Root README + .env.example.** (Dokümantasyon, Taşınabilirlik)
5. **Idempotency + webhook signing** (ödeme akışı için). (Güvenilirlik, Güvenlik)

### 🟡 Sonraki Çeyrek (Orta Öncelik)
6. **API versiyonlama** (`/v1/...`) ve OpenAPI SDK üretimi. (Uyumluluk)
7. **Audit log + 2FA** (Admin + Educator). (Güvenlik)
8. **Coverage threshold + Stryker mutation test.** (Kod Kalitesi)
9. **PostHog / product analytics.** (Müşteri Memnuniyeti)
10. **ADR + C4 diagramları.** (Dokümantasyon, Bakım)

### 🟢 6 Ay+ (Stratejik)
11. **Helm chart + Kubernetes deploy** (ölçek için).
12. **Read replica + CDN** (performans).
13. **Stripe Billing entegrasyonu + tier yapısı.**
14. **i18n + çoklu para birimi** (uluslararası açılım).
15. **SOC 2 / ISO 27001 hazırlığı.**

---

*Bu rapor `C:\Users\mtulu\dal` üzerindeki mevcut kodbase taranarak hazırlanmıştır. Skorlar görece ve önceliklendirme amaçlıdır; mutlak değer değildir.*
