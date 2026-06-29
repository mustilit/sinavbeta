/**
 * seed-e2e.cjs — E2E test kullanıcı havuzunu idempotent kurar (Sprint 17.1)
 *
 * Çalıştırma (backend cwd'sinden, Prisma client + bcryptjs orada):
 *   cd apps/backend && node ../frontend/e2e/setup/seed-e2e.cjs
 * veya frontend'den:
 *   npm run test:e2e:seed   (package.json script)
 *
 * Bu script users.ts ile SENKRON tutulmalı — yeni kullanıcı eklenince ikisine de.
 * (CJS node script TS import edemediği için liste burada tekrarlanır.)
 *
 * REJECTED status: Prisma client enum'u tanımıyor olabilir (Windows EPERM
 * regenerate engeli) → status raw SQL ile yazılır.
 */
// cwd backend olmalı (apps/backend) — Prisma client + bcryptjs orada.
// require, script konumundan değil cwd node_modules'tan çözülsün.
const path = require('path');
const cwd = process.cwd();
const { PrismaClient } = require(path.join(cwd, 'node_modules', '@prisma', 'client'));
const bcrypt = require(path.join(cwd, 'node_modules', 'bcryptjs'));

const prisma = new PrismaClient();
const PASSWORD_HASH = bcrypt.hashSync('demo123', 12);
const TENANT_ID = process.env.DEFAULT_TENANT_ID || 'dev-tenant';

// users.ts ALL_E2E_USERS ile birebir senkron
const USERS = [
  // admin@demo.com — backend SeedService bunu oluşturmuyor (yalnız mus.tulu@gmail.com).
  // auth.ts default ADMIN credential'ı bu; tüm admin e2e spec'leri buna bağlı.
  {
    email: 'admin@demo.com',
    username: 'demo_admin',
    role: 'ADMIN',
    status: 'ACTIVE',
  },
  {
    email: 'e2e_educator_pending@test.local',
    username: 'e2e_edu_pending',
    role: 'EDUCATOR',
    status: 'PENDING_EDUCATOR_APPROVAL',
    metadata: {
      cv_url: 'http://localhost:3000/uploads/e2e-cv.pdf',
      specialized_exam_types: [],
      education_info: 'E2E Üniversitesi',
      bio: 'Onay bekleyen e2e eğitici',
    },
  },
  {
    email: 'e2e_educator_rejected@test.local',
    username: 'e2e_edu_rejected',
    role: 'EDUCATOR',
    status: 'REJECTED',
    rejectionReason: 'CV bilgileri eksik (e2e test sebebi)',
    metadata: {
      cv_url: 'http://localhost:3000/uploads/e2e-cv.pdf',
      specialized_exam_types: [],
      education_info: 'E2E Üniversitesi',
      bio: 'Reddedilmiş e2e eğitici',
    },
  },
  {
    email: 'e2e_educator_fresh@test.local',
    username: 'e2e_edu_fresh',
    role: 'EDUCATOR',
    status: 'ACTIVE',
  },
  {
    email: 'e2e_candidate_fresh@test.local',
    username: 'e2e_cand_fresh',
    role: 'CANDIDATE',
    status: 'ACTIVE',
  },
  {
    email: 'e2e_worker_users@test.local',
    username: 'e2e_worker_users',
    role: 'WORKER',
    status: 'ACTIVE',
    workerPages: ['ManageUsers', 'AdminUserActivity'],
  },
  {
    email: 'e2e_worker_content@test.local',
    username: 'e2e_worker_content',
    role: 'WORKER',
    status: 'ACTIVE',
    workerPages: ['ContentManagement', 'ManageTests'],
  },
  {
    email: 'e2e_worker_finance@test.local',
    username: 'e2e_worker_finance',
    role: 'WORKER',
    status: 'ACTIVE',
    workerPages: ['AdminClaims', 'AdminRevenue', 'ManageRefunds'],
  },
  {
    email: 'e2e_worker_email@test.local',
    username: 'e2e_worker_email',
    role: 'WORKER',
    status: 'ACTIVE',
    workerPages: ['EmailManagement'],
  },
];

