// @ts-nocheck
import { Injectable, OnApplicationBootstrap, Inject } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import type { PrismaClient } from '@prisma/client';
import { getDefaultTenantId } from '../../common/tenant';

/** Demo giriş: eğitici educator@demo.com / aday aday@demo.com — şifre: demo123 */
const DEMO_PASSWORD_HASH = bcrypt.hashSync('demo123', 12);
/** Admin: mus.tulu@gmail.com — şifre: adminsinav */
const ADMIN_PASSWORD_HASH = bcrypt.hashSync('adminsinav', 12);

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  async onApplicationBootstrap() {
    try {
      if (process.env.NODE_ENV === 'production') {
        console.log('Seed skipped: production environment');
        return;
      }

      // Ensure default tenant exists
      const tenantId = getDefaultTenantId();
      await this.prisma.tenant.upsert({
        where: { id: tenantId },
        create: { id: tenantId, name: 'Default Tenant', slug: 'default' },
        update: {},
      });

      // AdminSettings
      try {
        await this.prisma.adminSettings.upsert({
          where: { id: 1 },
          create: { id: 1, commissionPercent: 20, vatPercent: 18, purchasesEnabled: true },
          update: {},
        });
      } catch (e) {
        console.warn('Seed: admin_settings upsert skipped:', (e as Error).message);
      }

      // CommissionRateHistory — başlangıç kaydı yoksa oluştur
      try {
        const historyCount = await this.prisma.commissionRateHistory.count();
        if (historyCount === 0) {
          const settings = await this.prisma.adminSettings.findFirst({ where: { id: 1 } });
          const initialRate = settings?.commissionPercent ?? 20;
          await this.prisma.commissionRateHistory.create({
            data: {
              commissionPercent: initialRate,
              effectiveFrom: new Date('2024-01-01T00:00:00.000Z'),
              note: 'Başlangıç komisyon oranı (sistem seed)',
            },
          });
          console.log(`Seed: CommissionRateHistory başlangıç kaydı oluşturuldu (%${initialRate})`);
        }
      } catch (e) {
        console.warn('Seed: commission_rate_history seed skipped:', (e as Error).message);
      }

      await this.seedDemoUsersAndData();
      await this.ensureTestQuestions();
    } catch (e) {
      console.error('Seed error', e);
    }
  }

  private async seedDemoUsersAndData() {
    // Admin her zaman güncellenir (şifre güncellemesi için)
    const tenantId = getDefaultTenantId();

    await this.prisma.user.upsert({
      where: { email: 'mus.tulu@gmail.com' },
      create: {
        email: 'mus.tulu@gmail.com',
        username: 'admin_mustulu',
        passwordHash: ADMIN_PASSWORD_HASH,
        role: 'ADMIN',
        status: 'ACTIVE',
        tenantId,
      },
      update: { passwordHash: ADMIN_PASSWORD_HASH },
    });
    console.log('Seed: Admin — mus.tulu@gmail.com (şifre: adminsinav)');

    const existing = await this.prisma.user.findFirst({
      where: { email: 'educator@demo.com' },
    });

    if (existing) {
      // Kullanıcılar var — ama test yoksa yine de oluştur
      const testCount = await this.prisma.examTest.count();
      if (testCount > 0) {
        console.log('Seed: demo users and data already exist');
        return;
      }
      console.log('Seed: demo users exist but no tests found, creating test data...');
      await this.createDemoTestData(existing.id);
      return;
    }

    console.log('Running DEV seed: demo users + test data...');

    // Sözleşme (eğitici kaydı için)
    const contract = await this.prisma.contract.upsert({
      where: { type_version: { type: 'EDUCATOR', version: 1 } },
      create: {
        type: 'EDUCATOR',
        version: 1,
        title: 'Eğitici Sözleşmesi',
        content: 'Demo eğitici sözleşmesi metni.',
        isActive: true,
        publishedAt: new Date(),
      },
      update: { isActive: true },
    });

    // Demo eğitici (onaylı)
    const educator = await this.prisma.user.upsert({
      where: { email: 'educator@demo.com' },
      create: {
        email: 'educator@demo.com',
        username: 'demo_egitici',
        passwordHash: DEMO_PASSWORD_HASH,
        role: 'EDUCATOR',
        status: 'ACTIVE',
        educatorApprovedAt: new Date(),
        tenantId,
      },
      update: {},
    });

    await this.prisma.contractAcceptance.upsert({
      where: { userId_contractId: { userId: educator.id, contractId: contract.id } },
      create: { userId: educator.id, contractId: contract.id },
      update: {},
    });

    // Demo aday
    await this.prisma.user.upsert({
      where: { email: 'aday@demo.com' },
      create: {
        email: 'aday@demo.com',
        username: 'demo_aday',
        passwordHash: DEMO_PASSWORD_HASH,
        role: 'CANDIDATE',
        status: 'ACTIVE',
        tenantId,
      },
      update: {},
    });

    await this.createDemoTestData(educator.id);

    console.log('Seed: Demo — eğitici: educator@demo.com / aday: aday@demo.com (şifre: demo123)');
  }

  private async createDemoTestData(educatorId: string) {
    const tenantId = getDefaultTenantId();

    // ExamType + Topic
    const examType = await this.prisma.examType.upsert({
      where: { slug: 'demo-tyt' },
      create: { name: 'Demo TYT', slug: 'demo-tyt', description: 'Deneme sınav türü', active: true },
      update: {},
    });
    let topic = await this.prisma.topic.findFirst({ where: { slug: 'matematik' } });
    if (!topic) {
      topic = await this.prisma.topic.create({
        data: {
          name: 'Matematik',
          slug: 'matematik',
          active: true,
          examTypes: { create: [{ examTypeId: examType.id }] },
        },
      });
    }

    // Demo test (yayında)
    const created = await this.prisma.examTest.create({
      data: {
        tenantId,
        title: 'Demo TYT Matematik Denemesi',
        educatorId,
        examTypeId: examType.id,
        topicId: topic.id,
        isTimed: true,
        duration: 45,
        priceCents: 1999,
        status: 'PUBLISHED',
        publishedAt: new Date(),
        questionCount: 5,
      },
    });
    for (let i = 1; i <= 5; i++) {
      await this.prisma.examQuestion.create({
        data: {
          testId: created.id,
          content: `${i}. Demo soru metni — doğru cevap B seçeneğidir.`,
          order: i,
          options: {
            create: [
              { content: 'A seçeneği', isCorrect: false },
              { content: 'B seçeneği', isCorrect: true },
              { content: 'C seçeneği', isCorrect: false },
              { content: 'D seçeneği', isCorrect: false },
            ],
          },
        },
      });
    }
    console.log('Seed: demo test created (5 soru)');
  }

  private async ensureTestQuestions() {
    const tests = await this.prisma.examTest.findMany({ include: { questions: true } });
    for (const t of tests) {
      if (!t.questions || t.questions.length === 0) {
        for (let i = 1; i <= 5; i++) {
          await this.prisma.examQuestion.create({
            data: {
              testId: t.id,
              content: `Seed Question ${i}`,
              order: i,
              options: {
                create: [
                  { content: 'Option A', isCorrect: false },
                  { content: 'Option B', isCorrect: true },
                ],
              },
            },
          });
        }
        console.log(`Seed: added questions for test ${t.id}`);
      }
    }
  }
}

