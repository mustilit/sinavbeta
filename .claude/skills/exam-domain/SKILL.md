---
name: exam-domain
description: Sinav Salonu domain modeli — Test/ExamTest, ExamQuestion, Attempt, User (CANDIDATE/EDUCATOR/ADMIN), TestPackage (satın alma birimi), Purchase, AdminSettings, BackupLog, DiscountCode (educator→aday), PlatformPromoCode (admin→eğitici, LIVE_SESSION/AD_PACKAGE scope), AdPackage. Yeni özellik veya veri modeli üzerinde çalışırken referans alın.
---

# Sinav Salonu — Domain Modeli

## Amaç

Test/sınav pazar yeri. Educator (eğitici) testler oluşturur ve bunları TestPackage'lar halinde fiyatlandırıp satar. Candidate (aday) **TestPackage** satın alır, paket içindeki testleri çözer, skorunu görür. Admin yönetim ve moderasyon yapar.

**Önemli:** Satın alma birimi **TestPackage**'dır, tekil Test değildir. Tekil testler doğrudan satılmaz.

## Roller

Tüm projede şu dört rol kullanılır:

- **CANDIDATE** — paket satın alır, içindeki testleri çözer, skorlarını görüntüler.
- **EDUCATOR** — test ve paket oluşturur, fiyatlar, yayımlar, indirim kodu üretir, kendi satışlarını görüntüler.
- **ADMIN** — global yönetim, moderasyon, ayarlar, yedekleme.
- **WORKER** — ADMIN alt yetki bölümlemesi (WorkerPermissions sistemi).

**AUTHOR** ve **STUDENT** terimleri **kullanılmaz** — eski referanslar varsa EDUCATOR/CANDIDATE ile düzelt.

Admin alt yetkilendirmesi için **Worker Permissions** sistemi var (`apps/backend/src/nest/guards/WorkerPermissions`). Bu farklı bir rol değil, ADMIN'in alt yetki bölümlemesidir.

## Temel Varlıklar

### User

- `id, email, name, role (CANDIDATE | EDUCATOR | ADMIN | WORKER), passwordHash, createdAt, updatedAt`
- Worker permissions ADMIN için ek izin matrisi (ayrı tablo).

### Test (ExamTest)

Tekil sınav. **Doğrudan satılmaz** — TestPackage içine yerleştirilir.

- `id, title, description, durationMinutes, educatorId, publishedAt (nullable), createdAt, updatedAt`
- Tekil `price` alanı varsa: bilgilendirici/sıralama amaçlı, transactional değil.
- `publishedAt = null` → taslak. Pakete eklense bile listelemede görünmez.
- `questions[]` ilişkisi: ExamQuestion[].
- Aktif Purchase'a bağlı bir TestPackage içindeyse silinmez.

### TestPackage

**Satın alınabilir birim.** Bir veya birden fazla Test'i kapsar.

- `id, title, description, price (Decimal), educatorId, publishedAt (nullable), createdAt, updatedAt`
- `tests[]` ilişkisi: TestPackage ↔ ExamTest (many-to-many veya join tablosu).
- `maxTestsPerPackage` admin ayarı ile sınırlandırılır (`AdminSettings`).
- `publishedAt = null` iken listelemede görünmez, satın alınamaz.
- Paket yayımlanabilsin diye: en az 1 test, `price >= 0`, title boş olmamalı.
- **Yayımlanmış paketin testleri değiştirilemez** (içerik garantisi). Başlık/açıklama değişebilir.

### ExamQuestion

Bir teste ait çoktan seçmeli soru.

- `id, examTestId, content, choices (JSON), correctIndex, explanation, orderIndex, points`
- Choices format: `[{text: '...'}]` + ayrı `correctIndex`, ya da `[{text, isCorrect}]`.
- CANDIDATE'a dönerken `correctIndex` ve `explanation` **yalnızca submit sonrası** servis edilir.
- **Kopya soru tespiti:** EDUCATOR soru girerken (blur), aynı educator'ın diğer sorularıyla Jaccard benzerliği ≥ %75 ise amber uyarı. Israr ederek devam edilebilir.

### Attempt

CANDIDATE'ın bir Test'i çözme oturumu. **Tekil Test üzerinden açılır** ama yetki TestPackage Purchase üzerinden doğrulanır.

