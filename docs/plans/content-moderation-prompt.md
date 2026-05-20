# Sınav Salonu — İçerik Moderasyonu + Engellenen Eğitici Raporlama
## Implementation Prompt (backend-architect + ui-builder + test-writer + e2e-writer için)

> Bu doküman, `Delege Rehberi`'ndeki agent'lara aşamalı olarak verilebilir. Her aşamanın sonunda `code-reviewer` agent'ı ile gözden geçirme önerilir. Hiçbir adımda ücretli üçüncü taraf servis kullanılmayacaktır — yalnızca Claude API (Anthropic) ve açık kaynak kütüphaneler.

---

## 0) Hedef ve kısıtlar

**Hedef:** Eğiticilerin (`role: EDUCATOR`) sınav sorusu ve soru/seçenek görselleri yüklerken toplumu rahatsız edici (nefret, müstehcen, şiddet, intihar teşviki, etnik/dini aşağılama, küfür, deepfake, gore) içerik girmesini engellemek; ihlal yapan eğiticileri otomatik puanlayıp admin panelinden raporlanır ve yaptırım uygulanabilir kılmak.

**Sert kısıtlar:**
1. **Yalnızca Claude API + açık kaynak.** Azure / AWS / Google / OpenAI / Sightengine / Hive vb. ücretli servisler **yasak**.
2. Türkçe içerik öncelikli; tıbbi, tarihi, hukuki sınav terminolojisi false positive üretmemeli.
3. KVKK uyumu — Claude API'ye gönderilen içeriklerin audit log'u tutulmalı, kullanıcıya bilgilendirme yapılmalı.
4. Submit UX'i kırılmamalı: ağır kontroller **async** çalışmalı, soru `PENDING_REVIEW` durumunda kaydedilebilmeli.
5. Mevcut mimariye saygı: Controller ince, iş mantığı Use Case'te, Prisma yalnızca Repository içinden.

**Yumuşak hedefler:**
- Birinci katman (regex + NSFW.js) saniye altı, ücretsiz, %70+ açık ihlali yakalasın.
- Claude çağrısı yalnızca birinci katmanın "şüpheli" işaretlediğinde tetiklensin → maliyet düşük kalsın.
- Kill switch: AdminSettings'ten moderasyon servisi kapatılabilsin (acil durum / API kotası bittiğinde).

---

## 1) Mimari karar — Üç katmanlı moderasyon

```
Educator submit
   │
   ▼
[Katman 1 — Senkron, ücretsiz]
   • BlockedTerm regex (TR normalize)
   • Görselde NSFW.js (Node port: @tensorflow-models/nsfwjs)
   │   ├─ Açık ihlal     → reddedilir (status: REJECTED, gerekçe döner)
   │   ├─ Temiz           → status: APPROVED, doğrudan yayına uygun
   │   └─ Şüpheli         → Katman 2'ye düşer (status: PENDING_REVIEW)
   ▼
[Katman 2 — Async job, Claude API]
   • BullMQ job (mevcut Redis var)
   • Metin için: claude-haiku-4-5 (ucuz, hızlı), structured output JSON
   • Görsel için: claude-sonnet-4-6 vision (yalnız şüpheli olanlarda)
   │   ├─ Skor < threshold → APPROVED
   │   └─ Skor ≥ threshold → MANUAL_REVIEW + ModerationViolation kaydı
   ▼
[Katman 3 — Admin manuel inceleme + raporlama]
   • Admin panel: MANUAL_REVIEW kuyruğu
   • EducatorRiskScore tablosu güncellenir
   • Otomatik yaptırım: skor eşiği aşılırsa eğitici askıya alınır
```

**Neden bu sıralama:**
- Katman 1, Claude'a hiç gitmeden açık küfürü/pornoyu eler → maliyet ve gecikme yok.
- Katman 2 yalnızca şüpheli içerikte tetiklenir → Claude faturası kontrollü.
- Katman 3, Claude'un da yetersiz kaldığı bağlamsal kararlarda devreye girer.

---

## 2) Prisma şema değişiklikleri

**Prompt — backend-architect için:**

> `apps/backend/prisma/schema.prisma` dosyasına aşağıdaki modelleri ekle ve yeni migration üret (`npm run db:migrate -- --name add_content_moderation`). Mevcut `User`, `ExamQuestion`, `ExamTest` modellerine ilgili alanları ekle. `tenantId` zorunlu — multi-tenant disiplinine uy.

