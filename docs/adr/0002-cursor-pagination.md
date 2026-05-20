# ADR-0002: Cursor pagination disiplini

## Statü
Accepted

## Bağlam

Marketplace'in büyüyebilen listeleri var: `Test`, `TestPackage`, `Purchase`, `Review`, `Objection`, `Notification`, `AuditLog`, `LiveParticipant`. Offset pagination (`OFFSET N`) sayfa numarası ilerledikçe yavaşlar: PG `OFFSET 10000`'de önceki 10000 satırı **okur sonra atar**. 100k satırda görünür yavaşlık başlar.

Ayrıca offset pagination concurrent yazımda **kayıp/duplikat** verir (yeni kayıt eklenince sayfa kayar).

## Karar

Büyüyebilen tüm listeler **cursor pagination** kullanır:

```ts
const items = await prisma.test.findMany({
  where: { tenantId, status: 'PUBLISHED' },
  orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  cursor: cursorId ? { id: cursorId } : undefined,
  skip: cursorId ? 1 : 0,
  take: limit + 1, // +1: hasMore kontrolü
});
const hasMore = items.length > limit;
const trimmed = hasMore ? items.slice(0, limit) : items;
const nextCursor = hasMore ? trimmed[trimmed.length - 1].id : null;
return { items: trimmed, nextCursor };
```

### Composite index zorunluluğu

WHERE + ORDER BY kombinasyonu için:

```prisma
@@index([tenantId, status, createdAt(sort: Desc), id(sort: Desc)])
```

İlk alanlar `equality` (tenantId, status), sonrasında `range/sort` (createdAt), son `tie-breaker` (id). Bu sıra olmadan PG sequential scan'e düşer.

### offset HALA kullanılabilir?

Evet, ama sadece **sabit küçük listelerde**:

- Admin paneli `users` listesi (toplam < 1000) → offset OK.
- Educator dashboard "son 10 satın alma" → cursor değil, direkt limit yeterli.

Genel kural: liste teorik olarak büyüyebiliyorsa cursor. Sınırlı küçük listeyse offset.

## Sonuçlar

**Olumlu**

- Sayfa derinliğinden bağımsız sabit performans.
- Concurrent yazım altında stable sıralama.
- Composite index disiplini → PG plan'ları öngörülebilir.

**Olumsuz / takas**

- "5. sayfaya direkt git" gibi UX yapamazsın — yalnız next/prev mantığı.
- Backend response shape değişir: `{ items, nextCursor }` (sayfa numarası yok).
- Frontend `TanStack Query`'de `useInfiniteQuery` kullanılır (regular `useQuery` değil).

## Alternatifler

- **Keyset pagination (manual)** — Cursor pagination'ın kendisi keyset. Prisma `cursor` API sadece syntactic sugar.
- **Offset her yerde** — Reddedildi: ölçek sorunu.
- **Search-after (Elasticsearch)** — Şu an PG yeterli; ES'e geçilirse aynı pattern korunur.

## Uygulama notları

- Skill: `.claude/skills/pagination/SKILL.md`
- CLAUDE.md → "Cursor pagination + composite index disiplini"
- 48 composite index Prisma şemasında mevcut (PG `\d` ile doğrula).

## İzleme

`pg_stat_user_indexes` üzerinden index hit ratio takip et. `idx_scan / (idx_scan + seq_scan) < %95` ise index eksik veya bozulmuş.

## Tarih

Q1 2026 başında karar verildi, schema'ya 24 migration ile uygulandı.

## İlgili

- ADR-0001 — Clean Architecture (repository pattern cursor pagination uygular)
- Skill: pagination
