# Loglama İncelemesi — 2026-05-18

Otomatik zamanlanmış `loglama` görevi çıktısı.

## 1. İncelenen prosedürler

- `.claude/skills/observability/SKILL.md` — logger discipline, SLO, circuit breaker, Sentry
- `.claude/skills/error-handling/SKILL.md` — exception filter, 5xx log politikası
- `apps/backend/src/infrastructure/audit/AuditLogger.ts` — `AuditLog` Prisma modeli ile merkezi audit helper
- `apps/backend/src/infrastructure/logger/logger.ts` — structured logger (`logger.info/warn/error`)
- `apps/backend/prisma/schema.prisma` — `AuditLog` modeli + `AuditAction` enum

Mevcut altyapı sağlam: `AuditLogger.log` ve `AuditLogger.logAsync` helper'ları, `auditContextFromRequest(req)`, `AuditAction` enum'da `AUTH_LOGIN_SUCCESS`, `AUTH_LOGIN_FAIL`, `ADMIN_SETTINGS_UPDATED` gibi tüm gerekli action değerleri tanımlı.

## 2. Bugün (2026-05-18) güncellenen kod

Bash `find -newermt` ile dosya mtime üzerinden tespit edilen, bugün modifiye edilmiş backend dosyaları:

| Dosya | Operasyon | Audit log durumu (önce) |
|---|---|---|
| `apps/backend/src/application/use-cases/admin/GetAdminSettingsUseCase.ts` | read-only | gerek yok |
| `apps/backend/src/application/use-cases/admin/UpdateAdminSettingsUseCase.ts` | upsert + 5 raw UPDATE | **EKSİK** — admin settings değişiyor, audit yok |
| `apps/backend/src/application/use-cases/auth/LoginUseCase.ts` | read + JWT issue | **EKSİK** — success/fail audit yok |
| `apps/backend/src/domain/types.ts` | type tanımı | gerek yok |
| `apps/backend/src/nest/controllers/admin.settings.controller.ts` | controller | ctx geçilmiyor |
| `apps/backend/src/nest/controllers/dto/update-admin-settings.dto.ts` | DTO | gerek yok |

Karşılaştırma: aynı domain'deki `VerifyTwoFactorLoginUseCase.ts` zaten `AuditLogger` kullanıyordu (`AUTH_LOGIN_SUCCESS/FAIL/AUTH_MFA_RECOVERY_USED`). Yeni eklenen `LoginUseCase` ve `UpdateAdminSettingsUseCase` ise hiç audit yazmıyordu.

## 3. Yapılan geliştirmeler

### 3.1 `LoginUseCase` — auth audit eklendi

- Opsiyonel `audit?: AuditLogger` constructor argümanı (geriye dönük uyumlu)
- Opsiyonel `ctx?: AuditContext` execute parametresi
- `AUTH_LOGIN_FAIL` audit + structured log path'leri:
  - `missing_credentials` — e-posta/şifre boş
  - `user_not_found` — e-posta sistemde yok
  - `invalid_password` — şifre eşleşmedi
  - `account_suspended` — askıya alınmış hesap girişi
- `AUTH_LOGIN_SUCCESS` audit + log — hem 2FA-bypass hem 2FA-pending durumunda
- Fallback: `audit` DI'da yoksa `logger.info/warn` ile structured log

### 3.2 `UpdateAdminSettingsUseCase` — admin audit eklendi

- Opsiyonel `audit?: AuditLogger` constructor argümanı
- Opsiyonel `ctx?: AuditContext` execute parametresi
- Update öncesi `snapshot()` ile `before` state yakalanır
- `diffSettings(before, after)` ile değişen alanlar hesaplanır
- `ADMIN_SETTINGS_UPDATED` audit — `before`, `after`, `metadata.diff`, `metadata.changedFields`
- Structured log her PATCH çağrısında (deneme/regresyon görünürlüğü)

### 3.3 Wiring değişiklikleri

