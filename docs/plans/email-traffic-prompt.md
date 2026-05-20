# Sınav Salonu — Mail Trafiği Yönetim Modülü
## Implementation Prompt (backend-architect + ui-builder + test-writer + e2e-writer için)

> Bu doküman, `Delege Rehberi`'ndeki agent'lara aşamalı olarak verilebilir. Her aşamanın sonunda `code-reviewer` agent'ı ile gözden geçirme önerilir. Mail içeriği üçüncü taraftan geçecek (Brevo) — KVKK aydınlatma metnine eklenmeli. Anthropic Claude dışında ücretli servis kullanılmıyor; Brevo **ücretsiz katmanı** (300 mail/gün) birincil sağlayıcı, kurumsal SMTP yedek.

---

## 0) Hedef ve kısıtlar

**Hedef:** Tüm giden mail trafiğini güvenilir biçimde göndermek (hat boğulmadan, kritik mailler bildirimlerin arkasında kalmadan), her gönderimi izlenebilir kılmak ve admin'in mail trafiğini ince granülerlikte kontrol edebilmesini sağlamak.

**Sert kısıtlar:**
1. **Yalnızca ücretsiz / kullanıcı sahipli altyapı.** Brevo ücretsiz katmanı + kurumsal SMTP (admin yönetir). Ücretli SaaS planı yasak.
2. KVKK uyumu — `EmailLog.htmlBody`/`textBody` 90 gün sonra anonimleştirilmeli (satır kalır, metrikler korunur).
3. **Admin operasyonel kontrol:** Mailler global, hedef rolüne göre (eğitici / aday), kuyruğa göre (kritik / bildirim / toplu) ve sağlayıcıya göre ayrı ayrı durdurulabilmeli.
4. **Mail sağlayıcı bilgileri admin panelinden yönetilebilmeli** — kullanıcı kendi kurumsal SMTP'sini bağlayabilmeli, API key'ler şifrelenmiş saklanmalı.
5. **Aday bildirim tercihleri zorunlu.** `notify` ve `bulk` kuyruklarındaki mailler `User.emailPreferences` JSON alanına saygı gösterecek; `critical` kuyruğu istisna (şifre/ödeme/iade — kapatılamaz).
6. Mevcut mimariye saygı: Controller ince, iş mantığı Use Case'te, Prisma yalnızca Repository içinden, controller'da fetch yok.

**Yumuşak hedefler:**
- HTTP request submit'i saniye altı (sadece queue push).
- Kritik mail SLA: %95'i 30 saniye altında gönderilsin.
- Bounce rate %2'yi aştığında admin'e anlık uyarı.
- Sağlayıcı sıfır yapılandırma → sistem ayağa kalkamasın ama düzgün hata göstersin (404 yerine "SMTP yapılandırılmamış").

---

## 1) Mimari karar — 3 kuyruk + 2 sağlayıcı + admin kill switch grid

```
HTTP / Use Case
     │
     ▼
[EmailService.send(template, to, data, priority)]
     │  - Hedef User'ı çek (role + emailPreferences)
     │  - AdminSettings kill switch'leri kontrol et
     │  - SuppressedEmail tablosuna düşmüş mü?
     │  - templateKey + priority → queue seçimi
     │
     ▼
[BullMQ Queue]
   email-critical   (concurrency 5, rate 60/dk, retry 3)
   email-notify     (concurrency 3, rate 30/dk, retry 3)
   email-bulk       (concurrency 1, rate 30/dk, retry 2)
     │
     ▼
[Worker: SendEmailJobProcessor]
     │  - Aktif EmailProviderConfig'leri öncelik sırasıyla dene
     │  - PRIMARY → 5xx/429 → FALLBACK
     │  - EmailLog güncelle, EmailEvent yaz
     │
     ▼
[IEmailProvider]
   BrevoApiProvider     (HTTPS, ücretsiz katman 300/gün)
   SmtpProvider         (nodemailer, kurumsal SMTP / Gmail App Password / Yandex)
   ConsoleProvider      (test/dev için)
     │
     ▼
[Sağlayıcı webhook'u]
   POST /webhooks/email/brevo  → bounce/complaint/delivered/opened
   → EmailEvent ekler, gerekirse SuppressedEmail'e yazar
```

**Admin kill switch grid (AdminSettings):**

|  | Kritik | Bildirim | Toplu |
|---|---|---|---|
| Eğitici | `emailEducatorCriticalEnabled` | `emailEducatorNotifyEnabled` | `emailEducatorBulkEnabled` |
| Aday | `emailCandidateCriticalEnabled` | `emailCandidateNotifyEnabled` | `emailCandidateBulkEnabled` |
| Admin/Worker | `emailStaffCriticalEnabled` | `emailStaffNotifyEnabled` | — |

Plus global: `emailEnabled` (her şeyi keser). Worker mail göndermeden önce hedef User rolüne göre ilgili flag'i kontrol eder.

---

## 2) Prisma şema değişiklikleri

**Prompt — backend-architect için:**

> `apps/backend/prisma/schema.prisma` dosyasına aşağıdaki modelleri ekle ve migration üret (`npm run db:migrate -- --name add_email_traffic`). Tüm kayıtlar `tenantId` taşır.

