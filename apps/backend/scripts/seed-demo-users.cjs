/**
 * seed-demo-users.cjs — Manuel test için 1 eğitici + 1 aday oluşturur.
 *
 * Neden gerekli: prod modda (NODE_ENV=production) SeedService demo kullanıcıları
 * atlar ("skipped (production)"). Bu script SeedService.seedDemoUsersAndData ile
 * BİREBİR aynı kullanıcıları idempotent upsert eder.
 *
 * Çalıştırma (backend container içinde — prod DB yalnız docker ağından erişilir):
 *   docker cp apps/backend/scripts/seed-demo-users.cjs docker-backend-1:/tmp/seed-demo-users.cjs
 *   docker exec -w /usr/src/app docker-backend-1 node /tmp/seed-demo-users.cjs
 *
 * Kimlik bilgileri:
 *   Eğitici: educator@demo.com / demo123  (role EDUCATOR, onaylı)
 *   Aday:    aday@demo.com     / demo123  (role CANDIDATE)
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();
const PASSWORD_HASH = bcrypt.hashSync('demo123', 12);

async function main() {
  // tenantId bir FK — hardcode etmek yerine boot'ta oluşturulan gerçek tenant'ı
  // DB'den bul (tercihen slug='default'). Böylece FK ihlali olmaz.
  const tenant =
    (await prisma.tenant.findFirst({ where: { slug: 'default' } })) ||
    (await prisma.tenant.findFirst());
  if (!tenant) {
    throw new Error('Hiç Tenant kaydı yok — önce backend boot olup default tenant oluşturmalı.');
  }
  const tenantId = tenant.id;
  console.log('Kullanılan tenant:', tenantId, '(slug=' + tenant.slug + ')');
  const educator = await prisma.user.upsert({
    where: { email: 'educator@demo.com' },
    create: {
      email: 'educator@demo.com',
      username: 'demo_egitici',
      passwordHash: PASSWORD_HASH,
      role: 'EDUCATOR',
      status: 'ACTIVE',
      educatorApprovedAt: new Date(),
      tenantId,
    },
    // Var olan kayıtta şifre/role/status'u test edilebilir duruma getir.
    update: {
      passwordHash: PASSWORD_HASH,
      role: 'EDUCATOR',
      status: 'ACTIVE',
      educatorApprovedAt: new Date(),
    },
  });

  const candidate = await prisma.user.upsert({
    where: { email: 'aday@demo.com' },
    create: {
      email: 'aday@demo.com',
      username: 'demo_aday',
      passwordHash: PASSWORD_HASH,
      role: 'CANDIDATE',
      status: 'ACTIVE',
      tenantId,
    },
    update: {
      passwordHash: PASSWORD_HASH,
      role: 'CANDIDATE',
      status: 'ACTIVE',
    },
  });

  console.log('✓ Eğitici:', educator.email, '(' + educator.role + '/' + educator.status + ')', 'tenant=' + educator.tenantId);
  console.log('✓ Aday:   ', candidate.email, '(' + candidate.role + '/' + candidate.status + ')', 'tenant=' + candidate.tenantId);
  console.log('Şifre (her ikisi): demo123');
}

main()
  .catch((e) => { console.error('Seed hatası:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