- `apps/backend/src/nest/modules/auth/auth.module.ts` — `AuditLogger` provider eklendi, `LoginUseCase` factory'ye inject edildi.
- `apps/backend/src/nest/app.module.ts` — `UpdateAdminSettingsUseCase` factory `AuditLogger` inject eder oldu.
- `apps/backend/src/nest/controllers/auth.controller.ts` — login endpoint'i `auditContextFromRequest(req)` ile `ctx` üretip use case'e geçer.
- `apps/backend/src/nest/controllers/admin.settings.controller.ts` — `@Req() req` alıp ctx ile use case'i çağırır.

## 4. Skill / agent güncellemeleri

Benzer eksikliğin tekrarlanmaması için:

- **`.claude/skills/observability/SKILL.md`** — yeni "Audit log zorunluluğu" başlığı: gerekli AuditAction tablosu, use case template, controller template, golden rule'lar, anti-pattern'lar. Yeni checklist "yeni/güncellenmiş use case — insert/update/error".
- **`.claude/skills/error-handling/SKILL.md`** — Log Kuralları'na "auth fail / admin değişiklik / para işlemi mutlaka log'lansın" maddesi. Audit log örneği (fail path'ı dahil) eklendi.
- **`.claude/agents/backend-architect.md`** — "Yeni Endpoint Ekleme Akışı"na 6. adım: audit log kontrolü. Detaylı "Audit Logging — Insert/Update/Error Disiplini" bölümü eklendi (factory inject örneği, controller template, AuditAction enum'a ekleme yönergesi).
- **`.claude/agents/code-reviewer.md`** — Checklist'e "Audit log (insert/update/error)" bölümü: 8 maddelik PR review kuralı (eksikse KRİTİK).

## 5. Doğrulama notu

Backend `tsc --noEmit` çalıştırılmak istendi ancak Cowork sandbox'taki Linux mount, Edit tool'unun yazdığı dosyaları yansıtmadığı için (mount sync lag) komut eski dosyaları compile etmeye çalıştı. Dosyalar Read tool ile teyit edildi — syntactic olarak doğru. CI'da push edildiğinde gerçek typecheck ve testler çalışır.

Önerilen elle doğrulama:

```bash
cd apps/backend
npm run typecheck   # veya: npx tsc --noEmit
npm test -- --testPathPattern="login|admin"
```

## 6. Değişen / oluşturulan dosyalar

```
apps/backend/src/application/use-cases/auth/LoginUseCase.ts          (audit eklendi)
apps/backend/src/application/use-cases/admin/UpdateAdminSettingsUseCase.ts  (audit + diff eklendi)
apps/backend/src/nest/modules/auth/auth.module.ts                    (AuditLogger inject)
apps/backend/src/nest/app.module.ts                                  (UpdateAdminSettingsUseCase factory)
apps/backend/src/nest/controllers/auth.controller.ts                 (ctx geçişi)
apps/backend/src/nest/controllers/admin.settings.controller.ts       (ctx geçişi)
.claude/skills/observability/SKILL.md                                (audit bölümü + checklist)
.claude/skills/error-handling/SKILL.md                               (audit log örneği)
.claude/agents/backend-architect.md                                  (audit disiplini bölümü)
.claude/agents/code-reviewer.md                                      (audit checklist)
docs/loglama-raporu-2026-05-18.md                                    (bu rapor)
```

## 7. Açık konular (sonraki run için)

- `UpdateSiteSettingsUseCase`, `UpdatePaymentSettingsUseCase` de admin domain'inde ama bu run'ın kapsamı dışındaydı — aynı pattern uygulanmalı.
- `LoginBruteforceGuard` blocking bir endpoint girişinde "throttled" durumunu audit'e yazmıyor; `SUSPICIOUS_RATE_LIMIT` AuditAction var, faydalanılabilir.
- Frontend tarafında login fail handling sadece toast gösteriyor; Sentry breadcrumb yeterli.