```prisma
// Yeni enum'lar
enum ModerationStatus {
  PENDING_REVIEW
  APPROVED
  REJECTED
  MANUAL_REVIEW
}

enum ModerationCategory {
  HATE_SPEECH       // nefret söylemi
  SEXUAL            // müstehcenlik
  VIOLENCE          // şiddet
  SELF_HARM         // intihar/öz zarar
  HARASSMENT        // taciz
  ILLEGAL           // yasadışı faaliyet teşviki
  PROFANITY         // küfür/argo
  SPAM              // spam
  COPYRIGHT         // telif (manuel)
  OTHER
}

enum ModerationProvider {
  BLOCKLIST          // Katman 1 regex
  NSFWJS             // Katman 1 görsel
  CLAUDE_TEXT        // Katman 2 metin
  CLAUDE_VISION      // Katman 2 görsel
  MANUAL             // Katman 3 admin
}

enum EducatorRiskLevel {
  CLEAN              // 0 ihlal
  WATCH              // 1-2 düşük şiddet ihlal
  WARNED             // 3+ ihlal veya 1 ağır
  SUSPENDED          // otomatik veya manuel askıya
  BANNED             // kalıcı engel
}

enum ModerationActionType {
  AUTO_REJECT
  AUTO_FLAG
  MANUAL_APPROVE
  MANUAL_REJECT
  WARN_EDUCATOR
  SUSPEND_EDUCATOR
  UNSUSPEND_EDUCATOR
  BAN_EDUCATOR
  UNBAN_EDUCATOR
}

// Admin panelinden yönetilen kelime listesi
model BlockedTerm {
  id          String   @id @default(cuid())
  tenantId    String
  term        String                                  // normalize edilmiş hali
  pattern     String?                                 // opsiyonel regex
  category    ModerationCategory
  severity    Int                                     // 1-5
  isActive    Boolean  @default(true)
  createdBy   String                                  // admin userId
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId, isActive])
  @@index([tenantId, category])
}

// Her moderasyon kararı için audit log
model ModerationResult {
  id           String              @id @default(cuid())
  tenantId     String
  entityType   String                                  // "ExamQuestion" | "ExamQuestionOption" | "TestImage" | "EducatorBio"
  entityId     String
  educatorId   String                                  // ihlali yapan
  provider     ModerationProvider
  status       ModerationStatus
  categories   ModerationCategory[]                    // tespit edilen kategoriler
  scores       Json                                    // { hate: 0.1, sexual: 0.8, ... }
  reasonText   String?                                 // Claude'un açıklaması
  matchedTerms String[]                                // blocklist eşleşmeleri
  rawResponse  Json?                                   // tam API yanıtı (debug için)
  cost         Decimal?            @db.Decimal(10, 6)  // Claude USD (varsa)
  latencyMs    Int
  createdAt    DateTime            @default(now())

  tenant       Tenant              @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  educator     User                @relation(fields: [educatorId], references: [id])
  violation    ModerationViolation?

  @@index([tenantId, entityType, entityId])
  @@index([tenantId, educatorId, createdAt])
  @@index([tenantId, status, createdAt])
}

// Yalnız REJECTED veya MANUAL_REVIEW sonucu olan kararlar buraya düşer
model ModerationViolation {
  id                 String                @id @default(cuid())
  tenantId           String
  educatorId         String
  moderationResultId String                @unique
  entityType         String
  entityId           String
  category           ModerationCategory
  severity           Int                                              // 1-5
  status             String                @default("OPEN")            // OPEN | DISMISSED | CONFIRMED
  adminNote          String?
  reviewedBy         String?                                          // admin userId
  reviewedAt         DateTime?
  createdAt          DateTime              @default(now())

  tenant             Tenant                @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  educator           User                  @relation(fields: [educatorId], references: [id])
  moderationResult   ModerationResult      @relation(fields: [moderationResultId], references: [id])
  actions            ModerationAction[]

  @@index([tenantId, educatorId, createdAt])
  @@index([tenantId, status, severity, createdAt])
}

// Admin'in eğitici hakkında aldığı aksiyon kaydı (askıya, ban, uyarı vb.)
model ModerationAction {
  id              String                 @id @default(cuid())
  tenantId        String
  educatorId      String
  violationId     String?
  actionType      ModerationActionType
  performedBy     String                                              // admin userId, otomatikse "SYSTEM"
  reason          String
  durationDays    Int?                                                // suspend süresi
  expiresAt       DateTime?
  createdAt       DateTime               @default(now())

  tenant          Tenant                 @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  educator        User                   @relation(fields: [educatorId], references: [id])
  violation       ModerationViolation?   @relation(fields: [violationId], references: [id])

  @@index([tenantId, educatorId, createdAt])
  @@index([tenantId, actionType, createdAt])
}

// Eğitici başına özet/risk profili (denormalize, hızlı admin listesi için)
model EducatorRiskScore {
  educatorId           String              @id
  tenantId             String
  riskLevel            EducatorRiskLevel   @default(CLEAN)
  totalViolations      Int                 @default(0)
  openViolations       Int                 @default(0)
  highSeverityCount    Int                 @default(0)
  lastViolationAt      DateTime?
  suspendedUntil       DateTime?
  isBanned             Boolean             @default(false)
  computedScore        Int                 @default(0)                // 0-100, yüksek = riskli
  updatedAt            DateTime            @updatedAt

  educator             User                @relation(fields: [educatorId], references: [id], onDelete: Cascade)
  tenant               Tenant              @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId, riskLevel, computedScore])
  @@index([tenantId, lastViolationAt])
}
```