```prisma
enum EmailQueue {
  CRITICAL      // şifre sıfırlama, ödeme makbuzu, iade onayı, hesap güvenliği
  NOTIFY        // soru itirazı sonucu, canlı oturum daveti, yeni inceleme
  BULK          // haftalık digest, kampanya, duyuru
}

enum EmailStatus {
  QUEUED
  SENDING
  SENT
  DELIVERED
  BOUNCED
  COMPLAINED
  FAILED
  SUPPRESSED        // SuppressedEmail eşleşmesi nedeniyle gönderilmedi
  BLOCKED_BY_PREFS  // kullanıcı tercihiyle reddedildi
  BLOCKED_BY_ADMIN  // admin kill switch
  DEAD_LETTER       // tüm retry'lar tükendi
}

enum EmailEventType {
  QUEUED
  SENDING
  SENT
  DELIVERED
  BOUNCED
  HARD_BOUNCED
  SOFT_BOUNCED
  COMPLAINED
  OPENED        // pixel tetiklenirse (varsayılan kapalı)
  CLICKED       // URL rewriting (varsayılan kapalı)
  FAILED
  RETRYING
  SUPPRESSED
  BLOCKED
}

enum EmailProviderKind {
  BREVO_API
  SMTP
  CONSOLE       // dev/test
}

enum SuppressionReason {
  HARD_BOUNCE
  REPEATED_SOFT_BOUNCE
  SPAM_COMPLAINT
  UNSUBSCRIBE
  MANUAL_BLOCK
  INVALID_ADDRESS
}

model EmailProviderConfig {
  id                String            @id @default(cuid())
  tenantId          String
  name              String                                      // "Brevo Ana", "Kurumsal Gmail Yedek"
  kind              EmailProviderKind
  priority          Int               @default(100)             // küçük olan birincil
  isActive          Boolean           @default(true)
  fromEmail         String                                      // "noreply@sinavsalonu.com"
  fromName          String                                      // "Sınav Salonu"
  replyToEmail      String?
  // Şifreli alanlar (AES-256-GCM, app-level encryption — KEY .env'de)
  encryptedSecrets  String                                      // JSON encrypted: { apiKey | smtpHost+smtpPort+smtpUser+smtpPass | ... }
  // Health
  lastSuccessAt     DateTime?
  lastFailureAt     DateTime?
  lastFailureReason String?
  dailySentCount    Int               @default(0)               // brevo gibi günlük kotalı sağlayıcılarda izle
  dailyResetAt      DateTime          @default(now())
  // Brevo webhook secret
  webhookSecret     String?
  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt

  tenant            Tenant            @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId, isActive, priority])
}

model EmailTemplate {
  id              String     @id @default(cuid())
  tenantId        String
  key             String                                         // "password-reset", "purchase-receipt", "weekly-digest"
  version         Int        @default(1)
  subject         String                                         // Handlebars destekli
  htmlPath        String                                         // "templates/password-reset.hbs" — dosya yolu
  textPath        String?                                        // plaintext fallback
  defaultQueue    EmailQueue                                     // CRITICAL | NOTIFY | BULK
  isActive        Boolean    @default(true)
  description     String?                                        // admin için açıklama
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt

  tenant          Tenant     @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, key, version])
  @@index([tenantId, key, isActive])
}

model EmailLog {
  id                String         @id @default(cuid())
  tenantId          String
  recipientUserId   String?                                       // null = sistem maili (örn. webhook test)
  recipientEmail    String
  recipientRole     UserRole?                                     // gönderim anındaki rol
  templateKey       String
  templateVersion   Int
  queue             EmailQueue
  status            EmailStatus    @default(QUEUED)
  subject           String
  // İçerik — KVKK için 90 gün sonra anonimleştirilir
  htmlBody          String?                                       // 90 gün sonra null
  textBody          String?                                       // 90 gün sonra null
  templateData      Json?                                         // değişken substitution input
  // Sağlayıcı
  providerConfigId  String?
  providerKind      EmailProviderKind?
  providerMessageId String?                                       // webhook eşlemesi için kritik
  // Hata & retry
  attemptCount      Int            @default(0)
  lastErrorMessage  String?
  lastErrorCode     String?                                       // "rate_limited", "invalid_recipient", "5xx", "421"
  // Zaman damgaları
  queuedAt          DateTime       @default(now())
  sentAt            DateTime?
  deliveredAt       DateTime?
  bouncedAt         DateTime?
  // Bağlam (opsiyonel)
  relatedEntityType String?                                       // "Purchase", "TestAttempt", "Refund"
  relatedEntityId   String?

  tenant            Tenant         @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  recipient         User?          @relation(fields: [recipientUserId], references: [id], onDelete: SetNull)
  providerConfig    EmailProviderConfig? @relation(fields: [providerConfigId], references: [id], onDelete: SetNull)
  events            EmailEvent[]

  @@index([tenantId, recipientUserId, queuedAt])
  @@index([tenantId, status, queuedAt])
  @@index([tenantId, queue, status, queuedAt])
  @@index([tenantId, templateKey, queuedAt])
  @@index([providerMessageId])
}

model EmailEvent {
  id           String           @id @default(cuid())
  tenantId     String
  emailLogId   String
  eventType    EmailEventType
  occurredAt   DateTime         @default(now())
  source       String                                            // "worker" | "provider_webhook" | "manual"
  meta         Json?                                             // IP, user agent (open/click), bounce code, vb.

  tenant       Tenant           @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  emailLog     EmailLog         @relation(fields: [emailLogId], references: [id], onDelete: Cascade)

  @@index([tenantId, emailLogId, occurredAt])
  @@index([tenantId, eventType, occurredAt])
}

model SuppressedEmail {
  id          String            @id @default(cuid())
  tenantId    String
  email       String                                              // normalize edilmiş (lowercase, trim)
  reason      SuppressionReason
  source      String                                              // "auto" | "webhook" | "manual"
  note        String?
  createdBy   String?                                             // manuel ise admin userId
  createdAt   DateTime          @default(now())
  expiresAt   DateTime?                                           // soft bounce için 30 gün sonra otomatik kalk

  tenant      Tenant            @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, email])
  @@index([tenantId, reason])
  @@index([tenantId, expiresAt])
}
```

**`User` modeline ekle:**
```prisma
emailPreferences  Json     @default("{\"marketing\":false,\"productUpdates\":true,\"weeklyDigest\":true,\"reviewNotifications\":true,\"objectionUpdates\":true,\"liveSessionInvites\":true,\"refundUpdates\":true}")
emailUnsubscribeToken String? @unique                          // unsubscribe linkleri için
```

