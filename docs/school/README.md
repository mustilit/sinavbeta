# E-Sınıf (B2B Okul Modülü)

E-Sınıf, okulların/kurumların **öğrenci–öğretmen–yönetici** hiyerarşisiyle kapalı devre
sınav/ödev yönettiği ayrı bir B2B dikeyidir. Marketplace (eğitici → aday satış) ile
**veri ve iş mantığı düzeyinde tamamen izoledir**.

> Mimari karar gerekçesi: [ADR-0008 — E-Sınıf B2B İzolasyonu](../adr/0008-esinif-b2b-isolation.md).
> Domain entity sözlüğü: `.claude/skills/exam-domain/SKILL.md` (E-Sınıf bölümü).

---

## Roller (junction'da taşınır)

Okul kullanıcısının `User.role` **her zaman `CANDIDATE`** kalır; gerçek yetki
`SchoolUser.schoolRole` ile taşınır:

| schoolRole | Yetki |
|---|---|
| `SCHOOL_ADMIN` | Okulun tamamı: kullanıcı/şube/seviye/sınıf/zümre/ders yönetimi, raporlar |
| `BRANCH_ADMIN` | Kendi şubesi kapsamı |
| `DEPT_HEAD` | Kendi zümresi: sınav havuzu + ödev + (zümre ödevlerini) puanlama |
| `TEACHER` | Kendi içerikleri: sınav/ödev oluşturma + kendi ödevlerini puanlama |
| `STUDENT` | Ödevlerim + serbest alıştırma (Keşfet) + sonuç/rapor |

- **Okul yöneticisi** gerçek e-posta + üretilen geçici şifreyle girer.
- **Öğretmen/öğrenci** otomatik kullanıcı adıyla girer: `KOD-S-0001` (öğrenci),
  `KOD-T-0001` (öğretmen) — `KOD` okul kodudur. Giriş `?context=school` ekranından,
  kullanıcı adı + geçici şifre ile (tanımlayıcıda `@` yoksa `findByUsername`).

---

## Kurulum akışı (operasyon)

1. **Platform Admin** akademik dönem + okul oluşturur (`/admin/schools` →
   `CreateSchoolUseCase`); okul koduyla (`ANK` vb.) okul yöneticisini atar.
2. **Okul Yöneticisi** giriş yapar (`/SchoolPanel`):
   - Şube → Seviye → Sınıf hiyerarşisini kurar (`/SchoolBranches`, tree).
   - Zümre + ders tanımlar (`/SchoolDepartments`, `/SchoolSubjects`).
   - Öğretmen/yönetici kullanıcıları ekler (`/SchoolUsers`); öğrencileri **sınıf
     sayfasından Excel ile toplu** ekler (`BulkCreateStudentsUseCase`). Üretilen
     geçici şifreler **tek sefer** gösterilir (`CredentialsDialog`).
3. **Öğretmen** sınav havuzunda sınav yazar (`/SchoolExamPool`, Test/Tünel/Yazılı),
   sınıfa/zümreye ödev atar (`/SchoolAssignments`).
4. **Öğrenci** girişte **Ödevlerim** açılır (`/StudentAssignments`); **Keşfet**'te
   (`/StudentExplore`) kendi seviyesindeki tüm sınavları **serbest alıştırma** olarak
   çözebilir. Çözme `/StudentSolve` (filigran + kalem çizimi + bej mod + Kaydet ve Çık).
5. **Öğretmen** yazılı teslimleri puanlar (`/SchoolGradeSubmission`); raporlar
   `/SchoolReports` + öğrenci `/StudentReports` (Test/Yazılı sekmeleri; varsayılan
   **çözülen soru sayısı**, tıklayınca başarım %).

---

## Backend

- **Use-case domain:** `apps/backend/src/application/use-cases/school/`
  (14 dosya · 89 use-case sınıfı: Org/User/Exam/Assignment/Grading/Report/Student/
  Practice/Live/Tunnel/Admin + helpers + snapshot + tunnelPlay).
- **Controller'lar:** `school*.controller.ts` + `admin.schools.controller.ts`
  (10 controller). JWT global guard; **okul rolü use-case içinde** doğrulanır
  (`schoolHelpers.resolveSchoolContext` + `requireSchoolRole`). İnce-taneli kontrol
  (örn. `DEPT_HEAD` yalnız kendi zümresi) use-case katmanındadır — route guard tek
  başına yeterli sayılmaz.
- **Prisma modelleri (17):** `School, Branch, SchoolLevel, Classroom, Department,
  SchoolSubject, AcademicPeriod, SchoolPeriod, SchoolUser, SchoolExam, SchoolQuestion,
  SchoolQuestionOption, SchoolAssignment, SchoolSubmission, SchoolSubmissionAnswer,
  SchoolTunnelAttempt, SchoolTunnelProgress`. Modül-dışı id'ler (tenantId/educatorId/
  examTypeId/topicId) **scalar** — marketplace modellerine relation yok.
