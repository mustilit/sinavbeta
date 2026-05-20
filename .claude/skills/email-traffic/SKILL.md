---
name: email-traffic
description: Mail trafiği yönetim modülü — 3 kuyruk (critical/notify/bulk) + multi-provider (Brevo API + SMTP fallback) + EmailLog/EmailEvent/SuppressedEmail/EmailProviderConfig/EmailTemplate. Granüler kill switch matrisi (rol × queue), User.emailPreferences kontrolü, AES-256-GCM ile şifreli sağlayıcı secret'ları, KVKK 90-gün anonimleştirme, bounce webhook akışı. Mail gönderme akışı eklerken, yeni şablon yazarken, sağlayıcı entegre ederken, admin paneline mail kontrolü eklerken referans alın.
---

# Mail Trafiği — Sınav Salonu

> Bu skill'in detaylı implementation prompt'u: `docs/plans/email-traffic-prompt.md`. Burada modülün **kalıcı domain bilgisi ve invariant'ları** tutulur — kod yazılırken hatırlanması gerekenler.

## Amaç

Tüm giden mail trafiğini kuyruğa alıp, çoklu sağlayıcı üzerinden güvenilir biçimde göndermek, granüler kontrol ve tam audit sağlamak. Ücretli SaaS plan zorunluluğu olmadan (Brevo ücretsiz katman + kullanıcı sahipli SMTP).

## Temel İlkeler

1. **Hiçbir mail senkron gönderilmez.** Tüm mailler `EmailService.send()` → kuyruk → worker akışıyla. HTTP submit saniye altı olmalı.
2. **CRITICAL kuyruğu istisna kuralı:** Şifre sıfırlama, ödeme makbuzu, iade onayı, hesap güvenliği, suspend/ban bildirimi — bunlar kullanıcı preference'larından **etkilenmez**. Diğer hiçbir kuyruk böyle değil.
3. **Kill switch grid:** Admin maili rol (Eğitici / Aday / Staff) × kuyruk (Kritik / Bildirim / Toplu) bazında ayrı ayrı durdurabilmeli. Global master switch ayrıca var.
4. **Sağlayıcı zincirli:** Birincil sağlayıcı 5xx/429/timeout dönerse worker otomatik fallback'e geçer. Tek sağlayıcıya bağlanma yasak.
5. **Secret asla plaintext dönmez.** API key'ler ve SMTP şifreleri AES-256-GCM ile şifrelenir; API yanıtlarında her zaman mask'lenir.
6. **KVKK 90 gün anonimleştirme:** `EmailLog.htmlBody/textBody/templateData` 90 gün sonra cron tarafından null'lanır; satır ve metrikler kalır.

## Domain Modelleri

### EmailProviderConfig

Sağlayıcı yapılandırması. Admin panelinden eklenir/düzenlenir. **Kullanıcının kendi kurumsal SMTP'sini buraya bağladığı yer.**

- `id, tenantId, name, kind (BREVO_API | SMTP | CONSOLE), priority (küçük = birincil), isActive, fromEmail, fromName, replyToEmail`
- `encryptedSecrets` — JSON encrypted (AES-256-GCM, IV+ciphertext+authTag concat). `.env`'deki `EMAIL_SECRETS_KEY` ile çözülür.
- `dailySentCount, dailyResetAt` — Brevo gibi günlük kotalı sağlayıcılarda izlenir; cap'e yaklaşınca worker bu sağlayıcıyı atlayıp fallback'e gider.
- `webhookSecret` — Brevo webhook'u için doğrulama.
- `lastSuccessAt, lastFailureAt, lastFailureReason` — admin sağlık panelinde görünür.

**CONSOLE provider yalnız `NODE_ENV !== 'production'`** durumunda aktive edilebilir. Üretimde başlatma sırasında hata fırlat.

### EmailTemplate

- `id, tenantId, key (örn. "password-reset"), version, subject, htmlPath, textPath, defaultQueue, isActive, description`
- Şablon dosyaları `apps/backend/src/infrastructure/email/templates/` altında Handlebars formatında.
- Her template için **plaintext fallback** önerilir; CRITICAL kuyruğu için zorunlu.
- `@@unique([tenantId, key, version])` — eski versiyonlar tutulur, sadece `isActive = true` olanı kullanılır.

### EmailLog

Her gönderim girişimi için **tek satır**. Tüm trafiğin tek doğru kaynağı.

