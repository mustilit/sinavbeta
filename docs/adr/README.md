# Architecture Decision Records (ADR)

Mimari kararlar, neden alındıkları, alternatifleri ve sonuçları ile birlikte burada belgelenir. Format: [MADR](https://adr.github.io/madr/) (Markdown Architectural Decision Records).

## Numara verme

`NNNN-<kısa-başlık>.md`. NNNN dört basamaklı sıralı.

## Statü

- **Proposed** — taslak, henüz onaylanmadı
- **Accepted** — kabul edildi, uygulanıyor
- **Deprecated** — geçerli ama daha iyisi var
- **Superseded by ADR-XXXX** — yerine başka karar geldi

## Dizin

| Numara | Başlık | Statü |
|---|---|---|
| [0001](./0001-clean-architecture.md) | Clean Architecture + Use Case katmanı | Accepted |
| [0002](./0002-cursor-pagination.md) | Cursor pagination disiplini (offset değil) | Accepted |
| [0003](./0003-multi-tenant-shared-db.md) | Multi-tenant tek DB + `tenantId` | Accepted |
| [0004](./0004-jwt-stateless-auth.md) | JWT stateless auth + role guard | Accepted |
| [0005](./0005-prisma-as-orm.md) | Prisma ORM + tek `schema.prisma` | Accepted |
| [0006](./0006-react-vite-frontend.md) | Frontend: React 18 + Vite (Next.js değil) | Accepted |
| [0007](./0007-uri-versioning.md) | API versiyonlama: URI prefix (`/v1/`) | Accepted |

## Yeni ADR yazma

```bash
# 1) Yeni dosya:
touch docs/adr/0008-my-decision.md

# 2) Şablon:
```

```markdown
# ADR-NNNN: <Başlık>

## Statü
Proposed | Accepted | Deprecated | Superseded by ADR-XXXX

## Bağlam
Hangi sorun? Hangi kısıtlar?

## Karar
Ne yaptık?

## Sonuçlar
- Olumlu
- Olumsuz / takas

## Alternatifler
Reddedilenler ve nedeni.

## Tarih
YYYY-MM-DD
```

## İlgili

- C4 diyagramları: `docs/architecture/c4-context.mmd`, `c4-container.mmd`
- CLAUDE.md — Çalışma kuralları
