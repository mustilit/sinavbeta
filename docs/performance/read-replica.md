# Read Replica Stratejisi — Prisma + PostgreSQL

KALITE-DEGERLENDIRME §4 (Verimlilik) önerisi. Raporlama ve analytics sorgularını primary'den ayırarak transactional yükü koru.

## Ne zaman gerek

Hangi sorgular replica'ya gider?

| Sorgu sınıfı | Hedef |
|---|---|
| `POST/PUT/DELETE`, `BEGIN TX` | Primary (kesin) |
| `GET /marketplace/...` (popüler liste) | Replica (eventually consistent OK) |
| `GET /educator/dashboard/stats` | Replica |
| `GET /admin/reports/...` | Replica |
| `GET /me`, `GET /attempts/:id` | Primary (kullanıcı hemen yeni veriyi görmek ister) |
| Background analytics job | Replica |
| Backup `pg_dump` | Replica (primary'i yormaz) |

**Kural:** Read-after-write garantisi gerekiyorsa primary. Saniye gecikmeye toleranslıysa replica.

## Mimari

```
                       ┌─────────────────┐
                       │  Load Balancer  │
                       └────────┬────────┘
                                │
                       ┌────────▼────────┐
                       │  Backend Pods   │
                       └────────┬────────┘
                                │
                  ┌─────────────┴──────────────┐
                  │                            │
            (write + read-after-write)    (read-only)
                  │                            │
        ┌─────────▼─────────┐         ┌────────▼─────────┐
        │   Postgres        │ replic. │  Read Replica    │
        │   PRIMARY         │ ──────▶ │  (1+ instance)   │
        │ (port 5432)       │         │ (port 5432)      │
        └───────────────────┘         └──────────────────┘
```

AWS RDS: Multi-AZ + Read Replica (otomatik replikasyon).
Self-hosted: Streaming replication (`pg_basebackup` + `recovery.conf`).

## Prisma — iki client pattern

Prisma 5.x native multi-database desteklemediği için iki ayrı `PrismaClient` instance:

```ts
// apps/backend/src/infrastructure/database/prisma.ts
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL },  // PRIMARY
  },
});

// Replica varsa, ayrı client:
export const prismaReplica = process.env.DATABASE_REPLICA_URL
  ? new PrismaClient({
      datasources: {
        db: { url: process.env.DATABASE_REPLICA_URL },
      },
    })
  : prisma;  // Fallback: replica yoksa primary'i kullan
```

`.env`:
```
DATABASE_URL=postgresql://user:pass@primary:5432/sinavsalonu
DATABASE_REPLICA_URL=postgresql://user:pass@replica:5432/sinavsalonu
```

## Repository pattern güncellemesi

Mevcut repository constructor'ı primary'i alıyor. Replica desteği için:

```ts
// apps/backend/src/infrastructure/repositories/ReportingTestRepository.ts
export class ReportingTestRepository {
  constructor(
    private readonly read: PrismaClient,   // replica
    // Write yok — bu repo SADECE read.
  ) {}

  async topSellers(tenantId: string, days = 30) {
    return this.read.examTest.findMany({
      where: { tenantId, /* ... */ },
      orderBy: { purchaseCount: 'desc' },
      take: 20,
    });
  }
}
```

Module DI:

```ts
// apps/backend/src/nest/modules/reporting.module.ts
{
  provide: ReportingTestRepository,
  useFactory: () => new ReportingTestRepository(prismaReplica),
}
```

## Use Case rehberi

```ts
// READ-ONLY use case:
class GetTopSellersUseCase {
  constructor(private readonly reportingRepo: ReportingTestRepository) {}
  async execute(tenantId) { return this.reportingRepo.topSellers(tenantId); }
}

// READ-AFTER-WRITE use case:
class CreatePurchaseUseCase {
  constructor(
    private readonly purchaseRepo: PurchaseRepository,  // primary
  ) {}
  async execute(...) {
    const purchase = await this.purchaseRepo.create(...);   // primary write
    // 5 saniye içinde tekrar okumak istersek primary'den oku (replica gecikmeli olabilir)
    return this.purchaseRepo.findById(purchase.id);
  }
}
```

## Replication lag izleme

PostgreSQL'de:

```sql
SELECT
  client_addr,
  application_name,
  state,
  pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn) AS lag_bytes,
  (now() - reply_time)::interval AS lag_time
FROM pg_stat_replication;
```

Replica `lag_time > 5s` → alarm (Sentry breadcrumb + Slack). 30s üzeri → otomatik fallback primary'e.

## Health check entegrasyonu

`/health/full` (observability skill) replica check eklenir:

```ts
async checkReplica() {
  if (!process.env.DATABASE_REPLICA_URL) return { ok: true, skipped: true };
  try {
    await prismaReplica.$queryRaw`SELECT 1`;
    const lag = await prismaReplica.$queryRaw<{ lag_seconds: number }[]>`
      SELECT EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp())) AS lag_seconds
    `;
    return { ok: lag[0].lag_seconds < 30, lagSeconds: lag[0].lag_seconds };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
```

## Failover

Primary down olunca:

1. **AWS RDS Multi-AZ:** Standby otomatik promote (~60s downtime).
2. **Self-hosted:** `pg_promote()` ile manuel veya `Patroni` ile otomatik.
3. Connection string DNS'i güncellenir (Route53 weighted veya app reload).

App tarafında: connection retry + exponential backoff. Prisma 5.x `RetryStrategy` desteklemez → use case'lerde `try/catch + retry` veya `opossum` circuit breaker.

## Maliyet etkisi

Read replica = +%50–100 DB maliyeti (instance + storage + IO + cross-AZ traffic).

Eşik: primary `pg_stat_database.tup_fetched` > 10M/saat veya CPU > %70 → replica zamanı geldi.

## İlgili

- KALITE-DEGERLENDIRME §4
- ADR-0005 (Prisma — yazıldığında ekle)
- Skill: `observability` (replication lag monitor)