- `id, userId, examTestId, startedAt, submittedAt (nullable), score (nullable), status (IN_PROGRESS | SUBMITTED | EXPIRED)`
- Cevaplar: `Answer { attemptId, examQuestionId, selectedIndex, isCorrect, answeredAt }`.
- **Attempt açma kuralı:** CANDIDATE'ın `userId`'si, ilgili Test'i içeren herhangi bir TestPackage için `Purchase` (status `PAID`) sahibi olmalı.
- **Tek aktif attempt:** Aynı kullanıcı aynı Test'te aynı anda tek `IN_PROGRESS`.
- **Süre kuralı:** `startedAt + durationMinutes < now()` iken submit yoksa `EXPIRED`, skor cevaplardan hesaplanır.

### Purchase

CANDIDATE ↔ TestPackage satın alma ilişkisi, ödeme kaydı. **Tekil Test ile bağlantısı yoktur.**

- `id, userId, testPackageId, paidAt, amount, paymentProvider, providerRef, status (PENDING | PAID | FAILED | REFUNDED), refundedAt (nullable), discountCodeId (nullable), discountAmount (nullable)`
- **Unique constraint:** `(userId, testPackageId)` — aynı paketi iki kez satın alamaz.
- Purchase + Payment kaydı **aynı transaction** içinde yazılır.

### AdminSettings

Admin panelinden yönetilen global ayarlar.

- Komisyon oranı, içerik limitleri (`maxQuestionsPerTest`, `maxTestsPerPackage`), **yedekleme zamanlayıcısı** (saat ve hedef dizin).
- Tek satır mantığı: upsert pattern.

### GradeLevel (Sınıf)

Admin yönetiminde kategori — **ExamType (Sınav Türü) ile aynı desen**. Eğitici içerik oluştururken seçer (çoktan seçmeli), aday filtreler. Seçilmezse **"Genel"** (seed: `slug='genel'`).