- **Teslim-anı snapshot:** Sınav güncellemesi geçmiş sonuç/incelemeleri bozmaz
  (`questionsSnapshot` SUBMIT anında dondurulur; aktif çözmeler güncel versiyonu görür).
- **Serbest alıştırma:** `SchoolSubmission` genelleştirildi — `assignmentId` nullable +
  `examId` + `kind`; `@@unique([examId, studentId])`. Ödev puanlaması yeniden kullanılır;
  öğretmen raporları/Raporlarım yalnız `kind=ASSIGNMENT` sayar (alıştırma hariç).

### Audit (hassas işlemler)

Hassas okul işlemleri `AuditLog`'a yazılır (best-effort, `schoolHelpers.schoolAudit`):
`SCHOOL_CREATED`, `SCHOOL_USER_CREATED`, `SCHOOL_USERS_BULK_CREATED`,
`SCHOOL_USER_PASSWORD_RESET`, `SCHOOL_USER_ACTIVE_CHANGED`, `SCHOOL_SUBMISSION_GRADED`,
`SCHOOL_ORG_CREATED/DELETED`. Metadata `schoolId/schoolRole/module=E-SINIF` taşır.

---

## Frontend

- **Sayfalar (`apps/frontend/src/pages/`):** `SchoolPanel, SchoolUsers, SchoolBranches,
  SchoolDepartments, SchoolSubjects, SchoolExamPool, SchoolExamEdit, SchoolAssignments,
  SchoolAssignmentReport, SchoolGradeSubmission, SchoolReports, SchoolLive, SchoolLiveHost`
  (öğretmen/yönetici) + `StudentAssignments, StudentExplore, StudentSolve, StudentResult,
  StudentReports, StudentLive, StudentNotes` (öğrenci).
- **Bileşenler (`components/school/`):** SchoolExamQuestionsEditor, SchoolTunnelEditor,
  SchoolTunnelSolver, ReportCharts, StudentReportCharts, CredentialsDialog, PeriodSelect,
  studentImport. Paylaşılan UI reuse: TestWatermark, QuestionCanvas, NoteWidget,
  ResponsiveImage.
- **dalClient namespace'leri:** `studentAssignments`, `studentPractice`, `schoolTunnel`,
  `school*` (yönetim).
- **Yetki:** `routeRoles.js`'te okul sayfaları `[]` (giriş yapmış herkes); asıl yetki
  server-side (`resolveSchoolContext`) + sayfa içi (`ctx.schoolRole`) çift kontrol.

---

## ALTIN KURAL — marketplace'i bozma

E-Sınıf için **marketplace use-case/query/controller/sayfasını DEĞİŞTİRME.** Yeni kod
kendi `school/` katmanında yaşar. Marketplace, okul bağlamı (`user.school`) **yokken
byte-byte aynı** davranmalı. Tek paylaşılan dokunuş noktaları katı additive:
`auth/LoginUseCase` (username yolu), `auth.controller` (`/auth/me` → `school`),
`routeRoles.js`, `Sidebar.jsx`, `Login.jsx`, `schema.prisma` (nullable additive alanlar).

Detaylı checklist: `exam-domain` skill, "E-Sınıf — Marketplace İzolasyonu" bölümü.

---

## Test

- **Backend:** `apps/backend/tests/usecases/school/` (32 dosya, 575 test — branch
  testleri dahil).
- **Frontend:** `src/pages/__tests__/` + `components/school/__tests__/` (25 dosya,
  ~%97 sayfa kapsamı).
- **E2E:** `e2e/specs/school-persona.spec.ts` (persona giriş/erişim) +
  `e2e/specs/school-a11y.spec.ts` (axe WCAG 2.1 AA). Seed:
  `e2e/setup/seed-e2e.cjs seedSchoolModule()` (okul kodu `E2E` + 3 kullanıcı).
  Çalıştırma: `npm run test:e2e:seed && npx playwright test school-persona school-a11y`.

---

## Bilinen sınırlar / yol haritası

- **Pagination:** Liste sayfalarının çoğu client-side (`PAGE_SIZE`/`slice`). Büyük
  okullarda server-side cursor pagination'a taşınmalı (`pagination` skill).
- **i18n:** E-Sınıf sayfaları büyük ölçüde TR (B2B-TR için bilinçli); çok-dilli
  kurum ihtiyacında `t()` anahtarlarına taşınır.
- **Audit kapsamı:** Hassas işlemler kapsandı; ileride org güncelleme (rename) +
  atama (assign) işlemleri de eklenebilir.
