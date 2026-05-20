---
name: observability
description: SLO/SLA tanımı, circuit breaker (opossum), retry + DLQ, graceful shutdown, runbook ve Sentry derinleştirme. Yeni dış servis entegrasyonu (ödeme, mail, S3, sosyal login) eklerken veya üretim olaylarına müdahale prosedürü yazılırken referans alın.
---

# Observability & Resilience — Sınav Salonu

Production'daki uptime, dış servis bağımlılıkları, ve hata kurtarma için disiplin. KALITE-DEGERLENDIRME §2 "Güvenilirlik 6/10" buradan 8/10'a çıkar.

## SLO/SLA hedef tablosu

Aşağıdaki SLO'lar üretim için minimum hedef. Dashboard'a (Grafana/Sentry) bağlanmalı.

| Kategori | Metric | Hedef |
|---|---|---|
| **Uptime** | API erişilebilirlik | %99.9 (aylık ≤ 43 dk downtime) |
| **Latency** | `GET /tests` p95 | < 300ms |
| **Latency** | `POST /attempts/:id/submit` p95 | < 800ms |
| **Latency** | `POST /purchases` p95 (ödeme provider hariç) | < 1500ms |
| **Hata oranı** | 5xx oranı (24h pencere) | < %0.1 |
| **Hata oranı** | Background job fail oranı | < %1 |
| **Live session** | Heartbeat kayıp oranı | < %0.5 |
| **DB** | Query p95 | < 100ms |
| **Cache** | Redis hit ratio | > %80 |
| **Backup** | Backup başarı oranı (haftalık) | %100 |

Tanım: `error_budget = (1 - SLO) * window`. %99.9 uptime → ay başına 43 dk hata bütçesi.

## Circuit Breaker (opossum)

Dış servis çağrılarında failure cascade'i durdurmak için. Üç durum: **closed** (normal), **open** (fail edip kapı kapanır), **half-open** (deneme).

```bash
cd apps/backend && npm install opossum
```

```ts
// apps/backend/src/infrastructure/resilience/StripeBreaker.ts
import CircuitBreaker from 'opossum';
import { logger } from '@infrastructure/logger';

const options = {
  timeout: 5000,              // 5s'den uzun → fail
  errorThresholdPercentage: 50, // %50 fail → open
  resetTimeout: 30000,        // 30s sonra half-open dene
  rollingCountTimeout: 10000, // metric window
  rollingCountBuckets: 10,
};

export function createBreaker<T extends (...args: any[]) => Promise<any>>(
  name: string,
  fn: T,
  fallback?: (...args: Parameters<T>) => ReturnType<T>,
): CircuitBreaker {
  const breaker = new CircuitBreaker(fn, options);
  if (fallback) breaker.fallback(fallback);
  breaker.on('open', () => logger.warn(`breaker open: ${name}`));
  breaker.on('halfOpen', () => logger.info(`breaker half-open: ${name}`));
  breaker.on('close', () => logger.info(`breaker close: ${name}`));
  breaker.on('reject', () => logger.warn(`breaker reject: ${name}`));
  return breaker;
}
```

Kullanım:

```ts
const chargeBreaker = createBreaker(
  'stripe.charge',
  (params) => stripeClient.charges.create(params),
  () => { throw new ServiceUnavailableException('Ödeme servisi geçici olarak kullanılamıyor'); },
);

await chargeBreaker.fire({ amount, currency });
```

Mail, S3, push, AI servisleri için aynı yaklaşım.

## Retry + DLQ (BullMQ)

Background job'lar (mail, webhook downstream, bildirim) için exponential backoff + dead-letter queue.

