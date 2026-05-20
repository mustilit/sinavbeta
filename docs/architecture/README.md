# Mimari Diyagramları

KALITE-DEGERLENDIRME §10 (Dokümantasyon) önerisi. C4 modeli (Context → Container → Component) + kritik akış sequence diyagramları.

## Dosyalar

| Dosya | Anlatı |
|---|---|
| [c4-context.mmd](./c4-context.mmd) | C4 Level 1 — Sistem ve dış aktörler |
| [c4-container.mmd](./c4-container.mmd) | C4 Level 2 — Container'lar (FE, BE, DB, Redis, S3) |
| [sequence-purchase.mmd](./sequence-purchase.mmd) | Satın alma akışı (idempotency + webhook) |

## Render

```bash
# Tarayıcıda: VS Code "Markdown Preview Mermaid Support" extension'ı
# Komut satırı:
npx -y @mermaid-js/mermaid-cli@latest -i docs/architecture/c4-container.mmd -o docs/architecture/c4-container.png
```

VS Code'da `.mmd` dosyasını aç → preview butonu.

## Eklenmeli (yol haritası)

- `c4-component-backend.mmd` — Backend içi (Controller → Use Case → Repository → Prisma)
- `c4-component-frontend.mmd` — Frontend içi (Page → TanStack Query → dalClient → API)
- `sequence-live-session.mmd` — Canlı sınav akışı (heartbeat + polling)
- `sequence-refund.mmd` — İade talebi + admin onayı
- `er-diagram.mmd` — Prisma şema → ER (otomatik üretim için `prisma-erd-generator` package)

## ER diagram (otomatik)

```bash
cd apps/backend
npm install --save-dev prisma-erd-generator
# schema.prisma'ya:
#   generator erd {
#     provider = "prisma-erd-generator"
#     output   = "../../docs/architecture/er-diagram.svg"
#   }
npx prisma generate
```

## CLAUDE.md import (opsiyonel)

ADR ve C4 diyagramlarına `CLAUDE.md` içinden referans ver:

```markdown
## İmportlar
@docs/adr/0001-clean-architecture.md
@docs/adr/0003-multi-tenant-shared-db.md
@docs/architecture/c4-container.mmd
```

Bu sayede yeni geliştirici ilk gün mimariye okumadan kod yazmaya başlamaz.