- `id, tenantId, recipientUserId (nullable — sistem maili olabilir), recipientEmail, recipientRole, templateKey, templateVersion, queue, status, subject`
- İçerik: `htmlBody, textBody, templateData` — **90 gün sonra null'lanır.**
- Sağlayıcı: `providerConfigId, providerKind, providerMessageId` (webhook eşlemesi için kritik).
- Hata: `attemptCount, lastErrorMessage, lastErrorCode`.
- Zaman: `queuedAt, sentAt, deliveredAt, bouncedAt`.
- Bağlam: `relatedEntityType, relatedEntityId` (örn. "Purchase", "Refund").

**Status enum'u (anlamı kritik):**
- `QUEUED` — kuyruğa düştü, worker'ı bekliyor
- `SENDING` — worker aldı, sağlayıcıya gönderiyor
- `SENT` — sağlayıcı kabul etti (provider messageId döndü)
- `DELIVERED` — sağlayıcı webhook'u "teslim edildi" dedi
- `BOUNCED` — adres döndü (hard veya soft)
- `COMPLAINED` — kullanıcı spam'a attı
- `FAILED` — son denemede hata, retry tükenmedi
- `SUPPRESSED` — SuppressedEmail eşleşmesi, gönderilmedi
- `BLOCKED_BY_PREFS` — kullanıcı tercihiyle reddedildi
- `BLOCKED_BY_ADMIN` — kill switch nedeniyle reddedildi
- `DEAD_LETTER` — tüm retry'lar tükendi

### EmailEvent

Her `EmailLog` için 1-N olay. Zaman çizgisi gösterimi için.

- `id, tenantId, emailLogId, eventType, occurredAt, source ("worker" | "provider_webhook" | "manual"), meta`
- Webhook'tan gelen open/click/bounce burada saklanır.

### SuppressedEmail

Otomatik suppression list. Worker mail göndermeden önce bu tabloyu kontrol eder.

- `id, tenantId, email (normalize: lowercase + trim), reason, source, note, createdBy, expiresAt`
- `@@unique([tenantId, email])`.
- **Otomatik ekleme:** Brevo webhook'undan `hardBounce` veya 3 ardışık `softBounce` → ekle. `spam` complaint → kalıcı ekle.
- **Soft bounce:** `expiresAt = now + 30 gün`, cron süre dolunca otomatik kaldırır.
- **Manuel ekleme:** Admin panelinden, `source = "manual"`.

### User alanları

```prisma
emailPreferences      Json     @default("{...7 alan...}")
emailUnsubscribeToken String?  @unique
```

`emailPreferences` şeması (kod tarafı tip):
```ts
type EmailPreferences = {
  marketing: boolean;            // kampanya/duyuru
  weeklyDigest: boolean;         // haftalık özet
  productUpdates: boolean;       // yeni özellik
  reviewNotifications: boolean;  // değerlendirme bildirimi
  objectionUpdates: boolean;     // itiraz güncellemesi
  liveSessionInvites: boolean;   // canlı sınav daveti
  refundUpdates: boolean;        // iade durum (CRITICAL ise override)
};
```

### AdminSettings — kill switch grid

| Hedef rol | Kritik | Bildirim | Toplu |
|---|---|---|---|
| Eğitici | `emailEducatorCriticalEnabled` | `emailEducatorNotifyEnabled` | `emailEducatorBulkEnabled` |
| Aday | `emailCandidateCriticalEnabled` | `emailCandidateNotifyEnabled` | `emailCandidateBulkEnabled` |
| Staff | `emailStaffCriticalEnabled` | `emailStaffNotifyEnabled` | — |

Ayrıca: `emailEnabled` (global master), `emailDailyCapPerUser` (varsayılan 20, CRITICAL hariç), `emailBounceRateAlertThreshold` (varsayılan 0.02), `emailRetentionDays` (varsayılan 90).

## Üç Kuyruk Stratejisi

| Kuyruk | Kapsam | Concurrency | Rate | Retry | Örnek şablon |
|---|---|---|---|---|---|
| `email-critical` | Hesap güvenliği, ödeme, iade onayı | 5 | 60/dk | 3 | password-reset, purchase-receipt, refund-confirmation, educator-moderation-action |
| `email-notify` | İşlevsel bildirim | 3 | 30/dk | 3 | review-received, objection-update, live-session-invite |
| `email-bulk` | Kampanya, digest | 1 | 30/dk | 2 | weekly-digest, campaign-announcement, product-update |