**Aday profil tarafında kullanılan tercih şeması (kod düzeyinde tip):**
```ts
type EmailPreferences = {
  // CRITICAL kuyruğu bunları yoksayar (şifre, ödeme, iade her zaman gider)
  marketing: boolean;            // kampanya/duyuru
  weeklyDigest: boolean;         // haftalık özet
  productUpdates: boolean;       // yeni özellik duyurusu
  reviewNotifications: boolean;  // değerlendirme bildirimi
  objectionUpdates: boolean;     // itiraz güncellemesi
  liveSessionInvites: boolean;   // canlı sınav daveti
  refundUpdates: boolean;        // iade durum (NOT: kritikse override)
};
```

**`AdminSettings` modeline ekle (kill switch grid):**
```prisma
emailEnabled                      Boolean  @default(true)         // global master switch
// Eğitici matrisi
emailEducatorCriticalEnabled      Boolean  @default(true)
emailEducatorNotifyEnabled        Boolean  @default(true)
emailEducatorBulkEnabled          Boolean  @default(true)
// Aday matrisi
emailCandidateCriticalEnabled     Boolean  @default(true)
emailCandidateNotifyEnabled       Boolean  @default(true)
emailCandidateBulkEnabled         Boolean  @default(true)
// Staff (admin/worker)
emailStaffCriticalEnabled         Boolean  @default(true)
emailStaffNotifyEnabled           Boolean  @default(true)
// Operasyonel
emailDailyCapPerUser              Int      @default(20)            // tek kullanıcıya günlük max mail
emailBounceRateAlertThreshold     Float    @default(0.02)          // %2 üstü → admin alert
emailRetentionDays                Int      @default(90)            // body anonimleştirme süresi
```

---

## 3) Backend — Service ve Use Case katmanı

**Prompt — backend-architect için:**

> `apps/backend/src/application/services/email/` ve `apps/backend/src/application/use-cases/email/` dizinlerini oluştur. Sağlayıcı bağımlılığını arayüzle soyutla. Kullanıcı kendi SMTP'sini admin panelinden gireceği için `EmailProviderConfig` veritabanından okunur — `.env`'e SMTP host yazılmasın.

### 3.1 Service katmanı

```
apps/backend/src/application/services/email/
  EmailService.ts                  ← Public API: send(input)
  EmailDispatcher.ts               ← Kill switch + suppression + prefs filtreleri
  EmailQueueProducer.ts            ← BullMQ enqueue
  EmailRenderer.ts                 ← Handlebars compile, partial mgmt
  providers/
    IEmailProvider.ts              ← arayüz: send(envelope): Promise<ProviderResult>
    BrevoApiProvider.ts            ← https://api.brevo.com/v3/smtp/email (ücretsiz katman)
    SmtpProvider.ts                ← nodemailer wrapper (kurumsal/Gmail/Yandex)
    ConsoleProvider.ts             ← dev/test: stdout
    ProviderRegistry.ts            ← EmailProviderConfig okur, encrypt/decrypt
  workers/
    SendEmailJobProcessor.ts       ← BullMQ Worker (concurrency, rate limit kuyruktan)
    EmailWebhookProcessor.ts       ← Brevo webhook payload → EmailEvent
  utils/
    encryption.ts                  ← AES-256-GCM, key from .env: EMAIL_SECRETS_KEY
    emailNormalize.ts              ← lowercase + trim + plus-addressing strip (opsiyonel)
    unsubscribeToken.ts            ← User.emailUnsubscribeToken üret/doğrula
```

**`EmailService.send(input)` davranışı:**
```ts
type SendInput = {
  templateKey: string;
  to: { userId?: string; email: string };
  data: Record<string, unknown>;
  forceQueue?: EmailQueue;          // template default override
  relatedEntity?: { type: string; id: string };
  tenantId: string;
  bypassPreferences?: boolean;      // sadece CRITICAL override
};

async send(input): Promise<EmailLog> {
  // 1. Template'i bul, queue belirle
  const template = await this.templateRepo.findActive(tenantId, key);
  const queue = input.forceQueue ?? template.defaultQueue;

  // 2. EmailDispatcher.shouldSend → kill switch + suppression + prefs
  const decision = await this.dispatcher.shouldSend({ ... });
  if (decision.status !== 'ALLOWED') {
    return this.logRepo.create({ status: decision.status, ... });
    // BLOCKED_BY_ADMIN | BLOCKED_BY_PREFS | SUPPRESSED
  }

  // 3. EmailLog kaydı QUEUED durumunda
  const log = await this.logRepo.create({ status: 'QUEUED', queue, ... });

  // 4. Kuyruğa düşür
  await this.queueProducer.enqueue(queue, { emailLogId: log.id });

  return log;
}
```

**`EmailDispatcher.shouldSend` öncelik sırası:**
1. `AdminSettings.emailEnabled === false` → `BLOCKED_BY_ADMIN`
2. Hedef rolü + queue'ya göre admin matrisi → `BLOCKED_BY_ADMIN`
3. `SuppressedEmail` eşleşmesi → `SUPPRESSED`
4. Queue !== CRITICAL VE `User.emailPreferences[mappedKey] === false` → `BLOCKED_BY_PREFS`
5. Günlük cap aşıldı (`EmailLog` count last 24h > `emailDailyCapPerUser`, queue !== CRITICAL) → `BLOCKED_BY_PREFS`
6. Aksi `ALLOWED`

**Template → preference key eşlemesi** (`apps/backend/src/application/services/email/preferenceMap.ts`):
```ts
const PREFERENCE_MAP: Record<string, keyof EmailPreferences | null> = {
  'password-reset': null,           // CRITICAL, override
  'purchase-receipt': null,
  'refund-confirmation': null,
  'account-security-alert': null,
  // Notify
  'review-received': 'reviewNotifications',
  'objection-update': 'objectionUpdates',
  'live-session-invite': 'liveSessionInvites',
  'refund-status-update': 'refundUpdates',
  // Bulk
  'weekly-digest': 'weeklyDigest',
  'campaign-announcement': 'marketing',
  'product-update': 'productUpdates',
};
```

