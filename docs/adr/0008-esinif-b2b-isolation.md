# ADR-0008: E-Sınıf B2B Modülü — Marketplace'ten İzolasyon

## Statü

Accepted

## Bağlam

Marketplace (eğitici → aday satış) üzerine ikinci bir iş modeli eklendi: okulların
kapalı devre sınav/ödev yönettiği **E-Sınıf** B2B dikeyi. İki model aynı kod tabanında
yaşayacak. Riskler:

1. **Regresyon:** Okul özelliği marketplace use-case/query/controller'larını değiştirirse,
   kanıtlanmış (7 denetim turu geçmiş) satış akışı bozulur.
2. **Yetki modeli çakışması:** Marketplace `User.role` (CANDIDATE/EDUCATOR/ADMIN/WORKER)
   üzerine kurulu. Okul hiyerarşisi (yönetici/şube/zümre/öğretmen/öğrenci) bu enum'a
   sığmaz; `User.role`'a yeni değer eklemek tüm rol matrisini ve guard'ları etkiler.
3. **Veri sızıntısı:** Okul içeriği marketplace listelerine/aramalarına karışmamalı.
4. **Şema göçü riski:** Var olan milyonlarca marketplace satırı, okul için eklenen
   NOT NULL kolonlarla bozulmamalı.

## Karar

**E-Sınıf, marketplace'ten veri ve iş mantığı düzeyinde izole, additive bir modül olarak
inşa edilir.** Dört ilke:

1. **Junction'da rol:** Okul kullanıcısının `User.role` **her zaman `CANDIDATE`** kalır.
   Gerçek yetki ayrı `SchoolUser.schoolRole` (SCHOOL_ADMIN/BRANCH_ADMIN/DEPT_HEAD/
   TEACHER/STUDENT) ile taşınır. Marketplace rol matrisi ve guard'ları değişmez.

2. **Ayrı modeller + scalar modül-dışı id:** Okul modelleri (`School`, `SchoolUser`,
   `SchoolExam`, `SchoolSubmission`, …) marketplace modellerine **relation kurmaz**;
   modül-dışı id'ler (tenantId/examTypeId/topicId) **scalar** tutulur. Cross-modül
   sorgu yüzeyi yok → sızıntı yok.

3. **Yetki use-case katmanında:** JWT global guard kimliği doğrular; okul rolü
   **use-case içinde** `resolveSchoolContext` + `requireSchoolRole(...)` ile doğrulanır.
   İnce-taneli kontrol (örn. `DEPT_HEAD` yalnız kendi zümresi) route guard'a bırakılmaz.
   `routeRoles.js`'te okul sayfaları `[]` (giriş yapmış herkes); asıl kapı server-side +
   sayfa içi `ctx.schoolRole` çift kontrolüdür.

4. **Paylaşılan dokunuş noktaları katı additive:** Yalnız şu dosyalar okul-farkındalığı
   kazanır ve `user.school` yokken **byte-byte aynı** davranır:
   `auth/LoginUseCase` (tanımlayıcıda `@` yoksa `findByUsername`), `auth.controller`
   (`/auth/me` → `school` alanı, marketplace'te `null`), `routeRoles.js`, `Sidebar.jsx`,
   `Login.jsx` (`?context=school`), `schema.prisma` (yeni alanlar **nullable additive**,
   örn. `LiveSession.schoolId String?`).

## Sonuçlar

**Artılar:**
- Marketplace davranışı korunur (golden kural: okul bağlamı yokken aynı).
- Okul hiyerarşisi `User.role` enum'unu kirletmez; rol matrisi sade kalır.
- Şema göçleri nullable additive → mevcut satırlar bozulmaz.
- Modül kendi `school/` katmanında test edilir (575 backend testi, persona e2e).

**Eksiler / bedeller:**
- Bazı mantık (snapshot, indirim, çözme UI) iki yerde paralel yaşar; ortak UI bileşeni
  reuse ile (TestWatermark/QuestionCanvas/NoteWidget) tekrar azaltılır.
- Scalar modül-dışı id'ler referans bütünlüğünü DB FK yerine uygulama katmanında zorlar.
- Yetki use-case'te olduğundan, her yeni okul endpoint'i `requireSchoolRole` çağrısını
  atlamamaya dikkat etmeli (checklist: `exam-domain` skill).

## Alternatifler

- **`User.role`'a okul rolleri eklemek:** Reddedildi — marketplace rol matrisini,
  guard'ları ve 180+ permission-matrix testini etkiler; bir kullanıcı hem aday hem
  okul-öğrencisi olamaz varsayımını kırar.
- **Ayrı veritabanı/servis (mikroservis):** Reddedildi — tek geliştirici + tek deploy
  hedefi için operasyonel maliyet aşırı; ortak auth/tenant/altyapı tekrar yazılmalıydı.
- **Marketplace use-case'lerini parametreyle okul-moduna sokmak:** Reddedildi — regresyon
  yüzeyi çok büyük; "marketplace'i bozma" garantisi imkânsızlaşır.

## İlgili

- `docs/school/README.md` — operasyon + kurulum akışı.
- `.claude/skills/exam-domain/SKILL.md` — "E-Sınıf — Marketplace İzolasyonu" + checklist.
- [ADR-0003](./0003-multi-tenant-shared-db.md) — multi-tenant shared DB (tenantId deseni).
- [ADR-0004](./0004-jwt-stateless-auth.md) — JWT (username login eklentisi).