```ts
// apps/backend/src/infrastructure/queue/queue.config.ts
import { Queue, Worker } from 'bullmq';
import { redisConnection } from './redis';

export const mailQueue = new Queue('mail', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 5000 }, // 5s, 10s, 20s, 40s, 80s
    removeOnComplete: 1000,
    removeOnFail: false, // DLQ'da kalsın
  },
});

export const mailDLQ = new Queue('mail-dlq', { connection: redisConnection });

new Worker(
  'mail',
  async (job) => {
    await sendMail(job.data);
  },
  { connection: redisConnection },
).on('failed', async (job, err) => {
  if (job && job.attemptsMade >= (job.opts.attempts ?? 0)) {
    await mailDLQ.add('failed-mail', { original: job.data, error: err.message, jobId: job.id });
    logger.error({ jobId: job.id, error: err.message }, 'mail job → DLQ');
  }
});
```

Admin paneline DLQ inceleme + yeniden işleme butonu eklenmeli.

### Mail kuyrukları — 3-tier + provider fallback pattern

Mail trafiği için yukarıdaki tek `mail` kuyruğu yetmez. Sınav Salonu'nda **3 ayrı kuyruk** + **provider fallback zinciri** uygulanır:

| Queue | Concurrency | Rate | Retry | Kapsam |
|---|---|---|---|---|
| `email-critical` | 5 | 60/dk | 3 | Şifre sıfırlama, ödeme makbuzu, iade onayı, hesap güvenliği |
| `email-notify` | 3 | 30/dk | 3 | Değerlendirme bildirimi, itiraz güncellemesi, canlı oturum daveti |
| `email-bulk` | 1 | 30/dk | 2 | Kampanya, weekly digest |

Worker provider chain'i (priority sıralı):
```ts
for (const provider of providers) {
  if (provider.dailySentCount >= provider.dailyLimit - 20) continue; // Brevo cap
  const result = await provider.send(envelope);
  if (result.success) return record(result);
  if (!result.isRetryable) break; // 4xx → fallback'e bile gitme
  // 5xx/429/timeout → sıradaki provider
}
// Tüm provider fail → BullMQ retry (1dk, 5dk, 30dk) → tükenirse status = DEAD_LETTER
```

CRITICAL kuyruğu `User.emailPreferences`'tan **etkilenmez** (`EmailDispatcher.shouldSend` istisnası).

Detaylı pattern, EmailLog/EmailEvent/SuppressedEmail/EmailProviderConfig şemaları, kill switch matrisi ve bounce webhook akışı için `email-traffic` skill'i.

## Graceful shutdown

NestJS `enableShutdownHooks` + container SIGTERM. In-flight request'leri öldürme.

```ts
// apps/backend/src/main.ts
const app = await NestFactory.create(AppModule);
app.enableShutdownHooks();

// HTTP server'a shutdown timeout
const PORT = process.env.PORT ?? 3000;
const server = await app.listen(PORT);
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing HTTP server...');
  // 30 saniye in-flight request'lere izin ver
  setTimeout(() => process.exit(1), 30_000).unref();
  await app.close();
  process.exit(0);
});
```

NestJS module'larda `OnApplicationShutdown` implement et — Prisma disconnect, BullMQ worker close, Redis quit.

## Health endpoint genişletme

Mevcut `/health` ve `/health/redis` yanına:

```ts
@Get('health/full')
async fullHealth() {
  const results = await Promise.allSettled([
    this.checkDb(),
    this.checkRedis(),
    this.checkS3(),
    this.checkStripe(),
  ]);
  const status = results.every(r => r.status === 'fulfilled' && r.value.ok) ? 'ok' : 'degraded';
  return {
    status,
    checks: {
      db: result(results[0]),
      redis: result(results[1]),
      s3: result(results[2]),
      stripe: result(results[3]),
    },
    uptime: process.uptime(),
    version: process.env.GIT_SHA ?? 'dev',
  };
}
```

Load balancer için `/health` (sığ — sadece process up?), monitoring için `/health/full`.

## Sentry derinleştirme

Mevcut kurulumun ötesi:

- **Performance:** `tracesSampleRate: 0.1` prod, `0` health endpoint'i için `tracesSampler` ile filtrele.
- **User context:** `Sentry.setUser({ id, tenantId })` her request'in başında.
- **Tag:** `tenantId`, `userRole`, `endpoint` tag'leri ile filtreleme kolaylaşır.
- **Custom span:** Use case başlangıç-bitiş span'ı.