async function upsertUser(u) {
  // Prisma client REJECTED/yeni enum'u görmeyebilir (Windows EPERM). upsert dönüşü
  // row'u hydrate ettiği için REJECTED kullanıcıyı upsert ederken PATLAR.
  // Strateji: upsert HER ZAMAN ACTIVE okur/yazar (hydrate güvenli), gerçek
  // onboarding status'u sonradan raw SQL ile set edilir.
  const isOnboarding = u.status === 'REJECTED' || u.status === 'PENDING_EDUCATOR_APPROVAL';
  const upsertStatus = isOnboarding ? 'ACTIVE' : u.status;

  const user = await prisma.user.upsert({
    where: { email: u.email },
    create: {
      email: u.email,
      username: u.username,
      passwordHash: PASSWORD_HASH,
      role: u.role,
      status: upsertStatus,
      tenantId: TENANT_ID,
      ...(u.role === 'EDUCATOR' && u.status === 'ACTIVE' ? { educatorApprovedAt: new Date() } : {}),
      ...(u.metadata ? { metadata: u.metadata } : {}),
    },
    update: {
      passwordHash: PASSWORD_HASH,
      role: u.role,
      // Onboarding kullanıcılarda upsert dönüşü ACTIVE olsun (hydrate güvenli);
      // gerçek status aşağıda raw SQL ile. Aktiflerde olduğu gibi bırak.
      ...(isOnboarding ? { status: 'ACTIVE' } : {}),
      ...(u.metadata ? { metadata: u.metadata } : {}),
    },
  });

  // REJECTED status + rejectionReason raw SQL ile (enum bypass)
  if (u.status === 'REJECTED') {
    await prisma.$executeRaw`
      UPDATE users
      SET status = 'REJECTED'::"UserStatus",
          "rejectionReason" = ${u.rejectionReason ?? 'E2E test'},
          "rejectedAt" = COALESCE("rejectedAt", NOW()),
          "updatedAt" = NOW()
      WHERE id = ${user.id}
    `;
  } else if (u.status === 'PENDING_EDUCATOR_APPROVAL') {
    await prisma.$executeRaw`
      UPDATE users
      SET status = 'PENDING_EDUCATOR_APPROVAL'::"UserStatus",
          "rejectionReason" = NULL, "rejectedAt" = NULL, "updatedAt" = NOW()
      WHERE id = ${user.id}
    `;
  }

  // WORKER izin sayfaları
  if (u.role === 'WORKER' && Array.isArray(u.workerPages)) {
    await prisma.workerPermission.upsert({
      where: { userId: user.id },
      create: { userId: user.id, pages: u.workerPages },
      update: { pages: u.workerPages },
    });
  }

  return user;
}

/**
 * Yazılı Test modülü e2e seed — yayımlı bir WrittenPackage (demo educator) +
 * 1 test + 2 çözümlü soru + aday@demo.com için ACTIVE satın alma. Idempotent
 * (sabit başlıkla aranır). e2e written-test-flow.spec.ts buna bağlıdır.
 */
async function seedWrittenTestModule() {
  const TITLE = 'E2E Yazılı Test Paketi';
  const educator = await prisma.user.findFirst({ where: { email: 'educator@demo.com' }, select: { id: true, tenantId: true } });
  const aday = await prisma.user.findFirst({ where: { email: 'aday@demo.com' }, select: { id: true, tenantId: true } });
  if (!educator) { console.log('  ! yazılı seed atlandı (educator@demo.com yok)'); return; }
  const tenantId = educator.tenantId;

  let pkg = await prisma.writtenPackage.findFirst({ where: { title: TITLE, educatorId: educator.id } });
  if (!pkg) {
    pkg = await prisma.writtenPackage.create({
      data: {
        tenantId, educatorId: educator.id, title: TITLE,
        description: 'E2E için yayımlanmış açık uçlu test paketi.',
        priceCents: 0, difficulty: 'medium', isActive: true, publishedAt: new Date(),
      },
    });
    const test = await prisma.writtenTest.create({
      data: {
        tenantId, packageId: pkg.id, educatorId: educator.id, title: 'E2E Yazılı Test',
        isTimed: false, questionCount: 2, hasSolutions: true, status: 'PUBLISHED', publishedAt: new Date(),
      },
    });
    await prisma.writtenQuestion.createMany({
      data: [
        { testId: test.id, content: 'Fotosentezi kısaca açıklayın.', order: 0, solutionText: 'Bitkilerin ışık enerjisiyle CO2 ve sudan glikoz üretmesidir.' },
        { testId: test.id, content: 'Newton’un 1. yasasını yazın.', order: 1, solutionText: 'Bir cisim dengedeyse kuvvet etki etmedikçe durumunu korur (eylemsizlik).' },
      ],
    });
    console.log(`  ✓ yazılı paket oluşturuldu (${pkg.id})`);
  } else {
    console.log(`  ✓ yazılı paket mevcut (${pkg.id})`);
  }

  // aday için ACTIVE satın alma (idempotent) — çözme akışı seed'li gelsin
  if (aday) {
    const existing = await prisma.writtenPurchase.findUnique({
      where: { candidateId_packageId: { candidateId: aday.id, packageId: pkg.id } },
    }).catch(() => null);
    if (!existing) {
      await prisma.writtenPurchase.create({
        data: { tenantId, packageId: pkg.id, candidateId: aday.id, amountCents: 0, status: 'ACTIVE' },
      });
      console.log('  ✓ aday için yazılı satın alma oluşturuldu');
    }
  }
}

