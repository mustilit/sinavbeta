# Migration Planı — Audit log derinleştirme + 2FA

KALITE-DEGERLENDIRME §7 (Güvenlik) §8 Audit log + 2FA önerileri.

> Migration dosyaları `apps/backend/prisma/migrations/` altında pre-commit hook ile
> korunuyor. Aşağıdaki şemayı `apps/backend/prisma/schema.prisma`'ya elle ekleyip
> `npm run db:migrate` ile yeni migration oluşturulması önerilir. Otomatik üretim
> migration adlandırma + sıralama kontrolünü atlayacağı için tercih edilmez.

## 1. Audit log derinleştirme

Mevcut `AuditLog` modeli (`actorId`, `entityType`, `entityId`, `metadata`) yeterli sayılır ama eksikleri var:

- `tenantId` filtresi yok → tenant başına audit görüntüleme yavaş
- `actorEmail` / `actorRole` snapshot yok → user silinince geçmiş anlamı kaybolur
- `before` / `after` JSON snapshot yok → "ne değişti" görmek zor
- `ip` / `userAgent` yok → forensic için kritik

### Schema değişikliği

```prisma
model AuditLog {
  id          String      @id @default(uuid())
  tenantId    String?     // YENİ — eski kayıtlar null
  action      AuditAction
  entityType  String
  entityId    String
  actorId     String?
  actorEmail  String?     // YENİ — snapshot
  actorRole   String?     // YENİ — snapshot
  before      Json?       // YENİ
  after       Json?       // YENİ
  ip          String?     // YENİ
  userAgent   String?     // YENİ
  metadata    Json        @default("{}")
  createdAt   DateTime    @default(now())

  @@index([entityType, entityId])
  @@index([createdAt])
  @@index([tenantId, createdAt(sort: Desc)])   // YENİ
  @@index([actorId, createdAt(sort: Desc)])    // YENİ
  @@index([action, createdAt(sort: Desc)])     // YENİ
  @@map("audit_logs")
}
```

### Yeni AuditAction değerleri (2FA + admin için)

```prisma
enum AuditAction {
  // ... mevcutlar ...
  AUTH_MFA_ENABLED          // YENİ
  AUTH_MFA_DISABLED         // YENİ
  AUTH_MFA_RECOVERY_USED    // YENİ
  AUTH_LOGIN_SUCCESS        // YENİ (sadece ADMIN/EDUCATOR için yaz)
  AUTH_LOGIN_FAIL           // YENİ
  USER_ROLE_CHANGED         // YENİ
  USER_SUSPENDED            // YENİ
  USER_DELETED              // YENİ
  ADMIN_SETTINGS_UPDATED    // YENİ
  PAYOUT_PROCESSED          // YENİ
  BACKUP_RUN                // YENİ
  WEBHOOK_RECEIVED          // YENİ
  WEBHOOK_REJECTED          // YENİ (imza fail, replay vs.)
}
```

### Geriye dönük uyumluluk

- `tenantId` nullable kalır (eski kayıtlar etkilenmesin).
- `before` / `after` opsiyonel.
- Yeni enum değerleri eklenir, eskileri silinmez → tüm migration `ADD` semantiği.

## 2. 2FA (TOTP) — User tablosu eklemesi

### Schema değişikliği

```prisma
model User {
  // ... mevcut alanlar ...
  twoFactorEnabled    Boolean   @default(false)
  twoFactorSecret     String?   // AES-GCM ile encrypt edilmiş (uygulama anahtarı)
  twoFactorRecovery   String[]  // bcrypted 10 recovery code
  twoFactorEnabledAt  DateTime?

  @@index([twoFactorEnabled])    // ADMIN/EDUCATOR zorunluluğu raporu için
}
```

### Encryption notu

`twoFactorSecret` veritabanında **plain** tutulamaz; tutarsa attacker DB dump'tan tüm 2FA'leri klonlar. İki seçenek:

1. **Uygulama düzeyi AES-GCM:** `APP_ENCRYPTION_KEY` env (32 byte). Her secret kendine random nonce ile şifrelenir.
2. **DB düzeyi (`pgcrypto`):** PostgreSQL `pgcrypto.PGP_SYM_ENCRYPT` ile column-level encryption. Migration:
   ```sql
   CREATE EXTENSION IF NOT EXISTS pgcrypto;
   -- Sonra Prisma'da raw query ile encrypt/decrypt
   ```

Uygulama düzeyi tercih edilir (DB taşınabilirliği ve key rotation kolaylığı için). Helper: `apps/backend/src/infrastructure/security/encryption.ts`.

## 3. Migration oluşturma (manuel)

```bash
cd apps/backend
# 1) schema.prisma'yı manuel düzenle (yukarıdaki bloklar)
# 2) Migration üret:
npx prisma migrate dev --name audit-2fa-extension

# 3) Schema'ya başvuran kodu güncelle:
npx prisma generate
```

Üretilen SQL'i gözden geçir:

- `ALTER TABLE audit_logs ADD COLUMN ...` → veri kaybı yok ✓
- `ALTER TYPE "AuditAction" ADD VALUE ...` → PostgreSQL'de bu **non-transactional**, deploy'da dikkat. Stage2 preflight script bunu detect etmeli.
- `ALTER TABLE users ADD COLUMN twoFactorEnabled BOOLEAN NOT NULL DEFAULT false` → büyük tabloda 50M satır varsa `NOT NULL DEFAULT` direk ekleme yavaş; aşağıdaki yaklaşım daha güvenli:

```sql
-- Stage 1: Nullable ekle
ALTER TABLE users ADD COLUMN "twoFactorEnabled" BOOLEAN;
-- Stage 2: Backfill
UPDATE users SET "twoFactorEnabled" = false WHERE "twoFactorEnabled" IS NULL;
-- Stage 3: NOT NULL + DEFAULT
ALTER TABLE users ALTER COLUMN "twoFactorEnabled" SET NOT NULL;
ALTER TABLE users ALTER COLUMN "twoFactorEnabled" SET DEFAULT false;
```

Mevcut `db:preflight:stage2` script bu pattern'i koruyor; oraya eklenmeli.

## 4. Rollback planı

Audit log eklemeleri:
- `ALTER TABLE audit_logs DROP COLUMN tenantId, actorEmail, actorRole, before, after, ip, userAgent` → veri kaybı (kabul edilebilir, rollback senaryosunda zaten geri dönüyoruz).

2FA eklemeleri:
- `ALTER TABLE users DROP COLUMN ...` → tüm 2FA bilgisi kaybolur. Production'da uyarı + manuel onay.

Enum değerleri PostgreSQL'de tek tek silinemez → tüm enum'u recreate gerekir. Pratik rollback: yeni değerleri kullanmamak, ama enum'da bırakmak (no-op).

## Sıralama

1. `chore(prisma): extend AuditLog schema for tenant/actor snapshot/ip` — düşük risk PR
2. `feat(auth): scaffold 2FA TOTP service` — feature flag arkasında (`FEATURE_2FA=1`)
3. `feat(security): require 2FA for ADMIN/EDUCATOR` — son adım, kademeli rollout (önce ADMIN, sonra EDUCATOR)

## İlgili

- `docs/proposed-claude/skills/security-hardening/SKILL.md` — 2FA + audit log pattern detayları
- `apps/backend/src/infrastructure/audit/AuditLogger.ts` — helper (aşağıda iskelet)
- `apps/backend/src/application/use-cases/auth/SetupTwoFactorUseCase.ts` — use case iskeleti