```ts
import * as Sentry from '@sentry/node';

await Sentry.startSpan({ name: 'CreatePurchase', op: 'use-case' }, async () => {
  return useCase.execute(...);
});
```

- **Source map:** Frontend build'inde sourceMap → Sentry upload (`sentry-cli sourcemaps upload`).

## Runbook (örnek: "DB ulaşılamıyor")

`docs/runbooks/db-down.md`:

```
# Runbook: PostgreSQL erişilemez

## Belirti
- `/health/full` `db.ok=false`
- Sentry'de "P1001: Can't reach database server"
- Frontend "500" alıyor

## İlk 5 dk

1. Cloud console → RDS/Postgres → status (running mu, restart mı?)
2. `kubectl logs deploy/backend -c app --tail=200` veya docker logs → bağlantı tipi (timeout? auth?)
3. PgBouncer pod ayağa kalkmış mı? `kubectl logs deploy/pgbouncer`
4. `psql $DATABASE_URL -c "SELECT 1"` jump host'tan — direkt erişim var mı?
5. RDS event log → otomatik backup veya maintenance ?

## Eylemler

| Durum | Aksiyon |
|---|---|
| RDS down | Read replica'ya failover (manuel veya otomatik) |
| Connection pool exhausted | `pg_stat_activity` ile uzun query'leri kill et |
| Disk full | `VACUUM FULL` veya disk büyütme |
| Lock contention | `pg_locks` + bekleyen process'leri terminate |

## Sonra

- Postmortem (`docs/postmortems/YYYY-MM-DD-db-down.md`)
- Sentry → impacted users export
- Statuspage güncelle
```

Yazılacak diğer runbook'lar: `redis-down.md`, `stripe-webhook-fail.md`, `live-session-disconnect.md`, `backup-fail.md`.

## Logger discipline

Pino veya NestJS Logger:

```ts
logger.info({ userId, tenantId, action: 'purchase.created', amount }, 'purchase başarılı');
logger.error({ userId, tenantId, err: err.message, stack: err.stack }, 'purchase fail');
```

**Yapmayacaklar:**

