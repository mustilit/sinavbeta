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
  await prisma.$disconnect();
  if (ok < USERS.length) process.exit(1);
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
