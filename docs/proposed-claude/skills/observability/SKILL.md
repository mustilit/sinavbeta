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

İlgili skill'ler: `idempotency` (webhook), `security-hardening` (secret yönetimi), `release-engineering` (deployment).