/**
 * E-Sınıf modülü e2e seed — bir okul (kod E2E) + akademik dönem + 3 okul kullanıcısı
 * (SCHOOL_ADMIN / TEACHER / STUDENT). Okul kullanıcıları User.role=CANDIDATE'tir;
 * giriş USERNAME ile yapılır (E2E-A-0001 / E2E-T-0001 / E2E-S-0001, şifre demo123).
 * Idempotent (okul kodu E2E ile aranır). school-persona.spec.ts buna bağlıdır.
 */
async function seedSchoolModule() {
  // 1) Akademik dönem (ada göre idempotent)
  let period = await prisma.academicPeriod.findFirst({ where: { name: 'E2E Dönem', tenantId: TENANT_ID } });
  if (!period) {
    period = await prisma.academicPeriod.create({
      data: { name: 'E2E Dönem', startDate: new Date('2026-09-01'), endDate: new Date('2027-06-30'), isActive: true, tenantId: TENANT_ID },
    });
  }
  // 2) Okul (kod E2E ile idempotent)
  let school = await prisma.school.findUnique({ where: { code: 'E2E' } });
  if (!school) {
    school = await prisma.school.create({
      data: { name: 'E2E Test Okulu', code: 'E2E', city: 'Ankara', schoolType: 'MIDDLE', periodId: period.id, maxUsers: 100, tenantId: TENANT_ID },
    });
  }
  // 3) Okul kullanıcıları — User (CANDIDATE, username login) + SchoolUser (gerçek rol)
  const members = [
    { username: 'E2E-A-0001', schoolRole: 'SCHOOL_ADMIN', firstName: 'Okul', lastName: 'Yöneticisi' },
    { username: 'E2E-T-0001', schoolRole: 'TEACHER', firstName: 'Test', lastName: 'Öğretmen' },
    { username: 'E2E-S-0001', schoolRole: 'STUDENT', firstName: 'Test', lastName: 'Öğrenci' },
  ];
  let adminUserId = null;
  for (const m of members) {
    const email = `${m.username.toLowerCase()}@esinif.local`;
    const user = await prisma.user.upsert({
      where: { email },
      create: { email, username: m.username, passwordHash: PASSWORD_HASH, role: 'CANDIDATE', status: 'ACTIVE', emailVerified: true, firstName: m.firstName, lastName: m.lastName, tenantId: TENANT_ID, metadata: { schoolUser: true } },
      update: { passwordHash: PASSWORD_HASH, username: m.username, status: 'ACTIVE', emailVerified: true },
    });
    await prisma.schoolUser.upsert({
      where: { username: m.username },
      create: { userId: user.id, schoolId: school.id, schoolRole: m.schoolRole, username: m.username, isActive: true },
      update: { userId: user.id, schoolId: school.id, schoolRole: m.schoolRole, isActive: true },
    });
    if (m.schoolRole === 'SCHOOL_ADMIN') adminUserId = user.id;
  }
  // 4) Okul yöneticisini School.adminUserId'ye bağla (one-to-one)
  if (adminUserId && school.adminUserId !== adminUserId) {
    await prisma.school.update({ where: { id: school.id }, data: { adminUserId } });
  }
  console.log(`  ✓ E-Sınıf okulu hazır (${school.id}) + 3 kullanıcı (E2E-A/T/S-0001)`);
}

(async () => {
  let ok = 0;
  for (const u of USERS) {
    try {
      await upsertUser(u);
      ok += 1;
      console.log(`  ✓ ${u.email} (${u.role}${u.status !== 'ACTIVE' ? '/' + u.status : ''})`);
    } catch (e) {
      console.error(`  ✗ ${u.email}: ${e.message}`);
    }
  }
  console.log(`Seed-e2e: ${ok}/${USERS.length} kullanıcı hazır.`);
  try { await seedWrittenTestModule(); } catch (e) { console.error(`  ✗ yazılı seed: ${e.message}`); }
  try { await seedSchoolModule(); } catch (e) { console.error(`  ✗ e-sınıf seed: ${e.message}`); }
  await prisma.$disconnect();
  if (ok < USERS.length) process.exit(1);
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
