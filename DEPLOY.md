# Deploy Rehberi — Sınav Salonu (Docker Compose / canlı sunucu)

> Bu dosya, canlıya yüklemede yaşanan sorunları bir daha yaşamamak için yazıldı.
> **Altın kural:** Stack'i her zaman **tüm servislerle birlikte** ayağa kaldır.
> Sadece `backend`/`frontend` başlatmak → postgres/redis kalkmaz → backend DB'ye
> bağlanamaz (`unhealthy`) → **giriş çalışmaz**. Yaşanan asıl sorun buydu.

## Tek komutla deploy

```bash
cd /home/mtulu/dal
bash infra/docker/start-stack.sh
```

`start-stack.sh` şunları yapar: tüm servisleri `up -d` eder, postgres + backend
sağlıklı olana kadar bekler, durum tablosunu basar.

Manuel eşdeğeri (script kullanmadan):

```bash
docker compose -p docker --env-file /home/mtulu/dal/.env \
  -f infra/docker/docker-compose.prod.yml \
  -f infra/docker/docker-compose.staging.yml \
  up -d
```

> **ÖNEMLİ:** `-p docker` (proje adı), `--env-file .env` ve **iki** `-f` dosyası
> birlikte verilmeli. Eksik `--env-file` → secret'lar boş; eksik servis adı
> (örn. `up -d backend`) → DB kalkmaz.

## Yeni sürüm (image rebuild) ile deploy

```bash
cd /home/mtulu/dal
# 1) Yeni kodu çek
git pull
# 2) Backend image'ını yeniden build et (compose ile)
docker compose -p docker --env-file .env \
  -f infra/docker/docker-compose.prod.yml -f infra/docker/docker-compose.staging.yml \
  build backend
# 3) Tüm stack'i güncel image'larla başlat
bash infra/docker/start-stack.sh
```

## Otomatik olanlar (elle yapma)

| İş | Nerede | Not |
|---|---|---|
| **DB migration** | `apps/backend/docker/app/start.sh` | Konteyner açılışında `prisma migrate deploy` (retry + advisory lock). Elle migrate gerekmez. |
| **Runtime asset kopyalama** | `npm run build` → `scripts/copy-assets.cjs` | `.hbs/.md/.txt/.json` (email şablonları, AI prompt'ları, seed-data) `dist`'e kopyalanır. |
| **Frontend peer-dep çözümü** | `apps/frontend/.npmrc` (`legacy-peer-deps=true`) | `vite@6` ↔ `vite-plugin-pwa` çakışması; `npm ci` artık sorunsuz. Dockerfile zaten `--legacy-peer-deps` kullanıyor. |
| **Default tenant + admin + yasal sözleşmeler** | `SeedService` (boot) | Prod'da demo kullanıcılar atlanır; admin `mus.tulu@gmail.com` + tenant + contracts oluşur. |

## Deploy sonrası doğrulama (smoke test)

```bash
# 1) Tüm servisler healthy mi?
docker compose -p docker --env-file .env \
  -f infra/docker/docker-compose.prod.yml -f infra/docker/docker-compose.staging.yml ps
# backend + postgres + redis + frontend → "(healthy)" olmalı

# 2) Giriş çalışıyor mu? (HTTP 200 + token beklenir)
curl -s -m 15 -w "\nHTTP %{http_code}\n" -X POST "http://localhost/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"mus.tulu@gmail.com","password":"<admin-sifresi>"}'
```

## Test kullanıcıları (yalnızca test ortamı — prod'da SeedService atlar)

Eğitici/aday demo hesapları gerekiyorsa:

```bash
docker cp apps/backend/scripts/seed-demo-users.cjs docker-backend-1:/usr/src/app/seed-demo-users.cjs
docker exec -w /usr/src/app docker-backend-1 node seed-demo-users.cjs
```

| Rol | E-posta | Şifre |
|---|---|---|
| Eğitici | `educator@demo.com` | `demo123` |
| Aday | `aday@demo.com` | `demo123` |

Script tenant'ı DB'den otomatik bulur (FK güvenli), idempotenttir.

## Sorun giderme (bu oturumda yaşananlar)

| Belirti | Kök neden | Çözüm |
|---|---|---|
| Giriş "E-posta veya şifre hatalı" / backend `unhealthy` | postgres/redis container'ı çalışmıyor → DB'ye bağlanılamıyor | `bash infra/docker/start-stack.sh` (tüm servisleri kaldır) |
| `node dist/...` → `ENOENT: ...text-moderation.tr.md` | `tsc` asset kopyalamaz | `npm run build` artık `copy-assets.cjs` çalıştırır (image build'i de kapsar) |
| `npm ci` → `ERESOLVE ... vite-plugin-pwa` | peer-dep çakışması | `apps/frontend/.npmrc` (`legacy-peer-deps=true`) |
| `prisma ... P1001 Can't reach database` | DB host'u (`postgres`) ayakta değil | postgres container'ını başlat (full `up -d`) |
| Seed `users_tenantId_fkey` ihlali | Gerçek tenant `dev-tenant`, hardcode edilen id yanlış | `seed-demo-users.cjs` tenant'ı `findFirst` ile bulur |
| postgres `database files are incompatible ... version 15/16` | Eski volume farklı PG sürümüyle | Volume'ü temizle (`down -v`) — **DİKKAT: veri siler**, sadece boş/test ortamında |

## Kontrol listesi (her deploy)

- [ ] `git pull` + gerekiyorsa `build backend`
- [ ] `bash infra/docker/start-stack.sh` (TÜM servisler)
- [ ] `... ps` → 4 servis `(healthy)`
- [ ] Giriş smoke testi HTTP 200
- [ ] (gerekirse) demo kullanıcı seed