- `console.log` yasak (Sentry breadcrumb yeterli + prod'da `no-console` lint).
- PII log'lama: TC kimlik, kart numarası, JWT, password — asla. Sentry PII filtresi gibi loglarda da filtre.
- `info` log seviyesi gürültüsü → critical path log + structured.

## Audit log zorunluluğu (insert/update/error)

Sınav Salonu'nda `AuditLog` tablosu ve `AuditAction` enum vardır
(`apps/backend/prisma/schema.prisma`). Helper: `infrastructure/audit/AuditLogger.ts`.

**Audit log MUTLAKA yazılması gereken use-case kategorileri:**

| Kategori | AuditAction | Use case örneği |
|---|---|---|
| Auth | `AUTH_LOGIN_SUCCESS`, `AUTH_LOGIN_FAIL`, `AUTH_MFA_ENABLED`, `AUTH_MFA_DISABLED` | LoginUseCase, VerifyTwoFactorLoginUseCase |
| Admin | `ADMIN_SETTINGS_UPDATED`, `USER_ROLE_CHANGED`, `USER_SUSPENDED`, `USER_DELETED` | UpdateAdminSettingsUseCase |
| Para | `PURCHASE`, `REFUND_REQUESTED`, `REFUND_APPROVED`, `REFUND_REJECTED`, `PAYOUT_PROCESSED` | PurchaseUseCase, ApproveRefundUseCase |
| İçerik | `TEST_PUBLISHED`, `TEST_UNPUBLISHED`, `PRICE_CHANGED`, `OBJECTION_*` | PublishTestUseCase |
| Webhook | `WEBHOOK_RECEIVED`, `WEBHOOK_REJECTED` | HandleStripeWebhookUseCase |
| Backup | `BACKUP_RUN` | BackupSchedulerService |

**Pattern — use case'te:**

```ts
import { AuditLogger, AuditContext } from '../../../infrastructure/audit/AuditLogger';

@Injectable()
export class UpdateAdminSettingsUseCase {
  constructor(private readonly audit?: AuditLogger) {} // opsiyonel: backward compat

  async execute(prisma: ..., input: ..., ctx?: AuditContext): Promise<...> {
    const before = await this.snapshot(prisma);   // ① önce mevcut durumu yakala
    const after = await this.applyChange(prisma, input);
    this.audit?.logAsync(ctx ?? {}, {
      action: 'ADMIN_SETTINGS_UPDATED',
      entityType: 'AdminSettings',
      entityId: '1',
      before, after,
      metadata: { changedFields: Object.keys(diff(before, after)) },
    });                                            // ② sonra audit yaz
    return after;
  }
}
```

**Controller'da `AuditContext` her zaman geçilmeli:**

```ts
import { auditContextFromRequest } from '../../infrastructure/audit/AuditLogger';

@Patch()
async update(@Body() dto: Dto, @Req() req: any) {
  const ctx = auditContextFromRequest(req); // actorId, email, role, ip, userAgent
  return this.useCase.execute(this.prisma, dto, ctx);
}
```

**Audit log yazımının golden rule'ları:**

1. `logAsync` kullan — use case akışını **asla bloke etme** (best-effort).
2. Insert öncesi `before` snapshot al; sadece `after` log'lamak update'lerde değer kaybeder.
3. PII'yi metadata'ya basma: password, JWT, kart bilgisi, recovery code'lar. E-postayı sadece kullanıcının kendi kaydı için, başka kullanıcı için maskele.
4. Failure path'lerde de log yaz (`AUTH_LOGIN_FAIL` gibi). "Olmadı" olayını görmek "oldu" kadar önemlidir.
5. `entityId` zorunlu — kimliği bilinmeyen olaylarda `'unknown'` veya request id geç. Boş bırakma.
6. AuditLogger DI verilmezse fallback `logger.info/warn` ile structured log yaz — test ve dev ortamında audit DB hazır olmayabilir.

**Anti-pattern'lar (PR review'da reject):**