- `id, name, description?, metadata (Json — logo: metadata.icon lucide key), slug (unique), active, createdAt, updatedAt`. Tablo: `grade_levels`.
- **Bağlanan modeller (`gradeLevelId String?`, onDelete SetNull):** `ExamTest` (relation), `Tunnel` (relation + `@@index`), `WrittenPackage` (**SCALAR** — written modülü deseni, relation YOK; ad `resolveGradeLevels` ile çözülür).
- **Admin CRUD:** `/admin/grade-levels` (List/Create/Toggle/Delete) — `GradeLevelUseCases.ts` (self-contained, prisma direct + best-effort audit). Public liste: `GET /site/grade-levels`. Audit: `GRADELEVEL_CREATED/UPDATED/DELETED`. "Genel" silinemez (`GRADELEVEL_DEFAULT_PROTECTED`).
- **Create defaulting:** Test/Tunnel/Written create use-case'leri seçilmezse `slug='genel'` id'sine düşer (ExamType "diger" deseni).
- **Filtre:** Marketplace paket listesi/detay (`gradeLevelId/gradeLevelName`, test'ten türetilir), Tunnel listesi (`gradeLevelName`), Written paket listesi/detay + my-purchases. Frontend: Explore + MyTests (test sekmesi id-bazlı; TunnelGrid/WrittenPackageGrid isim-bazlı client-side), Home "Sınıflar" bandı (Sınav Türleri altında). Admin: ContentManagement 3. sekme (`ManageGradeLevels`).
- **dalClient:** `entities.GradeLevel` (filter/list/create/update/delete). Logo havuzu ExamType ile ortak (`examTypeIcons.js`).

### BackupLog

DB yedekleme audit log.

- `id, scheduledAt, executedAt, durationMs, sizeBytes, status (SUCCESS | FAILED), targetPath, error (nullable)`
- `BackupSchedulerService` cron olarak çalışır, `pg_dump` → gzip. Son 2 gün saklanır.

### DiscountCode

EDUCATOR veya ADMIN'in oluşturduğu indirim kodu. **TestPackage üzerine uygulanır (aday akışı).**

- `id, code, createdById (nullable), percentOff, validFrom, validUntil, maxUses, usedCount, isActive, description`
- **Kapsam (`createdById` ile belirlenir):**
  - **Eğitici kodu** → `createdById = educatorId`: yalnızca o eğiticinin paketlerinde geçerli. Sahiplik kuralı `createdById === TestPackage.educatorId`. %50 üst sınır.
  - **Admin kodu → GLOBAL** → `createdById = null`: **herhangi bir teste/pakete** uygulanır, hiçbir eğiticiye bağlı değil ("herhangi bir teste bağlanır, eğiticiye bağlanmaz"). Admin 1-100 girebilir (üst sınır yok).
  - `PurchaseUseCase` eşleşmesi: `OR: [{ createdById: test.educatorId }, { createdById: null }]`. `ValidateDiscountCodeUseCase` bununla **birebir hizalı** (null → her pakette kabul; başka eğiticinin kodu → `DISCOUNT_NOT_OWNED`).
- **Çapraz benzersizlik:** Aynı kod string'i `DiscountCode` VE `PlatformPromoCode` tablolarında **aynı anda olamaz**. Her iki create akışı diğer tabloyu kontrol eder (`CODE_EXISTS_AS_PROMO` / `CODE_EXISTS_AS_DISCOUNT`, 409) — aday indirim kodu ile eğitici canlı-test/reklam promo kodu çakışmaz.
- Doğrulama: `ValidateDiscountCodeUseCase` aday "Uygula" tıklayınca kodu doğrular (aktiflik, tarih, usage limit, kapsam).
- usedCount artırma: ayrı endpoint DEĞİL; asıl `PurchaseUseCase` transaction'ı içinde race-safe (`updateMany ... lt: maxUses` + `Purchase.discountCodeId/discountAmount` snapshot). Yarış kontrolünden çıkmaz.
- Hata kodları: `DISCOUNT_NOT_FOUND/NOT_ACTIVE/NOT_OWNED/OUT_OF_WINDOW/USAGE_EXHAUSTED`.

### PlatformPromoCode (Sprint 15 — admin → eğitici)

**`DiscountCode`'tan AYRI bir model.** Admin tarafından oluşturulur, eğitici LiveSession (canlı test) veya AdPackage (reklam) satın alırken kullanır.

- `id, code, description, percentOff (1-100), scopes: PlatformPromoScope[] ('LIVE_SESSION' | 'AD_PACKAGE'), maxUses, usedCount, validFrom, validUntil, isActive, createdById`
- `PlatformPromoCodeUsage` ayrı tablo: `@@unique([promoCodeId, purchaseId])` — her satın alma için tek kullanım satırı.
- `LiveSession` + `AdPurchase` modellerinde 3 snapshot kolonu (`paidCents`, `platformPromoCodeId`, `platformPromoDiscountCents`) — TKHK + audit kanıt zinciri (kod silinse bile raporlama bozulmaz).
- Doğrulama: `ValidatePlatformPromoCodeUseCase` (`POST /platform-promo-codes/validate`, EDUCATOR rolü). Scope mismatch → `PROMO_SCOPE_MISMATCH`.
- usedCount artırma: `PayLiveSessionUseCase` veya `PurchaseAdUseCase` transaction'ı içinde atomik (`updateMany ... lt: maxUses`).
- Admin CRUD: `/admin/platform-promo-codes` (List/Create/Toggle/Delete). 5 use case `application/use-cases/platform-promo/` altında.

### AdPackage / AdPurchase

Reklam paketi ve satın alma kaydı. **TestPackage Purchase'ından ayrı bir akış.**

- `AdPackage: id, title, durationDays, price, slot (homepage_top, sidebar, vb.)`
- `AdPurchase: id, adPackageId, educatorId, testPackageId (reklamı yapılan paket), startsAt, endsAt, paidAt, status`
- Yayında olan reklamları gösterirken `now() between startsAt and endsAt`.

### Email Trafiği — EmailLog, EmailEvent, EmailProviderConfig, EmailTemplate, SuppressedEmail

Tüm giden mailler izlenir, kuyruklara ayrılır ve admin kontrolünde tutulur. Detay için `email-traffic` skill'i.

- **EmailProviderConfig** — Brevo API veya kurumsal SMTP yapılandırması. Secret'lar AES-256-GCM ile şifreli (`encryptedSecrets`). Çoklu sağlayıcı + priority sıralı fallback.
- **EmailTemplate** — Handlebars şablon kaydı: `key, version, subject, htmlPath, textPath, defaultQueue`. Dosyalar `apps/backend/src/infrastructure/email/templates/` altında.
- **EmailLog** — Her gönderim girişimi tek satır. `templateKey, queue, status, recipientUserId, providerMessageId, htmlBody, ...`. 90 gün sonra body alanları cron tarafından null'lanır (KVKK).
- **EmailEvent** — Tek log'a bağlı 1-N olay (QUEUED → SENDING → SENT → DELIVERED veya BOUNCED). Brevo webhook'undan beslenir.
- **SuppressedEmail** — Hard bounce / spam complaint / 3× soft bounce sonrası otomatik suppression list. Worker gönderimden önce kontrol eder.

**Kuyruk anlamları:** `CRITICAL` (şifre/ödeme/iade — kullanıcı preference'ı override) / `NOTIFY` (bildirim) / `BULK` (kampanya, digest).

**User alanları:** `emailPreferences` (Json, 7 kategori toggle) + `emailUnsubscribeToken` (unique).

**AdminSettings — kill switch grid:** Rol (Eğitici / Aday / Staff) × Kuyruk (Kritik / Bildirim / Toplu) 9 ayrı bool + global `emailEnabled`. Admin paneli `/yonetim/mail/kontrol`.

### Contract — Yasal Sözleşmeler (Sprint 14)

Kayıt + satın alma + eğitici onboarding akışlarında yasal sözleşme kabulü zorunludur.

- **Contract:** `id, type, version, title, content (markdown), isActive, publishedAt, createdAt, updatedAt`
  - `type`: 4 değer — `CANDIDATE` (üyelik), `EDUCATOR` (eğitici hizmet sözleşmesi), `PRIVACY` (KVKK aydınlatma), `DISTANCE_SALE` (mesafeli satış + ön bilgilendirme)
  - `@@unique([type, version])` — her tip için tek aktif version. Yeni versiyon yayımlanınca eski `isActive=false`.
- **ContractAcceptance:** `id, userId, contractId, acceptedAt, ip, userAgent` — delil zinciri. `@@unique([userId, contractId])` idempotent kabul.
- **Purchase.distanceSale\*** alanları (denormalized snapshot): `distanceSaleContractId`, `distanceSaleAcceptedAt`, `distanceSaleAcceptedIp`, `distanceSaleAcceptedUserAgent` — TKHK m.48 kanıt zinciri her satın alma satırında kendi içinde.

**Tetikleme noktaları (uygulama katmanı zorlar):**

| Akış | Zorunlu sözleşmeler |
|---|---|
| `RegisterUseCase` (aday kayıt) | CANDIDATE + PRIVACY |
| `RegisterEducatorUseCase` (eğitici kayıt) | EDUCATOR + PRIVACY |
| `PurchaseUseCase` (her satın alma) | DISTANCE_SALE — her purchase için yeni snapshot |

**Seed:** `SeedService.seedLegalContracts()` her boot'ta `docs/legal/*.md` dosyalarından idempotent upsert eder. Production metinleri avukat onaylı versiyonla değiştirilir; seed sadece "boş veritabanı / ilk kurulum" güvencesi.

**Public sayfa:** `/sozlesmeler/:slug` (4 slug: `uyelik`, `kvkk`, `mesafeli-satis`, `egitici-hizmet`) — herkese açık, markdown render. Footer'a link.

### LiveSession — Canlı Sınav Oturumu

Gerçek zamanlı toplu sınav özelliği. **6 Prisma modeli:**

- **LiveSessionTier** — Admin tarafından tanımlanan kapasite/fiyat şablonu. `label, minParticipants, maxParticipants, priceCents, isActive, order`.
- **LiveSession** — Educator'ın oluşturduğu oturum. `id, educatorId, tierId, title, joinCode (unique), status (DRAFT|ACTIVE|ENDED), currentQuestionIdx, showStats, paidAt, startedAt, endedAt, roundNumber, parentSessionId`.
- **LiveQuestion** — Oturuma ait soru. `id, sessionId, content, mediaUrl, order` (1-tabanlı).
- **LiveOption** — Soru seçeneği. `id, questionId, content, isCorrect, order`.
- **LiveParticipant** — Katılımcı kaydı. `id, sessionId, userId, joinedAt, lastSeenAt`. `@@unique([sessionId, userId])`.
- **LiveAnswer** — Katılımcı cevabı. `id, sessionId, questionId, participantId, optionId`. `@@unique([questionId, participantId])`.

**Akış:** Admin tier oluşturur → Educator oturum yazar (DRAFT), ödeme yapar (paidAt set), başlatır (ACTIVE) → Candidate joinCode ile katılır → Educator soruları ilerletir (`currentQuestionIdx`, 0-tabanlı; `question.order` 1-tabanlı) → Educator oturumu bitirir (ENDED).

**Real-time:** HTTP polling (2s) + heartbeat ping (15s). WebSocket yok.

**Round 2:** `parentSessionId` ile önceki oturuma bağlı yeni oturum açılabilir; sadece önceki oturumda yanlış yapan katılımcılar dahil edilir.

**Frontend sayfaları:** `LiveSessionCreate`, `LiveSessionHost`, `LiveSessionJoin`, `ManageLiveTiers`.

**Use-case domain:** `application/use-cases/live/` (18 use case).

### Tunnel — Tünel (Adaptif Ustalık Öğrenme)

Gamified ustalık-öğrenme modülü. Eğitici **katmanlı** (kolaydan zora) bir tünel oluşturur; aday satın alıp **adaptif** çözer — her soru aynı anda **5 seçenekle** (1 doğru + 4 rastgele çeldirici) gelir, doğru şık **her zaman içindedir** ama yeri değişir. Bir soru **3 farklı pozisyonda** doğru cevaplanınca "öğrenildi". Tüm katmanlar öğrenilince tünel biter. **TestPackage'dan tamamen ayrı bir satış+çözme akışıdır.**

**9 Prisma modeli:**

- **Tunnel** — `id, tenantId, educatorId, examTypeId?, topicId?, title, description?, coverImageUrl?, priceCents, currency, layerCount, optionsPerQuestion, advanceStreak, status (TunnelStatus: DRAFT|PENDING_APPROVAL|PUBLISHED|REJECTED), reviewNote?, reviewedById?, submittedAt?, reviewedAt?, publishedAt?`. `layerCount/optionsPerQuestion/advanceStreak` **oluşturma anında AdminSettings'ten snapshot** (admin sonradan değiştirse mevcut tünel bozulmaz — TestPackage snapshot deseni).
- **TunnelLayer** — `tunnelId, index` (1-tabanlı, 1 = en kolay). `@@unique([tunnelId, index])`.
- **TunnelQuestion** — `tunnelId (denormalize), layerId, content, mediaUrl?, order`.
- **TunnelOption** — `questionId, content, mediaUrl?, isCorrect, order`. Her soruda **tam 1 doğru**; `order` kanonik sıradır, aday sunumunda karıştırılır (pozisyon ustalığı için).
- **TunnelPurchase** — `tenantId, tunnelId, candidateId, amountCents, status (PurchaseStatus), discountCodeId?/discountAmountCents? (snapshot), distanceSale* (TKHK kanıt zinciri), refundedAt?`. `@@unique([candidateId, tunnelId])`. **`Purchase.testId` zorunlu olduğu için ayrı model** — TestPackage Purchase'ından bağımsız.
- **TunnelAttempt** — adaptif ilerleme. `baseLayer` (en alttaki tam-öğrenilmemiş katman), `upperOpen` (baseLayer+1 görünür mü), `streakCount` (tabanda üst üste doğru), `current{QuestionId,CorrectPosition,OrderJson}` (resume aynı sunumu göstersin), `status (TunnelAttemptStatus: IN_PROGRESS|COMPLETED)`. `@@unique([candidateId, tunnelId])` — aday+tünel başına tek attempt.
- **TunnelQuestionProgress** — soru bazlı pozisyon ustalığı. `correctMask` (doğru cevaplanan pozisyonların bitmask'i), `mastered`. Ustalık **monoton** (bit silinmez). `@@unique([attemptId, questionId])`.
- **TunnelReview** — aday değerlendirmesi (`rating 1-5, comment?`). `@@unique([tunnelId, candidateId])` (upsert). **Yalnız aktif satın alan** yazabilir; ortalama kart/detayda gösterilir.
- **TunnelQuestionReport** — aday çözüm sırasında soru hata bildirimi (`questionId?, reason, status OPEN|RESOLVED`). Hafif, scalar-only.

**Adaptif motor (`engine.ts` — saf, prisma'sız):**
- `WINDOW_SIZE = 5` (gösterilen seçenek), `REQUIRED_CORRECT = 3` (ustalık için farklı pozisyon).
- Görünür pencere: `{baseLayer}` ∪ (`{baseLayer+1}` eğer `upperOpen`). Maks 2 katman.
- Tabanda `advanceStreak` kez üst üste doğru → üst katman açılır. Taban sorusuna **yanlış** → üst kapanır + streak sıfır (gerileme). Üst katman yanlış → gerileme yok.
- Bir soru `REQUIRED_CORRECT` farklı pozisyonda doğru → `mastered`. Taban katmanın tüm soruları öğrenilince taban bir üste kayar; tüm katmanlar bitince tünel `COMPLETED`.
- Arka arkaya aynı soruyu sormaz (`excludeQuestionId`); görünürde tek o soru kaldıysa başka katmandan dolgu.

**Akış:** Admin AdminSettings'te tünel parametrelerini ayarlar → Eğitici tünel + katman + soru yazar (DRAFT), onaya gönderir (PENDING_APPROVAL) → Admin onaylar (PUBLISHED) / reddeder (REJECTED + not) → Aday keşfeder, satın alır (indirim kodu + mesafeli satış sözleşmesi), çözer (adaptif), değerlendirir → ilerleme raporu.

**İş kuralları (özet):**
- Yalnız **sahibi** ve yalnız **DRAFT/REJECTED** durumunda meta düzenlenebilir (Update); katman/snapshot değişmez. Soru kaydetme (Save) yalnız yayınlanmamışta.
- Onaya gönderme: her katmanda `minQuestionsPerLayer..maxQuestionsPerLayer` arası soru (AdminSettings).
- Satın alma: CANDIDATE alır, eğitici kendi tünelini alamaz (`OWN_TUNNEL`), aday tekrar alamaz (idempotent → mevcut döner), `usedCount` race-safe artırma + snapshot. Ücretsiz tünel provider'sız.
- İndirim kodu: eğitici kodu %50 clamp, global admin kodu (createdById=null) clamp yok — `ValidateTunnelDiscountUseCase` ↔ `PurchaseTunnelUseCase` birebir hizalı.
- Çözme/değerlendirme/rapor/hata bildirimi: **aktif satın alma** şart (`TUNNEL_NOT_PURCHASED`).

**Use-case domain:** `application/use-cases/tunnel/` (Create/Update/Save/Submit/Approve/Reject, List/Get, Purchase/ValidateDiscount, Start/SubmitAnswer/GetState, Review×3, Reports, Report, engine + tunnelPlay).
**Frontend sayfaları:** `Explore`/`MyTests` (Tüneller sekmesi — `TunnelGrid`), `TunnelDetail`, `TakeTunnel`, `MyResults` (rapor), eğitici `CreateTunnel`/`EditTunnel`, admin onay. dalClient: `candidateTunnels` namespace.
**Anti-kopya:** `TakeTunnel` normal sınavla aynı koruma — metin kopyalama/screenshot engeli + `TestWatermark` + bej okuma modu.

### WrittenTest — Yazılı Test (Açık Uçlu, Öz-Değerlendirmeli)

Mevcut Sınav modülünün **şıksız** versiyonu. Aday her soruya **METİN** cevap yazar; **doğru/yanlış puanlama YOK**; **çözüm zorunlu**; aday teslim sonrası kendi cevabını çözümle **kendisi kıyaslar** (öz-değerlendirme). **TestPackage'dan tamamen AYRI modül** (Tünel deseni). Paylaşılan UI bileşenleri import edilerek reuse (TestWatermark, QuestionCanvas, ReportQuestionModal, PaymentModal, ResponsiveImage).

**8 Prisma modeli** (`written_*` tabloları; modül-dışı id'ler tenantId/educatorId/candidateId/examTypeId/topicId **SCALAR** — User/Tenant/ExamType/Topic'e relation YOK):
- **WrittenPackage** — satılabilir birim (TestPackage deseni): `title, description, coverImageUrl, priceCents, currency, difficulty, isActive, publishedAt`. Yayın = `publishedAt != null && isActive`.
- **WrittenTest** — paket içi test: `packageId, title, isTimed, duration, questionCount, hasSolutions(=true), status (TestStatus), publishedAt`.
- **WrittenQuestion** — **ŞIK YOK**: `testId, content, mediaUrl?, order, solutionText?, solutionMediaUrl?`. `solutionText`/`solutionMediaUrl` **use-case'te zorunlu** (SOLUTION_REQUIRED) — schema'da nullable (taslak esnekliği).
- **WrittenAttempt** — çözme oturumu: `testId, candidateId, attemptNumber, status (AttemptStatus), timing alanları, questionsSnapshot`. **`score` ALANI YOK** (puanlama yapılmaz).
- **WrittenAnswer** — `attemptId, questionId, textAnswer?, drawingUrl?`. `@@unique([attemptId, questionId])`. (selectedOptionId/isCorrect YOK.) **Kalem çizimi cevaba dahil**: aday kalemle çizerse canvas PNG olarak `/upload/image`'a yüklenir, `drawingUrl` cevapla saklanır, teslim sonrası öz-kıyasta gösterilir.
- **WrittenPurchase** — `@@unique([candidateId, packageId])`. İndirim snapshot (%50 eğitici clamp) + mesafeli satış (TKHK) + `testsSnapshot` (ŞIKSIZ).
- **WrittenReview** — `@@unique([packageId, candidateId])` (scalar-only).
- **WrittenQuestionReport** — hata bildirimi (scalar-only); MyObjections'a 3. kaynak olarak merge edilir ("Yazılı:" etiketi).

**Akış:** Eğitici paket+test+soru (çözüm zorunlu) oluşturur → yayımlar (publish validation: ≥1 test, her test ≥1 soru, her soru çözümlü). Aday **Keşfet/Satın Alınanlar'da 3. sekme "Yazılı Testler"** → satın alır → metinle çözer (süre/kalem/tema/watermark/çözümü gör/hata bildirimi) → teslim eder → **cevap ↔ çözüm öz-kıyas** (puan yok). Yayımlı pakette yapı kilidi (PACKAGE_PUBLISHED).

**Use-case domain:** `application/use-cases/written/` (WrittenPackage/Test/Question CRUD+publish; Purchase+ValidateDiscount; Attempt: Start/SubmitAnswer/GetState/Submit/Timeout/GetSolution; Report; ListMyWrittenQuestionReports; Candidate liste/detay/my-packages).
**Controller:** eğitici `written-tests.controller` (`/written-packages`, `/written-tests`); aday `candidate-written.controller` (`/candidate-written/*`).
**Frontend:** `CreateWrittenTest`/`EditWrittenTest`/`ManageWrittenTests` (eğitici), `WrittenTestDetail`/`TakeWrittenTest` (aday), `WrittenPackageGrid` (Explore+MyTests 3. sekme), `MyResults` yazılı sekmesi. dalClient: `writtenTests` (eğitici) + `candidateWritten` (aday) namespace.
**Önemli fark:** Tünel adaptif/şıklı; Yazılı şıksız/metin/öz-değerlendirme. İkisi de TestPackage'dan ayrı.

## İş Kuralları

**Yayımlama**
- Test yayımlanabilsin: en az 1 soru, title var.
- TestPackage yayımlanabilsin: en az 1 yayımlanmış Test, `price >= 0`, title var.
- Yayımlanmış paketin testleri ve testlerin soruları **değiştirilemez** (cevap anahtarı garantisi). Meta (başlık/açıklama) değişebilir.
- Paket unpublish edilebilir: yeni satışı durdurur, mevcut Purchase ve Attempt korunur.

**Satın alma (TestPackage Purchase)**
- **CANDIDATE** satın alır. EDUCATOR ve ADMIN paket satın almaz.
- EDUCATOR kendi yarattığı paketi satın alamaz (`testPackage.educatorId !== userId` kontrolü).
- Aynı CANDIDATE aynı paketi ikinci kez satın alamaz (DB unique constraint).
- Purchase + Payment kaydı **aynı `prisma.$transaction`** içinde.
- DiscountCode kullanılıyorsa: `discountCodeId` + `discountAmount` Purchase'a yazılır, DiscountCode'un `usageCount` artar.
- Ücretsiz paket (`price = 0`): yine Purchase kaydı oluşur (yetki kontrolü için), ama provider çağrısı atlanır.

**Test çözme (Attempt)**
- CANDIDATE bir Test için Attempt açabilir IFF: o Test'i içeren herhangi bir TestPackage için `PAID` Purchase'ı var.
- Attempt başladıktan sonra soru listesi dondurulur (paket yayımdaysa zaten değişmez).
- Submit'te: her cevabın `isCorrect` hesapla, `score = correctCount / totalQuestions` veya puan toplamı.
- Süre dolduğunda otomatik `EXPIRED`, skor son cevaplarla hesaplanır.

**Yedekleme**
- AdminSettings'te ayarlanan saatte cron tetiklenir.
- `pg_dump` → gzip → hedef dizin.
- BackupLog tablosuna sonuç + hata yazılır.
- Son 2 gün dışındakiler silinir.

**Rol izinleri**

| Aksiyon | CANDIDATE | EDUCATOR | ADMIN |
|---------|-----------|----------|-------|
| Paket listele | ✓ | ✓ | ✓ |
| Test oluştur | - | ✓ | ✓ |
| TestPackage oluştur | - | ✓ | ✓ |
| Kendi paketini düzenle | - | ✓ | ✓ |
| Başkasının paketini düzenle | - | - | ✓ |
| **TestPackage satın al** | **✓** | **-** | **-** |
| Pakette test çöz | ✓ (paket satın almışsa) | - | - |
| DiscountCode yarat (kendi paketi için) | - | ✓ | ✓ |
| PlatformPromoCode (LIVE/AD) yarat | - | - | ✓ |
| PlatformPromoCode uygula (satın alırken) | - | ✓ | - |
| Skor görüntüle | kendi | kendi yazdığı paketler + kendi çözdüğü | tüm |
| AdPackage satın al (reklam) | - | ✓ | ✓ |
| Tünel oluştur/düzenle/onaya gönder | - | ✓ (kendi) | ✓ |
| Tünel onayla/reddet | - | - | ✓ |
| Tünel satın al + çöz + değerlendir | ✓ | - | - |
| AdminSettings | - | - | ✓ |
| BackupLog | - | - | ✓ |

## Kenar Durumlar

- **Attempt sürdürürken paket unpublish edildi** → mevcut attempt etkilenmez (Purchase ve Attempt korunur), yeni attempt açılamaz.
- **Süre dolduğunda client offline** → server-side `EXPIRED` transition (cron veya lazy check kullanıcı dönünce).
- **Ödeme iade** → Purchase silinmez, `status = REFUNDED` + `refundedAt`. Geçmiş Attempt'lere dokunma — skor kalır. CANDIDATE iade sonrası paketteki testleri **yeni attempt açarak çözemez** (Purchase status `PAID` değil).
- **EDUCATOR silindi** → paketleri ortada kalmasın: `archived` flag veya `anonymous-educator` placeholder. Mevcut Purchase'lar etkilenmez.
- **Soru sonradan yanlış bulundu** → yayımlanmışta düzeltme yasak. Yeni versiyon (yeni Test, yeni paket) yarat. Eski attempt'lere dokunma.
- **DiscountCode expired ama checkout açıkken CANDIDATE submit etti** → backend doğrulamasında reddet, frontend'e taze hata göster.
- **AdPurchase zaman aşımı** → cron veya lazy check ile aktif reklam kümesinden çıkar.

## Türkçe-İngilizce Haritası

Kod İngilizce, UI Türkçe. API yanıtları İngilizce alan adlı, frontend'de çevrilir.

| TR | EN | Alan/Tip |
|----|----|--------|
| Sınav | Exam Test | `ExamTest` / `examTest` |
| Test paketi | Test package | `TestPackage` / `testPackage` |
| Soru | Question | `examQuestion` |
| Seçenek | Choice | `choice` |
| Deneme/Çözme | Attempt | `attempt` |
| Skor | Score | `score` |
| Satın alma | Purchase | `purchase` |
| Eğitici | Educator | `educator` (AUTHOR DEĞİL) |
| Aday | Candidate | `candidate` (STUDENT DEĞİL) |
| Yönetici | Admin | `admin` |
| Sınav türü | Exam type | `examType` |
| Sınıf (kademe) | Grade level | `gradeLevel` |
| İndirim kodu (eğitici→aday, paket) | Discount code | `discountCode` |
| Platform promo kodu (admin→eğitici, LIVE/AD) | Platform promo code | `platformPromoCode` |
| Reklam paketi | Ad package | `adPackage` |
| Yedek log | Backup log | `backupLog` |
| Yönetici ayarları | Admin settings | `adminSettings` |
| Canlı oturum | Live session | `liveSession` |
| Canlı soru | Live question | `liveQuestion` |
| Katılımcı | Participant | `liveParticipant` |
| Tünel | Tunnel | `tunnel` |
| Katman | Layer | `tunnelLayer` |
| Tünel satın alma | Tunnel purchase | `tunnelPurchase` |
| Tünel çözme | Tunnel attempt | `tunnelAttempt` |
| (Pozisyon) ustalık | Mastery (progress) | `tunnelQuestionProgress` |
| Tünel değerlendirme | Tunnel review | `tunnelReview` |

## Notlar

- Yeni varlık eklerken bu dosyayı güncelle. Domain bilgisinin tek kaynağı burası.
- Satın alma uçtan uca akışı için `purchase-flow` skill'i.
- Ödeme provider entegrasyonu için `payment-domain` skill'i.
- Schema değişikliği için `prisma-schema` + `migration-planner`.
- API eklerken `api-contract` + dalClient.js güncellemesi.
- Form yazarken `form-mutation`.
- Hata yönetimi `error-handling`.
- Eski yapıyı bozmamak için `backward-compatibility`.
- Mail trafiği (3 kuyruk + provider + kill switch + suppression) için `email-traffic` skill'i.