**`ExamQuestion` ve `ExamQuestionOption` modellerine ekle:**
```prisma
moderationStatus ModerationStatus @default(PENDING_REVIEW)
moderatedAt      DateTime?
```

**`AdminSettings` modeline ekle (mevcutsa alanları genişlet):**
```prisma
moderationEnabled              Boolean  @default(true)
moderationClaudeEnabled        Boolean  @default(true)
moderationThresholds           Json     @default("{\"hate\":0.7,\"sexual\":0.6,\"violence\":0.7,\"selfHarm\":0.5,\"harassment\":0.7}")
moderationAutoSuspendThreshold Int      @default(80)                  // EducatorRiskScore.computedScore eşiği
moderationAutoBanThreshold     Int      @default(95)
moderationModelText            String   @default("claude-haiku-4-5")
moderationModelVision          String   @default("claude-sonnet-4-6")
```

---

## 3) Backend — ContentSafetyService ve Use Case'ler

**Prompt — backend-architect için:**

> `apps/backend/src/application/services/content-safety/` dizini oluştur. Sağlayıcı bağımlılığı arayüz ile soyutla — gelecekte Claude dışı bir self-hosted modele geçişe açık kalsın. Use Case'ler `apps/backend/src/application/use-cases/moderation/` altına yazılacak.

### 3.1 Service katmanı

```
apps/backend/src/application/services/content-safety/
  ContentSafetyService.ts          ← Orkestratör: katman 1 → katman 2 sırası
  providers/
    IModerationTextProvider.ts     ← arayüz
    IModerationImageProvider.ts    ← arayüz
    BlocklistTextProvider.ts       ← katman 1: regex + TR normalize
    NsfwjsImageProvider.ts         ← katman 1: @tensorflow-models/nsfwjs
    ClaudeTextProvider.ts          ← katman 2: Anthropic SDK + JSON schema
    ClaudeVisionProvider.ts        ← katman 2: vision capable model
  utils/
    turkishNormalize.ts            ← lowercase + diakritik + leetspeak çözümü
    moderationQueue.ts             ← BullMQ job tanımı
```

**`BlocklistTextProvider` davranışı:**
- AdminSettings → `BlockedTerm.findMany({ isActive: true })` cache'lenir (Redis, 60sn TTL).
- Girdi `turkishNormalize()` ile sadeleştirilir (`ş→s`, `ğ→g`, `0→o`, `1→i`, boşluk/nokta/yıldız temizle).
- Her `term` literal contains kontrolü, her `pattern` regex eşleşmesi.
- Sonuç: `{ status, matchedTerms[], maxSeverity, categories[] }`.

**`NsfwjsImageProvider` davranışı:**
- Görsel buffer'ı `nsfwjs.classify()`'a verilir.
- Eşikler: `Porn > 0.8` veya `Hentai > 0.8` → REJECT, `Sexy > 0.7` → SUSPECT, diğerleri APPROVED.
- Şiddet/gore yakalamaz — Katman 2 görsel için Claude vision tetiklenir.