**Kuyruk seçim mantığı:** `EmailTemplate.defaultQueue` öncelikli; çağıran taraf `forceQueue` ile override edebilir (örn. acil ödeme makbuzunu yanlış şablona düşürdüğünü düşünenler için).

## Gönderim Akışı (EmailService.send)

```
1. Template bul (key + isActive=true) → queue belirle
2. EmailDispatcher.shouldSend kuralları (sıra önemli):
   a) AdminSettings.emailEnabled false → BLOCKED_BY_ADMIN
   b) (recipientRole, queue) kombinasyonu kapalı → BLOCKED_BY_ADMIN
   c) SuppressedEmail eşleşmesi → SUPPRESSED
   d) queue !== CRITICAL && User.emailPreferences[mappedKey] === false → BLOCKED_BY_PREFS
   e) Son 24s EmailLog count > emailDailyCapPerUser && queue !== CRITICAL → BLOCKED_BY_PREFS
   f) ALLOWED
3. EmailLog kaydı yazılır (her durumda — engelleme bile log'lanır)
4. ALLOWED ise BullMQ'ya job push → saniye altı dönüş
```

## Worker Akışı (SendEmailJobProcessor)

```
1. EmailLog.status = SENDING, attemptCount++
2. ProviderRegistry.getActiveProviders(tenantId) priority sıralı liste
3. for each provider (primary → fallback):
   a) Eğer provider.dailySentCount > limit-20: skip (Brevo)
   b) provider.send(envelope) dene
   c) Başarı → providerMessageId kaydet, status = SENT, EmailEvent(SENT) → break
   d) 4xx (auth, invalid recipient): retry yok, log + ilerle
   e) 5xx, 429, timeout: fallback'e geç
4. Tüm provider'lar fail → BullMQ retry (1dk, 5dk, 30dk)
5. Son denemede fail → status = DEAD_LETTER, Sentry event
```

**Brevo günlük cap koruması:** Brevo ücretsiz katman 300/gün. Worker `dailySentCount >= 280` ise bu sağlayıcıyı atlar, fallback'e gider. `ResetProviderDailyCountUseCase` her gün 00:05 UTC sıfırlar.

## Sağlayıcılar (IEmailProvider)

`apps/backend/src/application/services/email/providers/IEmailProvider.ts` arayüzü:
```ts
interface IEmailProvider {
  readonly kind: EmailProviderKind;
  send(envelope: EmailEnvelope): Promise<ProviderResult>;
  // ProviderResult: { success, messageId?, errorCode?, errorMessage?, isRetryable }
}
```

### BrevoApiProvider

