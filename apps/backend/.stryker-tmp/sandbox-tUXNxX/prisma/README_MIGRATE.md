# Migration (Docker açıkken)

Bu migration'ı uygulamak için Docker açıkken backend container'da:

```bat
docker compose exec backend sh -lc "npx prisma migrate dev --name user_status_enum_and_educator_approvedat --schema=prisma/schema.prisma"
docker compose exec backend sh -lc "npx prisma generate --schema=prisma/schema.prisma"
```

Veya proje kökünden (backend dizininde):

```bat
npx prisma migrate dev --name user_status_enum_and_educator_approvedat --schema=prisma/schema.prisma
npx prisma generate --schema=prisma/schema.prisma
```

Mevcut migration dosyası: `migrations/20260226120000_user_status_enum_and_educator_approvedat/migration.sql`  
- `UserStatus` enum oluşturulur; `users.status` TEXT → UserStatus dönüştürülür (bilinmeyen değerler ACTIVE yapılır).

**Objection answer/SLA (FR-E-08):**  
- `migrations/20260227120000_objection_answer_sla_status/migration.sql` — ObjectionStatus enum; answerText, escalatedAt; status → enum.  
- `migrations/20260228120000_objection_answeredAt_and_owner_join/migration.sql` — answeredAt kolonu (ADD COLUMN IF NOT EXISTS).

**Docker açıkken (iki objection migration’ı sırayla uygular):**
```bat
docker compose exec backend sh -lc "npx prisma migrate dev --schema=prisma/schema.prisma"
docker compose exec backend sh -lc "npx prisma generate --schema=prisma/schema.prisma"
```
