# ADR-0003: Multi-tenant — paylaşılan DB, paylaşılan şema, `tenantId` ayrımı

## Statü
Accepted

## Bağlam

Sınav Salonu SaaS modeli. Bir Anthropic, bir Coursera, bir kurumsal eğitim şirketi gibi farklı kuruluşların aynı altyapıyı paylaşmasını destekler. Üç ana multi-tenant pattern:

1. **Tenant başına ayrı DB:** En güçlü izolasyon, en pahalı (her kuruluş için provisioning).
2. **Aynı DB, ayrı şema:** Orta izolasyon, schema migration karmaşıklığı yüksek.
3. **Aynı DB, aynı şema, `tenantId` kolonu:** En esnek, izolasyon **uygulama düzeyinde**.

## Karar

**Seçenek 3: tek DB + tek şema + `tenantId` kolonu** her veri tablosunda.

```prisma
model ExamTest {
  id        String   @id @default(uuid())
  tenantId  String
  // ... diğer alanlar
  tenant    Tenant   @relation(fields: [tenantId], references: [id])
  @@index([tenantId, status, createdAt(sort: Desc)])
}
```

### İzolasyon mekanizması

1. **Middleware:** `tenantMiddleware` request'i alır, subdomain veya JWT içinden `tenantId` çıkarır, `req.tenant` koyar.
2. **Repository:** Her sorgu `where: { tenantId: ctx.tenantId, ... }` ile başlar. UNIQUE!
3. **Cross-tenant ARAMA YASAK:** `prisma.examTest.findFirst({ where: { id } })` (tenantId yok) çağrısı bulgu raporlanır (security-auditor agent).
4. **Background job:** Job payload'a `tenantId` ekli; worker o context'i restore eder.

### Cross-tenant operasyon (admin)

Süper-admin'in tüm tenant'lara erişimi olabilir → `req.user.role === 'SUPER_ADMIN'` ise tenant filter atlanır. Bu işlem audit log'a yazılır.

## Sonuçlar

**Olumlu**

- Provisioning maliyeti sıfır — yeni tenant insert query'sidir.
- Cross-tenant analytics kolay (admin paneli "tüm tenant'ların toplam satışı").
- Maintenance, backup, migration tek noktadan.

**Olumsuz / takas**

- **Tek bir kaçak query** (tenantId filter unutulmuş) tüm tenant verisi sızdırır. Test + lint disiplini şart.
- Çok büyük tenant'lar (>10x medyan) tabloyu skew'leyebilir → partition stratejisi gelecekte gerekir.
- Her tablo `tenantId` index'i + composite indexlerin ilk kolonu olmalı.
- Backup restore "sadece bir tenant" senaryosu zor (point-in-time restore + filtre gerekir).

## Alternatifler

- **DB-per-tenant** — Reddedildi: 100 tenant = 100 RDS instance. Maliyet.
- **Schema-per-tenant** — Reddedildi: PG'de schema sayısı arttıkça migration time çığ gibi büyür.
- **Sharded by tenantId (Citus)** — Gelecek hedef. >1000 tenant'ta ölçek için.

## Uygulama notları

- `apps/backend/src/middleware/tenant.middleware.ts` — `req.tenant.id` set eder.
- Test'lerde `dev-tenant` default (`DEFAULT_TENANT_ID` env).
- Auditor agent permission matrix testi tenant cross-access için ayrı senaryo yazar.
- Tablo başına `tenantId String` + ilişki kuralı: `onDelete: Restrict` (tenant silinirse veri kalır, manuel temizlik).

## Risk azaltma

- **Linter:** Custom ESLint rule veya `dependency-cruiser` ile repository sorgularında `tenantId` field'ı zorunlu (geliştirme aşaması).
- **Integration test:** Tenant A token'ı ile Tenant B kaydı çağırılır → 404 beklenir (not 403, varlığı sızdırmasın).
- **Audit log:** Cross-tenant erişim (admin ile) her zaman loglanır.

## Tarih

Q4 2025 — `Tenant` modeli ve `tenantId` foundation eklendi.

## İlgili

- ADR-0001 (Clean Architecture)
- Agent: `security-auditor` — tenant izolasyon kontrolü
- Skill: `security-hardening` — tenant kaçak checklist