**`SendEmailJobProcessor` davranışı:**
- BullMQ worker, queue başına ayrı instance.
- `EmailLog.status = SENDING`, `attemptCount++`.
- `ProviderRegistry.getActiveProviders(tenantId)` → priority sıralı liste.
- Birinci sağlayıcıyla dene; 5xx/429/timeout ise ikinciyi dene.
- Başarı: `status = SENT`, `providerMessageId` kaydet, `EmailEvent(SENT)`.
- Tüm sağlayıcılar başarısız: BullMQ retry (1dk, 5dk, 30dk). Son denemede `status = DEAD_LETTER`, Sentry'ye event.
- Brevo günlük cap kontrolü: `dailySentCount >= 280` ise (300 limit + buffer) bu sağlayıcı geçici devre dışı, alternative provider'a kay.

**`BrevoApiProvider` notları:**
- Endpoint: `POST https://api.brevo.com/v3/smtp/email`
- Header: `api-key: <decrypted>`
- Body: `{ sender, to, subject, htmlContent, textContent, headers: { 'List-Unsubscribe': '<...>, <mailto:...>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } }`
- Yanıt: `{ messageId }` → `EmailLog.providerMessageId`.
- Webhook: Brevo dashboard'tan `/webhooks/email/brevo?secret=<webhookSecret>` URL'i ayarla. Olası eventler: `delivered`, `hardBounce`, `softBounce`, `spam`, `opened`, `clicked`, `blocked`.

**`SmtpProvider` notları:**
- `nodemailer.createTransport({ host, port, secure, auth: { user, pass }, pool: true, maxConnections: 5 })`
- Connection pool reuse — her gönderim için yeni TCP açma.
- TLS doğrulama varsayılan açık (`tls: { rejectUnauthorized: true }`).
- SMTP webhook yok — bounce'ları yakalamak için **bounce mailbox IMAP polling** (faz 2, ayrı job: `PollBounceMailboxUseCase`). İlk faz için bounce algılaması manuel + SuppressedEmail'e admin ekler.

### 3.2 Use Case'ler

`apps/backend/src/application/use-cases/email/` altında:

| Use Case | Sorumluluk |
|---|---|
| `SendEmailUseCase` | Diğer Use Case'lerden çağrılan public API. `EmailService.send` sarmalayıcısı. |
| `ProcessSendEmailJobUseCase` | BullMQ worker handler. Sağlayıcı denemesi, retry mantığı, event kaydı. |
| `HandleEmailWebhookUseCase` | Brevo webhook payload → EmailEvent + gerekirse SuppressedEmail. |
| `ListEmailLogsUseCase` | Admin paneli için cursor pagination + filtreler (queue, status, recipientRole, templateKey, tarih). |
| `GetEmailLogDetailUseCase` | Tek mail detayı + tüm event'leri. |
| `RetryFailedEmailUseCase` | Admin manuel retry. DEAD_LETTER veya FAILED durumundaki maili yeniden kuyruğa. |
| `ManageProviderConfigUseCase` | EmailProviderConfig CRUD. Secret'ları encrypt et, yanıtta mask'le. |
| `TestProviderConfigUseCase` | Admin "test maili gönder" butonu. ConsoleProvider değil, gerçek sağlayıcıyla tek mail. |
| `ToggleEmailKillSwitchUseCase` | Granüler kill switch matrisi güncelleme. |
| `ManageSuppressedEmailUseCase` | SuppressedEmail CRUD (manuel ekle/çıkar). |
| `ManageEmailTemplateUseCase` | Template aktiflik ve version yönetimi. |
| `UpdateUserEmailPreferencesUseCase` | Aday/eğitici kendi tercihlerini günceller. Unsubscribe link de buraya gelir. |
| `UnsubscribeViaTokenUseCase` | `/unsubscribe?token=...` linki için. Kategori veya hepsi. |
| `GetEmailTrafficMetricsUseCase` | Dashboard KPI'ları: son 24s/7g, queue derinliği, bounce rate, sağlayıcı sağlık. |
| `AnonymizeOldEmailLogsUseCase` | Cron job: `retentionDays` aşmış logların body alanlarını null'la. |
| `CheckBounceRateAlertUseCase` | Cron job: %2 üstü bounce → admin sistem bildirimi + Sentry. |
| `ResetProviderDailyCountUseCase` | Cron job: günlük cap sayaçlarını sıfırla (UTC 00:00). |

### 3.3 Mevcut Use Case'lere entegrasyon

`SendEmailUseCase` enjekte edip aşağıdaki yerlerde çağır:

