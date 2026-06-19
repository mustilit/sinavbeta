/**
 * seed-written-demo.cjs — 4 demo yazılı test paketi (her biri 5 yazılı, her yazılı 5 soru)
 * educator@demo.com eğiticisine kaydeder. Yayımlanmış + idempotent (başlıkla aranır).
 *
 * Çalıştırma (apps/backend cwd, DATABASE_URL erişilebilir host ile):
 *   DATABASE_URL=... node scripts/seed-written-demo.cjs
 */
const path = require('path');
const cwd = process.cwd();
const { PrismaClient } = require(path.join(cwd, 'node_modules', '@prisma', 'client'));
const prisma = new PrismaClient();

const PACKAGES = 4;
const TESTS_PER_PACKAGE = 5;
const QUESTIONS_PER_TEST = 5;

async function main() {
  const educator = await prisma.user.findFirst({
    where: { email: 'educator@demo.com' },
    select: { id: true, tenantId: true },
  });
  if (!educator) throw new Error('educator@demo.com bulunamadı');
  const { id: educatorId, tenantId } = educator;
  const now = new Date();

  for (let p = 1; p <= PACKAGES; p++) {
    const title = `Deneme Yazılı Paket ${p}`;
    const existing = await prisma.writtenPackage.findFirst({ where: { title, educatorId } });
    if (existing) {
      console.log(`  = ${title} zaten var (${existing.id}) — atlandı`);
      continue;
    }
    const pkg = await prisma.writtenPackage.create({
      data: {
        tenantId, educatorId, title,
        description: `${p}. deneme amaçlı açık uçlu yazılı test paketi (öz-değerlendirmeli).`,
        priceCents: 0, difficulty: 'medium', isActive: true, publishedAt: now,
      },
    });
    for (let ti = 1; ti <= TESTS_PER_PACKAGE; ti++) {
      const test = await prisma.writtenTest.create({
        data: {
          tenantId, packageId: pkg.id, educatorId,
          title: `Yazılı ${ti}`,
          isTimed: ti % 2 === 0, duration: ti % 2 === 0 ? 30 : null,
          questionCount: QUESTIONS_PER_TEST, hasSolutions: true,
          status: 'PUBLISHED', publishedAt: now,
        },
      });
      await prisma.writtenQuestion.createMany({
        data: Array.from({ length: QUESTIONS_PER_TEST }, (_, qi) => ({
          testId: test.id,
          content: `Paket ${p} · Yazılı ${ti} · Soru ${qi + 1}: Konuyu kendi cümlelerinizle açıklayın.`,
          order: qi,
          solutionText: `Örnek çözüm (P${p}-Y${ti}-S${qi + 1}): Anahtar noktalar açıkça ve gerekçeli yazılmalıdır.`,
        })),
      });
    }
    console.log(`  ✓ ${title} oluşturuldu (${pkg.id}) — ${TESTS_PER_PACKAGE} yazılı × ${QUESTIONS_PER_TEST} soru`);
  }
}

main()
  .then(async () => { await prisma.$disconnect(); console.log('Demo yazılı seed tamam.'); })
  .catch(async (e) => { console.error('Seed hata:', e.message); await prisma.$disconnect(); process.exit(1); });
