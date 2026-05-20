---
name: exam-domain
description: Sinav Salonu domain modeli — Test/ExamTest, ExamQuestion, Attempt, User (CANDIDATE/EDUCATOR/ADMIN), TestPackage (satın alma birimi), Purchase, AdminSettings, BackupLog, DiscountCode, AdPackage. Yeni özellik veya veri modeli üzerinde çalışırken referans alın.
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

### BackupLog

DB yedekleme audit log.

- `id, scheduledAt, executedAt, durationMs, sizeBytes, status (SUCCESS | FAILED), targetPath, error (nullable)`
- `BackupSchedulerService` cron olarak çalışır, `pg_dump` → gzip. Son 2 gün saklanır.

### DiscountCode

EDUCATOR'ın oluşturduğu indirim kodu. **TestPackage üzerine uygulanır.**

- `id, code, educatorId, discountPercent, validFrom, validUntil, usageLimit, usageCount, testPackageId (opsiyonel — belirli pakete özel; null ise educator'ın tüm paketleri)`
- Doğrulama: aktif tarih aralığı + usage limit + (opsiyonel) paket eşleşmesi + paketi yaratan educator ile kod sahibi educator aynı mı.

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
| DiscountCode yarat | - | ✓ (kendi paketleri için) | ✓ |
| Skor görüntüle | kendi | kendi yazdığı paketler + kendi çözdüğü | tüm |
| AdPackage satın al (reklam) | - | ✓ | ✓ |
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
| İndirim kodu | Discount code | `discountCode` |
| Reklam paketi | Ad package | `adPackage` |
| Yedek log | Backup log | `backupLog` |
| Yönetici ayarları | Admin settings | `adminSettings` |
| Canlı oturum | Live session | `liveSession` |
| Canlı soru | Live question | `liveQuestion` |
| Katılımcı | Participant | `liveParticipant` |

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