**`ClaudeTextProvider` davranışı:**
- Anthropic SDK: `@anthropic-ai/sdk`, `process.env.ANTHROPIC_API_KEY`.
- Model: `claude-haiku-4-5` (AdminSettings'ten okunur).
- System prompt aşağıdaki gibi olmalı:

```
Sen bir Türkçe sınav platformu için içerik moderatörüsün. Verilen metni
eğitim içeriği bağlamında değerlendir. Tıbbi, tarihi, edebi, hukuki
referanslar (örn. savaş tarihi, hastalık isimleri, hukuki ihlal kavramları)
EĞİTİM AMAÇLI ise temiz kabul edilir.

Aşağıdaki kategorilerde 0.0-1.0 arası skor üret:
- hate: nefret söylemi (etnik/dini/cinsiyet)
- sexual: müstehcen içerik
- violence: şiddet teşviki (sınav sorusu olarak tarihi savaş anlatımı DEĞİL)
- self_harm: intihar/öz zarar teşviki
- harassment: kişisel taciz, aşağılama
- illegal: yasadışı faaliyet rehberi
- profanity: küfür/argo

Yalnız JSON döndür:
{
  "scores": { "hate": 0.0, "sexual": 0.0, "violence": 0.0, "self_harm": 0.0, "harassment": 0.0, "illegal": 0.0, "profanity": 0.0 },
  "categories": ["..."],
  "reasoning": "kısa Türkçe açıklama"
}
```
- `response_format` veya tool-use ile structured output zorla.
- Eşik karşılaştırması Service katmanında: AdminSettings.moderationThresholds.

**`ClaudeVisionProvider` davranışı:**
- Yalnız Katman 1 "SUSPECT" verirse tetiklenir; hiçbir görsel doğrudan Claude'a gitmez (KVKK + maliyet).
- Görsel base64 olarak gönderilir. Model: `claude-sonnet-4-6`.
- System prompt: "Bu görsel bir Türkçe sınav sorusunda kullanılmak üzere yüklendi. Müstehcen, şiddet içerikli, kanlı, nefret sembollü, deepfake veya çocuk istismarı içeriyor mu? JSON döndür: {scores, categories, reasoning}."
- **KRİTİK:** Görselde olası CSAM şüphesi varsa Claude API doğrudan reddeder; bu durumda otomatik REJECT + admin'e acil bildirim + eğitici otomatik askıya.

**`ContentSafetyService.moderate(input)` akışı:**
```ts
async moderate(input: ModerationInput): Promise<ModerationOutcome> {
  if (!settings.moderationEnabled) return { status: APPROVED, skipped: true };

  // Katman 1
  const l1 = input.type === "text"
    ? await blocklist.check(input.text)
    : await nsfwjs.check(input.imageBuffer);

  if (l1.status === REJECTED) return persistAndReturn(l1);
  if (l1.status === APPROVED) return persistAndReturn(l1);

  // SUSPECT → Katman 2 (async job'a düşür, hemen PENDING dön)
  if (settings.moderationClaudeEnabled) {
    await queue.enqueue({ ...input, l1Result: l1 });
    return persistAndReturn({ status: PENDING_REVIEW, ...l1 });
  }
  return persistAndReturn({ status: MANUAL_REVIEW, ...l1 });
}
```

### 3.2 Use Case'ler

`apps/backend/src/application/use-cases/moderation/` altında:

| Use Case | Sorumluluk |
|---|---|
| `ModerateQuestionContentUseCase` | Soru oluşturma/düzenleme akışına bağlanır. Metin + her seçeneği + varsa görseli `ContentSafetyService`'e gönderir. |
| `ProcessModerationJobUseCase` | BullMQ worker. Katman 2 çağrılarını yapar, sonuca göre `ExamQuestion.moderationStatus` günceller ve gerekirse `ModerationViolation` kaydı açar. |
| `RecordModerationViolationUseCase` | `ModerationResult` + `ModerationViolation` yazar, `EducatorRiskScore`'u günceller (transaction). |
| `RecomputeEducatorRiskScoreUseCase` | Eğiticinin son 90 günlük ihlallerini toplar, ağırlıklı skor üretir, `riskLevel`'i set eder. Otomatik askıya/ban eşiğine ulaştıysa `ModerationAction(SUSPEND/BAN)` üretir. |
| `ListPendingModerationsUseCase` | Admin paneli için MANUAL_REVIEW kuyruğunu cursor pagination ile döner. |
| `ApproveModerationUseCase` | Admin "temiz" der → `ExamQuestion.moderationStatus = APPROVED`, ilgili violation `DISMISSED`. |
| `RejectModerationUseCase` | Admin "kirli" der → status REJECTED, violation `CONFIRMED`, eğiticiye bildirim. |
| `ListRiskyEducatorsUseCase` | Admin engellenen/uyarılan eğitici listesi. Filtreleme: riskLevel, kategori, tarih aralığı. Cursor pagination + composite index `[tenantId, riskLevel, computedScore]`. |
| `GetEducatorViolationHistoryUseCase` | Tek eğitici detayı: tüm ihlaller, kararlar, aksiyon geçmişi. |
| `ApplyModerationActionUseCase` | Admin manuel uyarı/askıya/ban uygular. `ModerationAction` yazar, `User.suspendedUntil` veya `User.isBanned` günceller. |
| `RevokeModerationActionUseCase` | Yanlışlıkla verilen yaptırımı geri al. |
| `ManageBlockedTermsUseCase` | Admin BlockedTerm CRUD. |

**Use Case yazım kuralları (CLAUDE.md hatırlatması):**
- Her Use Case `execute(dto): Promise<Result>` tek public metot.
- DTO'lar `class-validator` ile, controller'da DTO sınıfı tanımlı.
- Birden fazla tablo değişiyorsa `prisma.$transaction` zorunlu (örn. RecordModerationViolationUseCase).
- Liste endpoint'leri `select: { ... }` ile sadece UI alanlarını çekecek.

### 3.3 Use Case ile mevcut akışlara entegrasyon

`CreateExamQuestionUseCase` ve `UpdateExamQuestionUseCase` Use Case'lerine **post-write hook** ekle:
```ts
// Transaction içinde:
const question = await this.repo.create(...);
await this.moderateQuestionContent.execute({
  questionId: question.id,
  educatorId: user.id,
  text: question.content,
  options: question.options,
});
```

Soru oluştuktan sonra `moderationStatus = PENDING_REVIEW`. Yayımlanma (publish) Use Case'i `moderationStatus = APPROVED` koşulunu kontrol etsin — `PENDING_REVIEW` veya `MANUAL_REVIEW` testin yayımlanmasını engellesin.

### 3.4 API endpoint'leri (nest controllers)

`apps/backend/src/nest/controllers/admin/ModerationController.ts`:

| Method | Path | Use Case | Roller |
|---|---|---|---|
| GET | `/admin/moderation/queue` | ListPendingModerationsUseCase | ADMIN, WORKER:moderation |
| GET | `/admin/moderation/results/:id` | GetModerationResultUseCase | ADMIN, WORKER:moderation |
| POST | `/admin/moderation/:id/approve` | ApproveModerationUseCase | ADMIN, WORKER:moderation |
| POST | `/admin/moderation/:id/reject` | RejectModerationUseCase | ADMIN, WORKER:moderation |
| GET | `/admin/moderation/risky-educators` | ListRiskyEducatorsUseCase | ADMIN |
| GET | `/admin/moderation/educators/:id/violations` | GetEducatorViolationHistoryUseCase | ADMIN |
| POST | `/admin/moderation/educators/:id/actions` | ApplyModerationActionUseCase | ADMIN |
| DELETE | `/admin/moderation/actions/:id` | RevokeModerationActionUseCase | ADMIN |
| GET | `/admin/moderation/blocked-terms` | ListBlockedTermsUseCase | ADMIN |
| POST | `/admin/moderation/blocked-terms` | CreateBlockedTermUseCase | ADMIN |
| PATCH | `/admin/moderation/blocked-terms/:id` | UpdateBlockedTermUseCase | ADMIN |
| DELETE | `/admin/moderation/blocked-terms/:id` | DeleteBlockedTermUseCase | ADMIN |
| GET | `/educators/me/moderation-status` | GetMyModerationStatusUseCase | EDUCATOR |

Yeni `WorkerPermission` enum değeri: `MODERATION_REVIEW`. `@WorkerPermissions(['MODERATION_REVIEW'])` decorator'ı ile WORKER rolüne kısmi erişim verilebilsin.

---

## 4) Frontend — Eğitici tarafı ve admin sayfaları

**Prompt — ui-builder için:**

> Mevcut `pages.config.js` + `routeRoles.js` disiplinine sadık kal. Her yeni sayfa `React.lazy` ile import edilsin. API çağrıları yalnız `dalClient.js` üzerinden gitsin. Dark mode utility'leri zorunlu. Tüm formlar için `<label htmlFor>` ve focus-visible ring.

### 4.1 Eğitici tarafı — Çalışmayan yumuşak uyarı

**Yeni bileşen:** `apps/frontend/src/components/test/ModerationStatusBadge.jsx`
- Props: `status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'MANUAL_REVIEW'`
- Renkler: amber (pending), emerald (approved), rose (rejected), violet (manual).
- Test detay ve soru listesi sayfalarına ekle.

**Soru editör formuna entegrasyon:**
- Submit sonrası `moderationStatus !== APPROVED` ise toast: "Sorunuz inceleme bekliyor. Onaylanmadan testi yayımlayamazsınız."
- REJECTED ise gerekçe metni inline gösterilsin (Claude reasoning veya matchedTerms).

**Yeni sayfa:** `apps/frontend/src/pages/educator/MyModerationStatus.jsx`
- `/egitici/icerik-durumu` route.
- Eğiticinin son 30 günlük ihlal/red kayıtları, açık uyarılar, askıya durumu.
- Askıya alındıysa "Kalan süre: 3 gün 14 saat" sayacı.

### 4.2 Admin tarafı — İçerik moderasyonu paneli

**Yeni sayfalar `apps/frontend/src/pages/admin/` altında:**

| Sayfa | Route | Amaç |
|---|---|---|
| `ModerationQueue.jsx` | `/yonetim/moderasyon/kuyruk` | MANUAL_REVIEW bekleyenler. Filtreler: kategori, tarih, eğitici. Her satırda hızlı onayla/reddet. |
| `ModerationResultDetail.jsx` | `/yonetim/moderasyon/sonuc/:id` | Tek karar detayı: orijinal içerik (metin/görsel), Claude reasoning, blocklist eşleşmeleri, eğitici geçmişi linki. |
| **`RiskyEducators.jsx`** | `/yonetim/moderasyon/eğiticiler` | **Engellenen / uyarılan eğiticileri raporlayan ana ekran — detay aşağıda.** |
| `EducatorViolationDetail.jsx` | `/yonetim/moderasyon/eğitici/:id` | Tek eğiticinin tam moderasyon dosyası. |
| `BlockedTerms.jsx` | `/yonetim/moderasyon/kelime-listesi` | BlockedTerm CRUD. Kategori, severity, regex/literal seçimi. |
| `ModerationSettings.jsx` | `/yonetim/moderasyon/ayarlar` | Kill-switch, eşik slider'ları, otomatik askıya/ban eşikleri, Claude model seçimi. |

### 4.3 Engellenen Eğitici Raporlama Ekranı — DETAYLI

**Prompt — ui-builder için (bu ekran kritik, ayrı brief):**

> Bu, kullanıcının özellikle istediği ekran. Admin'in tek bakışta hangi eğiticilerin "risk hattında" olduğunu, hangilerinin otomatik askıya alındığını, hangilerinin manuel inceleme beklediğini görmesini sağlar.

**Sayfa:** `apps/frontend/src/pages/admin/RiskyEducators.jsx`
**Route:** `/yonetim/moderasyon/eğiticiler`
**Endpoint:** `GET /admin/moderation/risky-educators`

**Layout (üstten alta):**

**1. Üst KPI şeridi (4 kart):**
- Aktif uyarı altındaki eğitici sayısı (WATCH + WARNED)
- Askıya alınmış eğitici sayısı (SUSPENDED)
- Kalıcı engelli eğitici sayısı (BANNED)
- Son 7 günde açılan ihlal sayısı

**2. Filtre çubuğu:**
- Risk seviyesi multi-select: `CLEAN | WATCH | WARNED | SUSPENDED | BANNED`
- Kategori multi-select (ModerationCategory enum)
- Tarih aralığı (son ihlal tarihi)
- Eğitici adı / e-posta arama (debounce 300ms)
- Sıralama: `computedScore desc` (varsayılan) | `lastViolationAt desc` | `totalViolations desc`

**3. Eğitici tablosu (cursor pagination, 20'şer):**
| Sütun | İçerik |
|---|---|
| Eğitici | Avatar + isim + e-posta, isimleten `EducatorViolationDetail`'e link |
| Risk seviyesi | Renkli `Badge`: CLEAN(gri) WATCH(amber) WARNED(orange) SUSPENDED(red) BANNED(black) |
| Skor | `computedScore` (0-100), progress bar |
| Toplam ihlal | `totalViolations` |
| Açık | `openViolations` (yeşil "0", varsa kırmızı sayı) |
| Yüksek şiddet | `highSeverityCount` |
| Son ihlal | relative time "3 gün önce" |
| Askıya bitiş | `suspendedUntil` (varsa) |
| Aksiyonlar | Dropdown: "Detayı gör", "Uyar", "Askıya al", "Banla", "Yaptırımı kaldır" |

**4. Boş durum:**
- "Aktif risk altında eğitici yok — sistem temiz görünüyor."
- İllüstrasyon (basit SVG yeşil onay).

**5. Hızlı aksiyon modal'ı:**
- "Askıya al" tıklanırsa modal: süre seçimi (3 gün / 7 gün / 30 gün / sınırsız), gerekçe textarea (zorunlu, min 20 karakter), onay.
- `POST /admin/moderation/educators/:id/actions` çağrılır.
- Başarıda toast + satır anlık güncellenir (TanStack Query invalidation).

**6. Bildirimler:**
- Askıya alma sonrası eğiticiye sistem bildirimi (mevcut Notification akışı kullanılır).
- Kritik kategori (SELF_HARM, HATE_SPEECH severity 5) varsa satır üst kenarında pulse animation + tooltip "Acil inceleme önerilir".

**7. Erişilebilirlik:**
- Tablo `<table>` semantiği, her satır `aria-label="Eğitici: Ali Veli, risk seviyesi uyarıldı"`.
- Aksiyon dropdown'ları keyboard navigable (Radix `DropdownMenu`).
- Renk + ikon birlikte (sadece renge bağımlı değil).
- `e2e/specs/a11y.spec.ts` dosyasına bu sayfa için axe-core kontrolü ekle.

**8. EducatorViolationDetail sayfası (eğitici tıklanınca):**
- Üst: Eğitici özet kartı + tüm zaman ihlal grafiği (recharts BarChart, kategori bazında).
- Orta: İhlaller timeline'ı (en yeni üstte): her kayıtta tarih, kategori, severity, içerik snippet (metin) veya thumbnail (görsel), Claude reasoning, admin'in kararı (DISMISSED/CONFIRMED), uygulanan aksiyon.
- Alt: Aksiyon geçmişi (uyarı, askıya, ban, kaldırma) ve mevcut durum.
- Sağ panel: hızlı aksiyon butonları (Uyar / Askıya / Banla / Geri Al).

### 4.4 Sidebar/Navigation güncellemesi

`apps/frontend/src/components/layout/Sidebar.jsx`:
- Admin rolünde yeni grup: **"İçerik Moderasyonu"**
  - İnceleme kuyruğu (badge: bekleyen sayısı)
  - Riskli eğiticiler (badge: SUSPENDED+BANNED sayısı, kırmızı)
  - Kelime listesi
  - Ayarlar
- Educator rolünde profil menüsünde: "İçerik durumum" linki.

---

## 5) Cron / Job tetikleyicileri

**Prompt — backend-architect için:**

> `apps/backend/src/nest/modules/cron/` altına `ModerationCronService.ts` ekle.

1. **Her saat:** `RecomputeAllEducatorRiskScoresUseCase` — son 24 saatte ihlal kaydı olan eğiticilerin skorunu yeniden hesapla.
2. **Her gün 03:00:** Süresi dolan suspend'leri otomatik kaldır (`suspendedUntil < now` && `riskLevel = SUSPENDED` → `WARNED`).
3. **Her gün 04:00:** 90 gün öncesinin ihlal kayıtlarını risk skorundan düşür (rolling window).
4. **BullMQ worker:** `ProcessModerationJobUseCase` — Katman 2 Claude çağrılarını işler. Retry policy: 3 deneme, exponential backoff. Hata durumunda MANUAL_REVIEW'a düşür.

---

## 6) AdminSettings UI ek bölümü

`ModerationSettings.jsx` formu:
- Toggle: "İçerik moderasyonu aktif" (kill switch)
- Toggle: "Claude API ile derin moderasyon aktif" (yalnız Katman 1 ile çalış)
- Model seçimi: `claude-haiku-4-5` | `claude-sonnet-4-6` (dropdown)
- Eşik slider'ları (her kategori için 0.0-1.0, default 0.7)
- Otomatik askıya eşiği: skor 0-100 (default 80)
- Otomatik ban eşiği: skor 0-100 (default 95)
- "Test et" butonu: Form ile örnek metin/görsel verip moderasyon sonucu önizler.

---

## 7) Skor hesaplama formülü (RecomputeEducatorRiskScoreUseCase)

```
Her ihlalin ağırlığı:
  weight = severity * categoryMultiplier * recencyDecay

categoryMultiplier:
  SELF_HARM, HATE_SPEECH        = 3.0
  SEXUAL, VIOLENCE, ILLEGAL     = 2.0
  HARASSMENT                    = 1.5
  PROFANITY, SPAM, OTHER        = 1.0
  COPYRIGHT                     = 1.0

recencyDecay = max(0.1, 1 - (daysSinceViolation / 90))

computedScore = min(100, round(sum(weights) * 4))
```

| Skor aralığı | riskLevel |
|---|---|
| 0 | CLEAN |
| 1-25 | WATCH |
| 26-60 | WARNED |
| 61-95 | SUSPENDED (auto, 7 gün) |
| 96-100 | BANNED (auto, manuel kaldırılana kadar) |

Otomatik askıya/ban için `AdminSettings.moderationAutoSuspendThreshold` ve `moderationAutoBanThreshold` değerleri override eder.

---

## 8) Test gereksinimleri

**Prompt — test-writer için:**

### Backend unit (Jest)
- `BlocklistTextProvider`: TR normalize tek tek case'ler (`KÖTÜ`, `k0tü`, `k.ö.t.ü`, `KO_TU`), regex çalışma, severity hesaplama.
- `ContentSafetyService`: Katman 1 REJECT → Katman 2'ye gitmemeli (Claude provider mock), SUSPECT → queue'ya düşmeli.
- `RecomputeEducatorRiskScoreUseCase`: 90 gün eski ihlal decay testi, threshold geçişlerinde riskLevel transition.
- `ProcessModerationJobUseCase`: Claude provider hata fırlatırsa MANUAL_REVIEW'a düşmeli.
- `ApplyModerationActionUseCase`: SUSPEND uygulandığında `User.suspendedUntil` set, ilgili audit kaydı yazılmalı.

### Backend integration
- E2E REST: POST /educator/test/:id/question → Soru oluştur, `moderationStatus: PENDING_REVIEW` döndüğünü doğrula.
- Soru blocklist'le eşleşirse `REJECTED` döndüğünü ve `ModerationResult` kaydı oluştuğunu doğrula.

### Frontend (Vitest + Testing Library)
- `RiskyEducators` sayfası: filtre değişimi sorgu parametresi update, boş durum render, dropdown aksiyon çağrısı.
- `ModerationStatusBadge` her status için doğru renk ve aria-label.

### Playwright e2e + a11y
**Prompt — e2e-writer için:**
- `e2e/specs/moderation.spec.ts`:
  - Educator submit → REJECTED soru → educator hata mesajı görür.
  - Admin login → RiskyEducators sayfası → suspended eğitici görünür → manuel suspend uygula → tabloda anlık güncellenir.
- `e2e/specs/a11y.spec.ts`:
  - `RiskyEducators`, `ModerationQueue`, `EducatorViolationDetail`, `MyModerationStatus` sayfaları için axe-core kontrolü.

---

## 9) Konfigürasyon & güvenlik

`.env` eklemeleri:
```
ANTHROPIC_API_KEY=sk-ant-...
MODERATION_REDIS_QUEUE_NAME=moderation
MODERATION_MAX_RETRY=3
```

**KVKK ve gizlilik:**
- Eğitici hesap oluştururken aydınlatma metnine "İçerik moderasyonu için yüklediğiniz metin ve görseller Anthropic Claude API'sine gönderilebilir" cümlesi eklenmeli.
- `ModerationResult.rawResponse` 30 gün sonra anonimleştirilsin (cron job: `text` alanını boşalt, scores'u tut).

**Rate limit:**
- Eğitici başına saatte max 100 moderasyon çağrısı. Aşarsa 429.
- Global Claude API kotası dolarsa otomatik kill-switch: `moderationClaudeEnabled = false` set + admin'e bildirim.

---

## 10) Migrasyon planı (sırayla)

1. `backend-architect` agent'a Aşama 2 (Prisma schema) ver → migration üret → review.
2. Aynı agent'a Aşama 3 (Service + Use Case + Controller) ver → unit test ile birlikte.
3. `test-writer` agent'a Aşama 8 (testler) ver.
4. `ui-builder` agent'a Aşama 4.2 + 4.3 (admin sayfaları, özellikle RiskyEducators) ver.
5. `ui-builder` agent'a Aşama 4.1 (educator tarafı) ver.
6. `e2e-writer` agent'a Aşama 8 Playwright bölümünü ver.
7. `code-reviewer` ile tam PR review.
8. Yerel staging'de `./scripts/staging.sh up` ile end-to-end manuel doğrulama.
9. `/ship "feat: content moderation + risky educator reporting"` ile commit/push.

---

## 11) Kabul kriterleri

- [ ] Eğitici küfür içeren soru girdiğinde inline hata + soru `REJECTED` kaydı.
- [ ] Eğitici "gri alan" metin girdiğinde soru `PENDING_REVIEW` durumunda saklanır, Claude job'ı çalışır, sonuca göre durum güncellenir.
- [ ] Eğitici müstehcen görsel yüklediğinde NSFW.js anlık reddeder (Claude'a gitmeden).
- [ ] 3+ doğrulanmış ihlali olan eğitici otomatik `WARNED` görünür.
- [ ] Skor 80+ olan eğitici otomatik 7 gün askıya alınır + sistem bildirimi gider.
- [ ] Admin `RiskyEducators` sayfasında risk seviyesi filtreleyebilir, manuel yaptırım uygulayabilir.
- [ ] Admin AdminSettings'ten moderasyonu kapatabilir (kill switch).
- [ ] axe-core tüm yeni admin sayfalarında 0 violation döner.
- [ ] Hiçbir kod path'i ücretli (Azure/AWS/Google/OpenAI) servise istek atmıyor.
- [ ] Anthropic API key yoksa veya `moderationClaudeEnabled=false` ise sistem yalnız Katman 1 ile çalışır, çökmez.

---

## 12) Notlar

- **Kelime listesi tohumu:** İlk migration'da temel Türkçe küfür/argo listesi (~200 kelime) seed edilebilir. Hassas içerik olduğu için ayrı bir `seed-blocked-terms.sql` dosyasında, repo'da değil staging'de manuel yüklenir.
- **Claude prompt versiyonlama:** System prompt'ları `apps/backend/src/application/services/content-safety/prompts/` altında dosya olarak tut, kod review'da değişiklikleri takip et.
- **Maliyet izleme:** `ModerationResult.cost` alanına Anthropic faturalandırmasına göre tahmini USD yaz (input + output token sayısı * birim ücret). Admin paneline aylık toplam moderasyon maliyeti widget'ı eklenebilir.