- Endpoint: `POST https://api.brevo.com/v3/smtp/email`
- Header: `api-key: <decrypted>`, `accept: application/json`, `content-type: application/json`
- Body fields: `sender, to, subject, htmlContent, textContent, headers, tags` (tags için `templateKey` gönder, dashboard'tan filtreleme).
- Header: `List-Unsubscribe: <https://...>, <mailto:...>` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (Gmail/Yahoo 2024 kuralı).
- Webhook: Brevo dashboard → `/webhooks/email/brevo?secret=<webhookSecret>` URL'i ekle. Olay tipleri: `delivered, hardBounce, softBounce, spam, opened, clicked, blocked, deferred`.

### SmtpProvider (nodemailer wrapper)

- `nodemailer.createTransport({ host, port, secure (465 ise true), auth: { user, pass }, pool: true, maxConnections: 5, tls: { rejectUnauthorized: true } })`
- Connection pool reuse zorunlu — her gönderim için yeni TCP açma.
- **Bounce algılaması yok** (SMTP-only). Phase 2: IMAP bounce mailbox polling. Phase 1'de admin manuel SuppressedEmail ekler.

### ConsoleProvider

- Dev/test için stdout dump.
- Üretimde aktive edilirse `OnModuleInit`'te hata fırlat.

## Şablon Yönetimi

Dizin: `apps/backend/src/infrastructure/email/templates/`

```
layouts/base.hbs         ← genel layout (header, footer, unsubscribe)
partials/button.hbs
partials/footer.hbs
<templateKey>.hbs        ← HTML
<templateKey>.txt        ← plaintext (CRITICAL için zorunlu)
```

**Render kuralları:**
- Handlebars compile + partial registration.
- Missing variable → render time error, log + fallback (sessizce boş bırakma).
- Footer'da company adresi (CAN-SPAM uyumu).
- BULK/NOTIFY maillerde unsubscribe link + `List-Unsubscribe` header zorunlu.

**Template → preference key haritası** (`apps/backend/src/application/services/email/preferenceMap.ts`):
- `password-reset, email-verification, purchase-receipt, refund-confirmation, account-security-alert, educator-moderation-action` → `null` (CRITICAL, override)
- `review-received` → `reviewNotifications`
- `objection-update` → `objectionUpdates`
- `live-session-invite` → `liveSessionInvites`
- `refund-status-update` → `refundUpdates`
- `weekly-digest` → `weeklyDigest`
- `campaign-announcement` → `marketing`
- `product-update` → `productUpdates`

## Bounce / Complaint Akışı

`POST /webhooks/email/brevo?secret=...` (HandleEmailWebhookUseCase):

```
1. Secret doğrula → 401 ise Sentry + reject
2. Payload eventType'a göre dispatch:
   - delivered → EmailLog.status = DELIVERED, EmailEvent
   - hardBounce → EmailEvent(HARD_BOUNCED) + SuppressedEmail (HARD_BOUNCE, kalıcı)
   - softBounce → EmailEvent(SOFT_BOUNCED); 3 ardışık ise SuppressedEmail (REPEATED_SOFT_BOUNCE, 30 gün)
   - spam → EmailEvent(COMPLAINED) + SuppressedEmail (SPAM_COMPLAINT, kalıcı)
   - opened/clicked → EmailEvent (yalnız tracking opt-in açıksa)
   - blocked/deferred → EmailEvent(FAILED), retry decision worker'da
3. providerMessageId ile EmailLog eşle
```

## Cron Jobs

| Cron | Use Case | Görev |
|---|---|---|
| Her dakika | `CheckBounceRateAlertUseCase` | Son 1 saat bounce/sent > 0.02 → bulk auto-pause + admin notify |
| 00:05 UTC | `ResetProviderDailyCountUseCase` | `EmailProviderConfig.dailySentCount = 0` |
| 02:00 | `AnonymizeOldEmailLogsUseCase` | 90 gün öncesi `htmlBody/textBody/templateData` → null |
| 03:00 | (SuppressedEmail temizlik) | `expiresAt < now` olanları sil |
| Pazartesi 09:00 | `SendWeeklyDigestUseCase` | Preference açık olanlara haftalık özet |

## Mevcut Use Case'lere Entegrasyon

Aşağıdaki Use Case'ler `SendEmailUseCase` enjekte etmeli ve uygun templateKey ile çağırmalı:

| Use Case | templateKey | queue |
|---|---|---|
| RegisterUserUseCase | `email-verification` | CRITICAL |
| RequestPasswordResetUseCase | `password-reset` | CRITICAL |
| CreatePurchaseUseCase | `purchase-receipt` | CRITICAL |
| ConfirmRefundUseCase | `refund-confirmation` | CRITICAL |
| RejectRefundUseCase | `refund-rejected` | NOTIFY |
| CreateReviewUseCase | `review-received` | NOTIFY |
| ResolveObjectionUseCase | `objection-update` | NOTIFY |
| CreateLiveSessionUseCase | `live-session-invite` | NOTIFY |
| ApplyModerationActionUseCase (suspend/ban) | `educator-moderation-action` | CRITICAL |
| BackupSchedulerService (fail) | `backup-failure-alert` | CRITICAL (admin'e) |

## API Endpoint'leri (Admin)

`apps/backend/src/nest/controllers/admin/EmailController.ts`:

| Yol | Use Case |
|---|---|
| `GET /admin/email/dashboard` | GetEmailTrafficMetricsUseCase |
| `GET /admin/email/logs` | ListEmailLogsUseCase (cursor pagination) |
| `GET /admin/email/logs/:id` | GetEmailLogDetailUseCase |
| `POST /admin/email/logs/:id/retry` | RetryFailedEmailUseCase |
| `GET /admin/email/providers` | ListProviderConfigsUseCase |
| `POST /admin/email/providers` | ManageProviderConfigUseCase (encrypt secrets) |
| `PATCH /admin/email/providers/:id` | ManageProviderConfigUseCase |
| `POST /admin/email/providers/:id/test` | TestProviderConfigUseCase |
| `GET/POST/DELETE /admin/email/suppressions` | ManageSuppressedEmailUseCase |
| `PATCH /admin/email/kill-switches` | ToggleEmailKillSwitchUseCase |
| `POST /webhooks/email/brevo` | HandleEmailWebhookUseCase (@Public + secret) |

Kullanıcı tarafı:
| Yol | Use Case |
|---|---|
| `GET /me/email-preferences` | GetUserEmailPreferencesUseCase |
| `PATCH /me/email-preferences` | UpdateUserEmailPreferencesUseCase |
| `GET /unsubscribe?token=...` | UnsubscribeViaTokenUseCase (@Public, HTML) |

Yeni `WorkerPermission` enum: `EMAIL_MANAGEMENT`.

## Frontend Sayfaları

Tümü `pages.config.js` + `React.lazy` ile kayıtlı.

| Sayfa | Route | Amaç |
|---|---|---|
| EmailDashboard | `/yonetim/mail/panel` | KPI + kuyruk derinliği + sağlayıcı sağlık |
| EmailKillSwitches | `/yonetim/mail/kontrol` | 3×3 grid kill switch matrisi + sebep textarea + audit |
| EmailProviders | `/yonetim/mail/saglayicilar` | Sağlayıcı CRUD (Brevo/SMTP), test maili, secret mask |
| EmailLogs | `/yonetim/mail/loglar` | Filtreli liste, cursor 50'şer |
| EmailLogDetail | `/yonetim/mail/loglar/:id` | Event timeline + HTML preview iframe + retry |
| EmailTemplates | `/yonetim/mail/sablonlar` | Şablon aktif/pasif, version |
| EmailSuppressions | `/yonetim/mail/engellenmis` | Manuel ekle/çıkar |
| EmailPreferences | `/profil/bildirim-tercihleri` | 7 toggle, critical kapatılamaz uyarısı |

## Güvenlik Kuralları

**Secret encryption:**
- `.env`: `EMAIL_SECRETS_KEY=<64 hex char>` (AES-256-GCM key, `openssl rand -hex 32`).
- `apps/backend/src/application/services/email/utils/encryption.ts` — IV + ciphertext + auth tag concat formatı.
- API yanıtlarında her zaman `••••` mask. Sadece `TestProviderConfigUseCase` decrypt eder, kullanır, dönmez.
- Audit log: provider create/update için diff (secret hariç). İlgili pattern için `security-hardening` skill'i.

**Webhook güvenliği:**
- URL'de `?secret=<webhookSecret>` query param doğrulanır. Yetkisiz call → 401 + Sentry event.

**Rate limit:**
- `RequestPasswordResetUseCase` + `RegisterUserUseCase` controller-level: aynı email/IP saatte 5 deneme.
- `TestProviderConfigUseCase`: admin başına saatte 10 test.

**KVKK:**
- Kayıt + footer'da aydınlatma: "Mail içerikleri Brevo (AB sunucu) veya yapılandırılmış SMTP sağlayıcınız üzerinden iletilir. 90 gün sonra metin anonimleştirilir."
- `User.dataExportUseCase`'e EmailLog dahil (90 gün, body ile). Eski log'lar sadece metrik.
- `User.dataDeletionUseCase`'de `EmailLog.recipientUserId = null` (referans bozmamak için).

## Kenar Durumlar

- **Provider yok / hepsi pasif:** `EmailService.send` `BLOCKED_BY_ADMIN` log'lar, exception fırlatmaz. Admin'e sistem bildirimi (`backup-failure-alert` benzeri kanal).
- **`EMAIL_SECRETS_KEY` eksik:** App boot'ta hata fırlat. Var olan kayıtlar decrypt edilemez — admin yeniden girmeli.
- **Aynı şablona aynı kullanıcıya kısa sürede çoklu gönderim:** Idempotency key opsiyonel; çağıran taraf `idempotencyKey` geçebilir (örn. `purchase-receipt:purchaseId`). `EmailService.send` aynı key ile son 5 dakikada gönderim varsa skip eder. Bu özellik phase 2.
- **Aday hesabını sildi ama EmailLog'da referansı var:** `recipientUserId = null` (anonimleştir), `recipientEmail` 90 gün sonra hash'le.
- **Bounce rate %2'yi aştı:** Cron auto-pause yapar. Admin manuel devam ettirene kadar bulk akmaz. Critical akmaya devam eder.
- **Brevo hesabı askıya alındı:** Worker auth hatası alır → fallback'e geçer. Admin'e sistem bildirimi. `EmailProviderConfig.isActive = false` set edilebilir.
- **Şablon dosyası bulunamadı:** Render hata fırlatır, `EmailLog.status = FAILED`, retry tetiklenir ama düzelmez → DEAD_LETTER. Bu deploy hatasıdır, Sentry alert kritik.
- **CRITICAL kuyruğa BULK template gönderildi:** `forceQueue` override izinli — uyarı yok. Çağıran tarafın sorumluluğu.

## Anti-Pattern'lar (PR Review'da Reject)

- Controller'da doğrudan `nodemailer.sendMail` veya `axios.post(brevoUrl)` — **yasak**, sadece `EmailService.send`.
- `SendEmailUseCase` await'i ile HTTP submit bekletmek — kuyruk push'u sync ama send'in kendisi async, blocking olmasın.
- `EmailLog.htmlBody`'ye plaintext base64 yapıştırıp anonimleştirmeyi bypass — `templateData` da temizlenmeli.
- CRITICAL'a marketing içerik koymak (preference kaçırmak için trick). Code review'da yakalanır.
- Webhook endpoint'inde secret kontrolü atlamak.
- Provider config'i `.env`'e yazmak — sağlayıcı bilgisi DB'de, secret encrypted.
- Hard-coded `from` adresi. Her zaman `EmailProviderConfig.fromEmail`.
- `nodemailer` transport'unda `pool: false` — production'da connection storm yaratır.

## Test Disiplini

**Unit (Jest):**
- `EmailDispatcher.shouldSend`: 6 kuralın tüm kombinasyonu, özellikle CRITICAL override testleri.
- Encryption round-trip, yanlış key fail.
- BrevoApiProvider mock: 200, 429 (fallback tetikler), 5xx, network error.
- BounceRate hesaplaması: %1.9 sessiz, %2.1 auto-pause.

**Integration:**
- Webhook simulate (Brevo örnek payload'ları): hardBounce → SuppressedEmail; spam → SuppressedEmail kalıcı.
- Aday `marketing: false` set → campaign-announcement → `BLOCKED_BY_PREFS`.

**E2E (Playwright):**
- Admin kill switch off → educator şifre sıfırlama → log'da `BLOCKED_BY_ADMIN`.
- Admin yeni Brevo provider ekler → test maili → başarı.
- Unsubscribe link tıklama → preference güncellenir.

**A11y:** Tüm yeni admin sayfaları `e2e/specs/a11y.spec.ts`'e.

## İlgili Skill'ler

- `exam-domain` — Domain entity sözlüğü (User, AdminSettings vb. bağlam).
- `observability` — Kuyruk + retry + DLQ + circuit breaker pattern'leri; sağlayıcı fallback bu disiplinin uzantısı.
- `security-hardening` — Audit log, AES-GCM secret encryption pattern'i, KVKK akışları.
- `nestjs-module` — Controller / Use Case / DTO yapısı.
- `prisma-schema` — Yeni model ekleme, composite index disiplini.
- `api-contract` — dalClient.js güncellemesi, endpoint sözleşmesi.
- `error-handling` — Worker hatalarının NestJS exception filter'a delege edilmesi.

## Notlar

- Detaylı implementation prompt: `docs/plans/email-traffic-prompt.md`.
- Yeni şablon eklerken: hem `.hbs` hem `.txt` (CRITICAL ise), `preferenceMap.ts` güncelle, `templateRepo` seed'e satır ekle.
- Yeni sağlayıcı (örn. Yandex API) eklerken: `IEmailProvider` implement et, `EmailProviderKind` enum'a değer ekle, `ProviderRegistry`'ye kayıt et, `EmailProviders.jsx` form'unda yeni kind için alanlar.
- Brevo dashboard kurulumu (DNS DKIM/SPF, webhook URL) operasyon dokümantasyonu — `docs/ops/email-setup.md` (yazılacak).
- Hacim büyürse: Brevo ücretli plan değil → kurumsal Gmail/Yandex SMTP'yi birincil yap, Brevo'yu yedek tut. `priority` sayılarını swap'lemek yeter, kod değişmez.
