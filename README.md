# Sınav Salonu

Test marketplace uygulaması. Eğiticiler (educators) sınav (test) oluşturur ve satar; adaylar (candidates) satın alır, çözer, skorlarını takip eder. Canlı sınav oturumları, reklam paketleri, çoklu kiracı (multi-tenant) ve admin paneli dahildir.

> Detaylı mimari ve kodlama kuralları için **[CLAUDE.md](./CLAUDE.md)**.
> Kalite değerlendirme raporu için **[KALITE-DEGERLENDIRME.md](./KALITE-DEGERLENDIRME.md)**.

## Stack

| Katman | Teknoloji |
|---|---|
| Frontend | React 18 + Vite, JavaScript (JSX), Tailwind, React Router v6, TanStack Query, next-themes |
| Backend | NestJS (REST + DTO + Validation), Clean Architecture (Use Cases) |
| Veritabanı | PostgreSQL + Prisma ORM (cursor pagination, tsvector full-text search) |
| Cache + Queue | Redis + BullMQ |
| Test | Vitest + Testing Library, Jest (backend), Playwright + axe-core (e2e + a11y) |
| Konteyner | Docker Compose (dev / prod / local-staging / pgbouncer) |
| Gözlem | Sentry + bundle analyzer + Lighthouse (CI) |

## 5 dakikada lokal çalıştır

### Önkoşullar

- **Node.js 20+** (`node -v`)
- **npm 10+** (Node ile gelir)
- **Docker Desktop** (Postgres + Redis için) — alternatif olarak host'a yerel kur

### Adım adım

```bash
# 1) Repo'yu klonla
git clone https://github.com/YOUR-ORG/sinavsalonu.git dal
cd dal

# 2) Env örneklerini kopyala
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env
# (apps/backend/.env içindeki JWT_SECRET'ı güçlü bir değerle değiştir)

# 3) Docker ile Postgres + Redis başlat
docker compose -f infra/docker/docker-compose.yml up -d postgres redis

# 4) Backend bağımlılıkları + Prisma + migration
cd apps/backend
npm install
npx prisma generate
npx prisma migrate dev    # şema sıfırdan kurulur, seed çalışır

# 5) Backend'i başlat (port 3000)
npm run dev               # tsx watch

# 6) Yeni terminal'de frontend
cd ../frontend
npm install
npm run dev               # Vite — http://localhost:5173
```