- Use case admin/auth/para domain'inde insert/update yapıyor ama audit log yok.
- Audit `await` ediliyor (use case bloke olur, audit DB down ise endpoint patlatır).
- `before` snapshot atlanmış (sadece `after` audit'e gidiyor).
- E-posta/JWT/şifre `metadata`'ya direkt yazılmış.
- **`nest/modules/<x>/<x>.service.ts` veya `nest/modules/<x>/<x>-provider.service.ts` gibi
  servis/provider katmanında doğrudan `prisma.<model>.update/create` çağırılıyor ama audit log
  yok.** Use case değil diye muafiyet yok: insert/update yapılıyorsa audit log zorunludur.
  Tercihen update + auditLog.create aynı `prisma.$transaction` içinde — böylece audit yazımı
  başarısız olursa update da geri alınır.
- **Controller `actorId`/`AuditContext` geçmiyor.** Eğer endpoint `@Roles('EDUCATOR')` veya
  `@Roles('ADMIN')` ile korunduysa, request'te `user.id` mutlaka vardır. Bu değer use case'e
  geçirilmezse audit log `actorId: null` yazar ve "kim yaptı" sorusu cevapsız kalır.
  Her korumalı endpoint için: `const actorId = (req as any).user?.id;` veya
  `const ctx = auditContextFromRequest(req);` zorunlu.

**Servis/Provider Audit Template (use case dışı):**

```ts
@Injectable()
export class TestPublishProvider {
  private readonly logger = new Logger(TestPublishProvider.name);
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  async publish(testId: string, actorId?: string | null) {
    const test = await this.prisma.examTest.findUnique({ where: { id: testId } });
    if (!test) throw new NotFoundException('TEST_NOT_FOUND');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.examTest.update({
        where: { id: testId },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          action: 'TEST_PUBLISHED',
          entityType: 'ExamTest',
          entityId: testId,
          actorId: actorId ?? null,
          metadata: { title: test.title } as object,
        },
      });
      this.logger.log({ msg: 'test.published', testId, actorId: actorId ?? null });
      return updated;
    });
  }
}
```

## Metrik (Prometheus opsiyonel)

`@willsoto/nestjs-prometheus` ile `/metrics` endpoint:

```ts
@Injectable()
export class PurchaseMetrics {
  constructor(
    @InjectMetric('purchase_total') private readonly counter: Counter,
    @InjectMetric('purchase_duration_seconds') private readonly histogram: Histogram,
  ) {}
}
```

Bunu Grafana dashboard'una bağla → SLO dashboard'u.

## Chaos testing (haftalık)

```bash
# scripts/chaos/restore-from-backup.sh
# 1. En son backup'ı al
# 2. Disposable PG instance'a restore et
# 3. Migration'ları çalıştır
# 4. Sanity query'leri koştur
```

CI'da haftalık `workflow_dispatch` ile çalıştırılabilir.

## Checklist (yeni dış servis entegrasyonu)

- [ ] Circuit breaker uygulandı mı (timeout + threshold + fallback)?
- [ ] Retry stratejisi tanımlı mı (exponential, max attempts)?
- [ ] Job ise DLQ var mı?
- [ ] `/health/full`'a check eklendi mi?
- [ ] Sentry'de tag/context set ediliyor mu?
- [ ] Runbook yazıldı mı?
- [ ] Yetersiz log varsa metric eklendi mi?
- [ ] Secret rotasyon planı var mı?

## Checklist (yeni/güncellenmiş use case — insert/update/error)

- [ ] Use case auth/admin/para/içerik domain'inde mi? → AuditLogger kullan
- [ ] Constructor'da `private readonly audit?: AuditLogger` optional argümanı var mı?
- [ ] `execute(..., ctx?: AuditContext)` ek parametre kabul ediyor mu?
- [ ] Update operasyonunda `before` snapshot alınıyor mu?
- [ ] Başarı VE başarısızlık path'lerinde log yazılıyor mu?
- [ ] `logAsync` kullanılmış mı (akış bloke olmuyor)?
- [ ] Controller `auditContextFromRequest(req)` ile ctx oluşturup geçiyor mu?
- [ ] AuditLogger DI verilmediğinde fallback structured logger çağrısı var mı?
- [ ] PII (password, JWT, kart, recovery code) audit metadata'ya sızmıyor mu?
- [ ] `AuditAction` enum'da uygun bir değer mevcut mu? Yoksa schema migration?
- [ ] `AuditAction` enum'da değer YOK ama insert/update yapıyorsa → en azından
      `logger.info('<domain>.<entity>.updated', { entityId, actorId, changedFields })`
      ile structured log yazıldı mı? (Migration sonrası audit'e taşınır.)

## Checklist (servis/provider veya cron katmanı — use case dışı insert/update)

- [ ] Servis adı `*.service.ts` / `*-provider.service.ts` / `*Cron.ts` ve içinde
      doğrudan `prisma.<model>.create/update/delete` çağrısı var mı?
- [ ] Varsa: update + `auditLog.create` (veya `auditLogger.logAsync`) **aynı `$transaction`**
      içinde mi (atomik audit)?
- [ ] `actorId` parametresi imzaya eklendi mi? (Cron / sistem akışlarında `null` geçilir
      ama imza zorunlu — controller'dan tetikleniyorsa pass edilir.)
- [ ] Controller bu servisi çağırırken `actorId`'i geçiriyor mu? (TestsService.publish
      ↔ TestPublishProvider.publish gibi sarmalayıcı katmanlarda actorId yutulmamalı.)
- [ ] `Logger` ile başarı satırı düşürülüyor mu? (`msg: '<domain>.<action>'`, structured.)

İlgili skill'ler: `idempotency` (webhook), `security-hardening` (secret yönetimi), `release-engineering` (deployment).