| Use Case | templateKey | queue (default) |
|---|---|---|
| `RegisterUserUseCase` | `email-verification` | CRITICAL |
| `RequestPasswordResetUseCase` | `password-reset` | CRITICAL |
| `CreatePurchaseUseCase` | `purchase-receipt` | CRITICAL |
| `ConfirmRefundUseCase` | `refund-confirmation` | CRITICAL |
| `RejectRefundUseCase` | `refund-rejected` | NOTIFY |
| `CreateReviewUseCase` | `review-received` | NOTIFY |
| `ResolveObjectionUseCase` | `objection-update` | NOTIFY |
| `CreateLiveSessionUseCase` | `live-session-invite` | NOTIFY |
| `ApplyModerationActionUseCase` (suspend/ban) | `educator-moderation-action` | CRITICAL |
| `BackupSchedulerService` (başarısız yedek) | `backup-failure-alert` | CRITICAL (admin'e) |
| (Yeni cron) | `weekly-digest` | BULK |

### 3.4 API endpoint'leri

`apps/backend/src/nest/controllers/admin/EmailController.ts`:

| Method | Path | Use Case | Roller |
|---|---|---|---|
| GET | `/admin/email/dashboard` | GetEmailTrafficMetricsUseCase | ADMIN, WORKER:email |
| GET | `/admin/email/logs` | ListEmailLogsUseCase | ADMIN, WORKER:email |
| GET | `/admin/email/logs/:id` | GetEmailLogDetailUseCase | ADMIN, WORKER:email |
| POST | `/admin/email/logs/:id/retry` | RetryFailedEmailUseCase | ADMIN |
| GET | `/admin/email/providers` | ListProviderConfigsUseCase | ADMIN |
| POST | `/admin/email/providers` | ManageProviderConfigUseCase | ADMIN |
| PATCH | `/admin/email/providers/:id` | ManageProviderConfigUseCase | ADMIN |
| DELETE | `/admin/email/providers/:id` | ManageProviderConfigUseCase | ADMIN |
| POST | `/admin/email/providers/:id/test` | TestProviderConfigUseCase | ADMIN |
| GET | `/admin/email/templates` | ListEmailTemplatesUseCase | ADMIN |
| PATCH | `/admin/email/templates/:id` | ManageEmailTemplateUseCase | ADMIN |
| GET | `/admin/email/suppressions` | ListSuppressedEmailsUseCase | ADMIN |
| POST | `/admin/email/suppressions` | ManageSuppressedEmailUseCase | ADMIN |
| DELETE | `/admin/email/suppressions/:id` | ManageSuppressedEmailUseCase | ADMIN |
| PATCH | `/admin/email/kill-switches` | ToggleEmailKillSwitchUseCase | ADMIN |
| POST | `/webhooks/email/brevo` | HandleEmailWebhookUseCase | @Public + secret query param |
| GET | `/me/email-preferences` | GetUserEmailPreferencesUseCase | Auth |
| PATCH | `/me/email-preferences` | UpdateUserEmailPreferencesUseCase | Auth |
| GET | `/unsubscribe` | UnsubscribeViaTokenUseCase | @Public (HTML response) |

Yeni `WorkerPermission` enum: `EMAIL_MANAGEMENT`. WORKER rolü için kısmi erişim.

---

## 4) Frontend — Admin sayfaları ve aday profil bölümü

**Prompt — ui-builder için:**

> Mevcut `pages.config.js` + `routeRoles.js` disiplinine sadık kal. `dalClient.js` üzerinden tüm API çağrıları. Dark mode utility'leri. Form'larda `<label htmlFor>` ve focus-visible ring. Sidebar'da yeni "Mail Trafiği" grubu admin için.

### 4.1 Admin — Mail Trafiği grubu

| Sayfa | Route | Amaç |
|---|---|---|
| `EmailDashboard.jsx` | `/yonetim/mail/panel` | Operasyonel görünüm: KPI, kuyruk derinliği, sağlayıcı sağlık. |
| `EmailKillSwitches.jsx` | `/yonetim/mail/kontrol` | **Kill switch matrisi — eğitici/aday/staff × kritik/bildirim/toplu**. |
| `EmailProviders.jsx` | `/yonetim/mail/saglayicilar` | **Kurumsal SMTP / Brevo bağlama ekranı.** |
| `EmailLogs.jsx` | `/yonetim/mail/loglar` | Tüm gönderim log'u, filtreleme, detay drawer. |
| `EmailLogDetail.jsx` | `/yonetim/mail/loglar/:id` | Tek mail tam detayı + event timeline. |
| `EmailTemplates.jsx` | `/yonetim/mail/sablonlar` | Şablon listesi, aktif/pasif, version. |
| `EmailSuppressions.jsx` | `/yonetim/mail/engellenmis` | SuppressedEmail listesi, manuel ekle/çıkar. |

### 4.2 EmailKillSwitches sayfası — DETAYLI (kullanıcı özel istek)

**Sayfa:** `apps/frontend/src/pages/admin/EmailKillSwitches.jsx`
**Route:** `/yonetim/mail/kontrol`

**Layout:**

**1. Üst global anahtarı:**
- Tek büyük toggle: "Tüm mailler aktif / DURDURULDU"
- Açıklama: "Bu anahtar kapatıldığında hiçbir mail gönderilmez. Kuyrukta bekleyenler yeniden açılınca akmaya devam eder."
- Off iken altta kırmızı bant: "MAIL SİSTEMİ TAMAMEN DURDURULDU — XX dakikadır kapalı"

**2. Kill switch matrisi (3×3 grid):**

|  | Kritik mailler | Bildirim mailleri | Toplu mailler |
|---|---|---|---|
| **Eğitici** | toggle | toggle | toggle |
| **Aday** | toggle | toggle | toggle |
| **Admin/Çalışan** | toggle | toggle | — |

Her toggle'ın yanında:
- Son 24s gönderim sayısı (örn. "1,247 mail")
- Tooltip: hangi şablonlar bu kategoriye düşer (örn. "Kritik = şifre sıfırlama, ödeme makbuzu, iade onayı")
- Kapatıldığında uyarı modal: "Bu kategorideki maillerin akışı durdurulacak. Devam? [Onay textbox: 'durdur' yaz]"
- "Sebep" textarea (zorunlu, audit log'a girer)

**3. Otomatik durdurmalar bölümü:**
- "Bounce oranı eşiği aşıldı" → otomatik bulk durduruldu mu? (eşik admin ayarlanabilir)
- "Brevo günlük limiti doldu" → otomatik fallback'e geçti mi?
- Reset / manuel devam butonu.

**4. Son aksiyon log'u:**
- Tablo: tarih, admin, hangi switch, eski/yeni durum, sebep.

**5. Erişilebilirlik:**
- Her toggle `aria-label="Aday bildirim maillerini durdur"` ile.
- Kritik aksiyonlar (global kapama, kritik switch off) ek confirmation modal'ı.
- Audit'e tüm değişiklikler `ModerationAction`-benzeri bir `EmailKillSwitchAuditLog` tablosuna yazılır.

### 4.3 EmailProviders sayfası — DETAYLI (kullanıcı özel istek)

**Sayfa:** `apps/frontend/src/pages/admin/EmailProviders.jsx`
**Route:** `/yonetim/mail/saglayicilar`

**Layout:**

**1. Mevcut sağlayıcılar listesi (sortable by priority):**
| Sütun | İçerik |
|---|---|
| Sıra | Priority (drag-drop yeniden sırala) |
| Ad | "Brevo Ana", "Kurumsal Gmail" |
| Tür | Badge: BREVO_API / SMTP / CONSOLE |
| Durum | yeşil "Aktif" / gri "Pasif" |
| Gönderici | `Sınav Salonu <noreply@sinavsalonu.com>` |
| Son başarı | "5 dakika önce" |
| Son hata | varsa kırmızı, hover'da detay |
| Günlük gönderim | "245 / 300" (Brevo için), "—" (SMTP) |
| Aksiyon | Düzenle / Test maili gönder / Devre dışı bırak / Sil |

**2. "Yeni sağlayıcı ekle" butonu → modal/sayfa:**

**Form alanları (kind seçimine göre dinamik):**

*Ortak:*
- Ad (örn. "Şirket Gmail")
- Tür: `BREVO_API` | `SMTP` (CONSOLE sadece dev'de görünür)
- Öncelik: numara (küçük = birincil)
- Gönderici email (`fromEmail`) — domain doğrulaması gerek mesajı
- Gönderici ismi (`fromName`)
- Reply-to (opsiyonel)
- Aktif mi (checkbox)

*BREVO_API için:*
- API Key (password input, `••••••••` mask, "göster" butonu) — kayıt sonrası geri gösterilmez
- Günlük limit (varsayılan 300)
- Webhook secret (otomatik üret butonu)
- Webhook URL (read-only kopyalama linki: `https://api.<domain>/webhooks/email/brevo?secret=...`)
- Yardım kutusu: "Bu URL'i Brevo dashboard → Transactional → Settings → Webhook'a ekleyin"

*SMTP için (kurumsal mail için kritik kısım):*
- SMTP Host (örn. `smtp.gmail.com`, `smtp.yandex.com.tr`, `mail.sirketim.com`)
- Port (587 / 465 / 25 seçimi + custom)
- Güvenlik: `STARTTLS` / `SSL/TLS` / `Plain` (radio)
- Kullanıcı adı
- Şifre (mask)
- Yardım accordion: "Gmail App Password nasıl alınır?", "Yandex.Mail for domain kurulum", "Office 365 SMTP ayarları"

**3. "Test maili gönder" butonu:**
- Modal: hedef email (admin kendi mailini doldurmuş gelir), şablon seçimi (`test-template`), data inputs.
- Submit → `POST /admin/email/providers/:id/test` → spinner → sonuç ("Başarılı: Brevo messageId xyz" veya "Hata: 535 Auth failed").

**4. Sağlayıcı sağlık paneli (sayfa altında):**
- Son 7 günde her sağlayıcı için başarı oranı grafiği (recharts LineChart).
- Fallback'e ne sıklıkta düşülmüş.

**5. Güvenlik notları (sayfa içi inline):**
- "API key'ler ve SMTP şifreleri AES-256 ile şifrelenir, log/audit'lerde görünmez."
- "Hesap güvenliği için: Gmail App Password kullanın, ana şifre değil."
- "Kurumsal SMTP'de TLS bağlantısı zorunlu önerilir."

### 4.4 EmailDashboard sayfası

**1. Üst KPI şeridi (6 kart, son 24s):**
- Kuyruğa alınan
- Başarıyla gönderilen
- Teslim edilen (delivered webhook)
- Bounce
- Spam complaint
- Açılma oranı (eğer tracking açıksa, değilse "—")

**2. Canlı kuyruk durumu:**
- Üç bar (CRITICAL / NOTIFY / BULK) — bekleyen job sayısı, aktif worker sayısı, dakikalık throughput.
- Kırmızı eşik: kritik > 100 bekleyen, bulk > 5000 bekleyen.

**3. Sağlayıcı sağlık satırları:**
- Her aktif sağlayıcı için: yeşil/sarı/kırmızı nokta, son hata, günlük limit dolum %'si.

**4. Şablon başına performans tablosu:**
- Şablon | Son 7g gönderim | Başarı % | Bounce % | Ort. teslim süresi

**5. Otomatik uyarılar:**
- "Bounce oranı %2.4 — eşik üstü. Bulk gönderim otomatik 1 saat durduruldu." → "Manuel devam ettir" butonu.

### 4.5 EmailLogs ve detay

**EmailLogs.jsx:**
- Filtreler: queue, status, recipientRole, templateKey, tarih aralığı, email arama (debounce).
- Tablo: tarih, alıcı (rol badge), şablon, queue, status (renkli badge), sağlayıcı, retry sayısı.
- Cursor pagination 50'şer.
- Satır tıklama → drawer (sağdan) veya detay sayfa.

**EmailLogDetail.jsx:**
- Üst: alıcı bilgileri (link User profile), şablon, queue, durum.
- Orta: subject, html preview (sandboxed iframe), text preview, template data JSON.
- Sağ: event timeline (QUEUED → SENDING → SENT → DELIVERED veya BOUNCED).
- Alt: aksiyon butonları (Retry, SuppressedEmail'e ekle, ilgili entity'e git).

### 4.6 Aday/eğitici profil — Bildirim tercihleri bölümü

**Mevcut profil sayfasına ek:**
`apps/frontend/src/pages/profile/EmailPreferences.jsx`
- 7 toggle (her EmailPreferences alanı için)
- Açıklama metinleri: "Pazarlama mailleri = kampanya ve yeni öğretmen duyuruları"
- Bilgi notu: "Hesap güvenliği, ödeme ve iade ile ilgili kritik mailler kapatılamaz."
- Save → `PATCH /me/email-preferences`, başarıda toast.
- Profil sayfasından bu sayfaya link.

**Unsubscribe linki:**
- Bildirim ve toplu mailleri footer'ında: "Bu mailden çık" → `/unsubscribe?token=...&category=marketing`
- One-click unsubscribe (Gmail/Yahoo 2024+ gereği).
- Sayfa: "X kategorisinden çıktınız. Tüm bildirim tercihlerinizi yönetmek için tıklayın."

### 4.7 Sidebar güncellemesi

**Admin sidebar — "Mail Trafiği" yeni grubu:**
- Mail Paneli (badge: bekleyen kritik sayısı, sarı eşik)
- Kontrol & Durdur
- Sağlayıcılar
- Loglar
- Şablonlar
- Engellenmiş Adresler

**Profil menüsü (tüm roller):**
- "Bildirim tercihleri" linki.

---

## 5) Şablon dosyaları

`apps/backend/src/infrastructure/email/templates/` dizini:

```
templates/
  layouts/
    base.hbs                       ← genel layout (header logo, footer, unsubscribe)
  partials/
    button.hbs
    footer.hbs
  password-reset.hbs
  password-reset.txt
  email-verification.hbs
  purchase-receipt.hbs
  refund-confirmation.hbs
  refund-rejected.hbs
  refund-status-update.hbs
  review-received.hbs
  objection-update.hbs
  live-session-invite.hbs
  educator-moderation-action.hbs
  weekly-digest.hbs
  campaign-announcement.hbs
  product-update.hbs
  account-security-alert.hbs
  backup-failure-alert.hbs
  test-template.hbs
```

**Her şablon için zorunlu:**
- HTML versiyon + plaintext versiyon (CRITICAL için).
- Footer'da company adres (CAN-SPAM uyumu).
- Bulk/notify maillerde unsubscribe linki + `List-Unsubscribe` header.
- Brand variables `data.*` ile dolar (örn. `{{user.name}}`, `{{test.title}}`).

---

## 6) Cron / Job tetikleyicileri

**Prompt — backend-architect için:**

> `apps/backend/src/nest/modules/cron/EmailCronService.ts` ekle.

1. **Her dakika:** `CheckBounceRateAlertUseCase` — son 1 saat bounce/sent oranı eşik üstüyse admin'e bildirim + `emailEducatorBulkEnabled = false` ve `emailCandidateBulkEnabled = false` otomatik off (admin manuel açana kadar).
2. **Her gün 00:05 UTC:** `ResetProviderDailyCountUseCase` — `EmailProviderConfig.dailySentCount = 0`.
3. **Her gün 02:00:** `AnonymizeOldEmailLogsUseCase` — `retentionDays` öncesi log'ların `htmlBody`/`textBody`/`templateData` null'la.
4. **Her gün 03:00:** Süresi dolan `SuppressedEmail` (expiresAt < now) sil.
5. **Her Pazartesi 09:00:** `SendWeeklyDigestUseCase` — preference'ı açık olan adaylara haftalık özet (yeni testler, indirimli paketler vb.).

---

## 7) Güvenlik & KVKK

**Secret yönetimi:**
- `.env`: `EMAIL_SECRETS_KEY=<64 hex char>` (AES-256-GCM key).
- `EmailProviderConfig.encryptedSecrets`: JSON encrypted, IV + ciphertext + auth tag concat.
- API yanıtlarında her zaman `••••` ile mask, asla decrypt edip dönme (test endpoint hariç — sadece kullanılır, dönmez).
- Audit log: her `EmailProviderConfig` create/update için userId + timestamp + diff (secret hariç).

**KVKK aydınlatma:**
- Kayıt ekranı + footer: "Mail içerikleri Brevo (AB sunucu, GDPR uyumlu) veya tarafınızca yapılandırılmış SMTP sağlayıcısı üzerinden iletilir. 90 gün sonra mail metni anonimleştirilir, sadece metrik bilgisi saklanır. Pazarlama maillerinden istediğiniz an çıkabilirsiniz."
- `User.dataExportUseCase`'e EmailLog'ları dahil et (son 90 gün, body dahil; eski log'lar sadece metrik).
- `User.dataDeletionUseCase` — kullanıcı silinince EmailLog `recipientUserId = null` (referans bozulmasın), email/name anonimleştir.

**Rate limit (kötüye kullanımı önleme):**
- `RequestPasswordResetUseCase` ve `RegisterUserUseCase` controller-level rate limit: aynı email/IP 5 deneme/saat.
- `TestProviderConfigUseCase`: admin başına 10 test/saat.

**Webhook güvenliği:**
- Brevo webhook URL'inde `secret` query param + body içinde `webhookSecret` doğrulaması.
- Yetkisiz call → 401 + Sentry event.

---

## 8) Test gereksinimleri

**Prompt — test-writer için:**

### Backend unit (Jest)
- `EmailDispatcher.shouldSend`: tüm 6 kuralın kombinasyonu (kill switch, suppression, prefs, daily cap).
- `BrevoApiProvider`: mock axios — 200 başarı, 429 rate limit (fallback tetikler), 5xx fail.
- `SmtpProvider`: nodemailer mock — connection refused → retry.
- `EmailRenderer`: Handlebars compile + partial + missing variable case.
- `encryption.ts`: round-trip encrypt/decrypt, yanlış key ile hata.
- `unsubscribeToken`: üret/doğrula, expired token, başka kullanıcının token'ı.
- `ProcessSendEmailJobUseCase`: primary fail → fallback try → başarı; her ikisi fail → DEAD_LETTER.
- `CheckBounceRateAlertUseCase`: %2 altı sessiz, %2 üstü bulk pause + bildirim.

### Backend integration
- POST /admin/email/providers + test maili (ConsoleProvider mock'la).
- Webhook: simulate Brevo bounce payload → SuppressedEmail oluşur.
- Kullanıcı `marketing: false` set ettiğinde campaign-announcement gönderimi `BLOCKED_BY_PREFS` döner.

### Frontend (Vitest + Testing Library)
- `EmailKillSwitches`: toggle değişimi confirmation modal'ı tetikler, API çağrısı yapılır.
- `EmailProviders` add modal: kind seçimine göre form alanları dinamik.
- `EmailPreferences` profil sayfası: critical alanların kapatılamadığını doğrula.
- `EmailLogs` filtreleme: query params güncel kalır.

### Playwright e2e + a11y
**Prompt — e2e-writer için:**
- `e2e/specs/email.spec.ts`:
  - Admin → kill switch off → educator şifre sıfırlama isteği → log'da `BLOCKED_BY_ADMIN`.
  - Aday `marketing: false` → kampanya cron'u çalışır → log'da `BLOCKED_BY_PREFS`.
  - Admin yeni Brevo provider ekler → test maili → başarılı sonuç görünür.
  - Unsubscribe link tıklama → preference güncellenir.
- `e2e/specs/a11y.spec.ts` — yeni sayfaların hepsi için axe-core.

---

## 9) Konfigürasyon ekleri

`.env`:
```
EMAIL_SECRETS_KEY=<openssl rand -hex 32>
EMAIL_REDIS_QUEUE_PREFIX=email
EMAIL_DEFAULT_FROM=noreply@sinavsalonu.com
EMAIL_DEFAULT_FROM_NAME=Sınav Salonu
EMAIL_BREVO_WEBHOOK_PATH=/webhooks/email/brevo
EMAIL_TEMPLATE_DIR=src/infrastructure/email/templates
```

`docker-compose.yml` / `docker-compose.prod.yml`:
- Redis zaten var (BullMQ kullanır).
- Worker service ekle (ya da backend container'ında ek script: `npm run worker:email`).
- `email-worker` ayrı container önerisi (yatay ölçek için).

---

## 10) Migrasyon planı (sırayla)

1. `backend-architect` → Aşama 2 (Prisma schema + migration) + Aşama 7 encryption utility.
2. `backend-architect` → Aşama 3 (Service + Provider'lar + Use Case + Controller + Webhook).
3. Şablon dosyalarını seed (`apps/backend/src/infrastructure/email/templates/`).
4. `test-writer` → Aşama 8 unit + integration.
5. `ui-builder` → Aşama 4.2 (`EmailKillSwitches`) + 4.3 (`EmailProviders`).
6. `ui-builder` → Aşama 4.4 + 4.5 (`Dashboard` + `Logs`) + 4.6 (profil bildirim tercihleri).
7. `e2e-writer` → Aşama 8 Playwright + a11y.
8. `backend-architect` → Aşama 6 cron jobs.
9. Mevcut Use Case'lere `SendEmailUseCase` çağrıları ekle (Aşama 3.3 tablosu).
10. `code-reviewer` ile tam PR review.
11. Yerel staging: `./scripts/staging.sh up` + Brevo sandbox hesabı ile e2e doğrulama.
12. `/ship "feat: email traffic management module"`.

---

## 11) Kabul kriterleri

- [ ] Eğitici/Aday/Staff × Kritik/Bildirim/Toplu kill switch matrisi admin panelinden tek tıkla kontrol edilebilir; off iken hedef rol için mail gönderilmez, log'da `BLOCKED_BY_ADMIN` görünür.
- [ ] Admin yeni Brevo API sağlayıcısı veya SMTP sağlayıcısı ekleyebilir; API key/şifre şifreli saklanır, hiçbir endpoint plaintext dönmez.
- [ ] Admin "test maili gönder" butonuyla sağlayıcıyı doğrulayabilir.
- [ ] Birincil sağlayıcı 5xx döndüğünde worker otomatik fallback sağlayıcıya geçer.
- [ ] Brevo günlük 300 limit dolunca o sağlayıcı geçici devre dışı, fallback'e geçilir.
- [ ] Aday profilinde 7 bildirim tercihi toggle'ı var; `marketing: false` set edildiğinde kampanya maili gönderimi `BLOCKED_BY_PREFS` log'lar.
- [ ] Kritik mailler (şifre sıfırlama, ödeme makbuzu, iade) preference'tan etkilenmez — her zaman gider.
- [ ] Unsubscribe linki tıklandığında ilgili kategori kapanır, kullanıcıya onay sayfası gösterilir.
- [ ] `EmailLog.htmlBody` 90 gün sonra cron tarafından null'lanır; satır kalır, metrikler korunur.
- [ ] Brevo bounce webhook'u çalışır, `SuppressedEmail` otomatik yazılır.
- [ ] Bounce rate %2 aşıldığında bulk kuyruğu otomatik kapanır, admin'e bildirim gider.
- [ ] HTTP submit edilen Use Case'lerde mail göndermek için saniye altı tetik (kuyruğa push); senkron SMTP bekleme yok.
- [ ] 3 ayrı kuyruk (critical/notify/bulk) canlı staging'de doğrulandı.
- [ ] Admin EmailLogs sayfasında bir maili manuel retry edebilir.
- [ ] Tüm yeni admin sayfaları axe-core 0 violation.
- [ ] Sistemde hiçbir kod path'i Anthropic Claude dışında ücretli servise istek atmıyor; ücretsiz katmanlar (Brevo) veya kullanıcı sahipli SMTP üzerinden çalışıyor.

---

## 12) Notlar

- **Brevo dashboard kurulumu:** Bir kerelik manuel — domain ekleme + DKIM/SPF DNS kayıtları + webhook URL yapılandırması. Operasyon dokümanı `docs/ops/email-setup.md` olarak ayrıca tutulmalı (bu plan kapsamı dışında).
- **Kurumsal SMTP DNS kayıtları:** Kullanıcı kendi domain'inden gönderiyorsa SPF (`v=spf1 include:_spf.brevo.com include:_spf.google.com ~all`) ve DKIM kurulumu kritik — admin sayfasında bir "DNS kontrol et" widget'ı (faz 2) eklenmeli.
- **`emailUnsubscribeToken`:** İlk migration'da tüm mevcut User'lar için generate edilmeli (data migration script).
- **CONSOLE provider:** Sadece `NODE_ENV !== 'production'` durumunda kullanılabilir; üretimde aktive edilirse uygulama başlatma sırasında hata fırlat.
- **Brevo IP havuzu:** Ücretsiz katmanda paylaşımlı IP. Hacim büyürse dedicated IP için ayrı planlama gerekir (ücretli) — şu an kapsam dışı.
- **Future faz 2 önerileri:** IMAP bounce polling (SMTP için), DB-stored editable templates (admin panelinden Handlebars düzenleme), açılma/tıklama tracking (KVKK opt-in ile), A/B test framework, multi-language template versiyonları.