Tarayıcıdan `http://localhost:5173` aç. API: `http://localhost:3000`. Swagger UI: `http://localhost:3000/docs` (dev'de `SWAGGER_ENABLED=1`).

### Demo hesaplar (seed)

Migration sonrası seed otomatik çalışır ve şu hesapları oluşturur:

| Rol | E-posta | Şifre |
|---|---|---|
| Aday | `aday@demo.com` | `demo123` |
| Eğitici | `egitici@demo.com` | `demo123` |
| Admin | `admin@demo.com` | `demo123` |

> Production'da seed çalışmaz (`NODE_ENV=production` koruması).

## Yerel staging (izole ortam)

Production'a yakın şartlarda test için:

```bash
./scripts/staging.sh up      # Derle ve başlat
./scripts/staging.sh logs    # Canlı log
./scripts/staging.sh reset   # DB sıfırla
./scripts/staging.sh down    # Durdur
```

`docker-compose.local-staging.yml` izole network + ayrı port'larda çalışır.

## Sık kullanılan komutlar

### Backend (`apps/backend/`)

```bash
npm run dev               # tsx watch
npm test                  # Jest
npm test -- --coverage    # coverage raporu (html + lcov)
npm run test:unit         # sadece unit
npm run test:integration  # integration (DB/Redis gerekebilir)
npm run db:migrate        # prisma migrate dev
npm run db:generate       # prisma generate
npm run openapi:export    # OpenAPI JSON üret
npm audit --audit-level=high
```

### Frontend (`apps/frontend/`)

```bash
npm run dev               # Vite
npm test                  # Vitest watch
npm run test:run          # Vitest tek sefer
npm run test:coverage     # Vitest + v8 coverage
npm run test:e2e          # Playwright (tüm e2e)
npm run test:e2e:a11y     # sadece a11y spec
npm run lint              # ESLint
npm run typecheck         # tsc --noEmit
npm run build             # production build
ANALYZE=1 npm run build   # + bundle analyzer (dist/stats.html)
npm audit --audit-level=high
```

### Root

```bash
# Slash komutları (Claude Code)
/ship "<commit-message>"  # typecheck + lint + test + commit + push zinciri
```

## Dizin yapısı

```
.
├── apps/
│   ├── backend/                  NestJS — Clean Architecture
│   │   ├── src/
│   │   │   ├── application/use-cases/   17 domain × 149 use-case
│   │   │   ├── domain/                   Repository arayüzleri, tipler
│   │   │   ├── infrastructure/           Prisma repo, cache, queue
│   │   │   └── nest/                     Controllers (ince), guards, modules
│   │   ├── prisma/
│   │   │   ├── schema.prisma             Tek şema
│   │   │   └── migrations/               Numbered SQL
│   │   └── tests/                        Jest unit + integration
│   └── frontend/                 React + Vite
│       ├── src/
│       │   ├── pages/                    47 sayfa (React.lazy)
│       │   ├── components/
│       │   ├── api/dalClient.js          Tek API girişi
│       │   ├── lib/                      Util, hooks
│       │   ├── pages.config.js           Route → lazy import
│       │   └── lib/routeRoles.js         Rol bazlı erişim
│       └── e2e/specs/a11y.spec.js        axe-core + Playwright
├── infra/
│   └── docker/                    Compose dosyaları (dev/prod/staging/pgbouncer)
├── docs/                          Mimari, runbook, ADR, branch protection
├── scripts/                       staging.sh
├── .claude/                       Skills, agents, slash commands
└── .github/
    ├── dependabot.yml
    ├── pull_request_template.md
    ├── ISSUE_TEMPLATE/
    └── workflows/
```

## Domain sözlüğü (kısa)

| Terim | Açıklama |
|---|---|
| **Test** (`ExamTest`) | Satılabilir sınav paketi |
| **TestPackage** | Birden fazla Test'i bir araya getiren paket |
| **ExamQuestion** | Çoktan seçmeli soru |
| **TestAttempt** | Aday'ın sınav çözme oturumu |
| **User** | Rol: `CANDIDATE \| EDUCATOR \| ADMIN \| WORKER` |
| **Purchase** | Kullanıcı-Test ilişkisi, ödeme kaydı |
| **DiscountCode** | Eğiticinin oluşturduğu indirim kodu |
| **LiveSession** | Canlı sınav oturumu — eğitici yönetir, aday katılır |
| **Tenant** | Multi-tenant izolasyon birimi |

Detaylı sözlük: `CLAUDE.md` → "Domain Sözlüğü".

## Test & Coverage

| Katman | Hedef | Bugün |
|---|---|---|
| Backend global | %60 (Q1 sonu) | Jest config'te baseline |
| Use-case katmanı | %80 (Q2 hedef) | Yol haritası `docs/proposed-claude/skills/coverage-discipline/SKILL.md` |
| Frontend pages | %50 | Baseline |
| A11y kritik sayfalar | 0 ihlal | 10+ test (`a11y.spec.js`) |

Coverage Codecov'a yüklenir; PR'da delta görünür (`codecov.yml`).

## Güvenlik

- JWT auth + role guard, multi-tenant izolasyon middleware'i
- Rate limit (Throttler + Redis), login bruteforce guard
- Helmet + CSP (Report-Only başlangıç) — `apps/backend/src/nest/security/csp.ts`
- Sentry PII filter (authorization, cookie temizlenir)
- Pre-commit + CI `npm audit --audit-level=high`
- Dependabot haftalık + gruplu (`.github/dependabot.yml`)

Detay rehber: `docs/branch-protection.md`, `KALITE-DEGERLENDIRME.md` §7.

## CI/CD

GitHub Actions workflow'ları (`.github/workflows/`):

- `backend-migrate-and-test.yml` — build, unit/integration test, coverage (Codecov upload), e2e smoke (ephemeral Postgres), frontend test + a11y, bundle analyzer, npm audit, migration deploy (env approval ile).
- `docker.yml` — Docker image build.

Branch protection kuralları: `docs/branch-protection.md`.

## Katkı

1. Feature branch aç: `feat/<kısa-açıklama>` veya `fix/<kısa-açıklama>`.
2. Commit mesajı: Conventional Commits formatı önerilir (`feat(purchase): ...`, `fix(backend): ...`).
3. PR aç; template (`.github/pull_request_template.md`) doldur.
4. CI yeşil olsun, review al, squash-merge.

Lokal hazırlık:

```bash
# Backend tsc + frontend eslint pre-commit otomatik çalışır.
# Manuel typecheck:
cd apps/backend && npx tsc --noEmit
cd apps/frontend && npm run typecheck
```

## Dokümantasyon haritası

- `CLAUDE.md` — Mimari + kodlama kuralları (zorunlu okuma)
- `KALITE-DEGERLENDIRME.md` — 14 boyutlu kalite raporu + aksiyon listesi
- `docs/branch-protection.md` — `main` branch protection ayarları
- `docs/proposed-claude/` — `.claude/` altına eklenmesi önerilen skill + agent dosyaları
- `apps/backend/src/nest/swagger/` — OpenAPI export script
- `infra/docker/` — Compose ve Dockerfile'lar

## Lisans

MIT (bkz. `apps/backend/package.json`).
