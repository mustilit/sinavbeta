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

    // Sınav türleri + konu hiyerarşisi + canlı oturum tier'ları her boot'ta
    // idempotent senkronize edilir
    await this.seedCommonExamTypes();
    await this.seedTopicHierarchy();
    await this.seedLiveSessionTiers();

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

  /**
   * Sınav türleri — `seed-data/exam-types.json` üzerinden idempotent upsert.
   * Slug eşleşmesi; mevcut kayıtlar bozulmaz.
   */
  private async seedCommonExamTypes() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const data = require('./seed-data/exam-types.json') as {
      examTypes: Array<{ slug: string; name: string; description?: string | null; active?: boolean }>;
    };
    const types = data.examTypes ?? [];
    for (const t of types) {
      await this.prisma.examType.upsert({
        where: { slug: t.slug },
        create: {
          slug: t.slug,
          name: t.name,
          description: t.description ?? null,
          active: t.active ?? true,
        },
        update: { name: t.name, description: t.description ?? null },
      });
    }
    console.log(`Seed: ${types.length} sınav türü hazır`);
  }

  /**
   * Soru konuları + topic_exam_types junction — idempotent.
   * `seed-data/topics.json` parentId NULLS FIRST sıralı (root → child).
   * Slug üzerinden upsert; parent referansları slug eşleştirmesiyle çözülür.
   */
  private async seedTopicHierarchy() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const data = require('./seed-data/topics.json') as {
      topics: Array<{
        id: string;
        name: string;
        slug: string;
        active: boolean;
        parentId: string | null;
        examTypeSlugs: string[];
      }>;
    };
    const topics = data.topics ?? [];
    if (!topics.length) return;

    // Eski-id → slug haritası (parentId'yi slug üzerinden çözmek için)
    const idToSlug = new Map(topics.map((t) => [t.id, t.slug]));

    // Aktif exam_type slug → id (junction için)
    const allExamTypes = await this.prisma.examType.findMany({ select: { id: true, slug: true } });
    const examTypeSlugToId = new Map(allExamTypes.map((e) => [e.slug, e.id]));

    let upsertCount = 0;
    let junctionCount = 0;
    for (const t of topics) {
      const parentSlug = t.parentId ? idToSlug.get(t.parentId) : null;
      const parent = parentSlug
        ? await this.prisma.topic.findFirst({ where: { slug: parentSlug }, select: { id: true } })
        : null;

      // Topic.slug Prisma şemasında @unique değil → findFirst + create/update
      const existing = await this.prisma.topic.findFirst({ where: { slug: t.slug } });
      const topic = existing
        ? await this.prisma.topic.update({
            where: { id: existing.id },
            data: { name: t.name, active: t.active, parentId: parent?.id ?? null },
          })
        : await this.prisma.topic.create({
            data: {
              name: t.name,
              slug: t.slug,
              active: t.active,
              parentId: parent?.id ?? null,
            },
          });
      upsertCount++;

      // exam type junction kayıtları (mevcut olmayanları ekle, fazlaları silme)
      const wantedExamTypeIds = (t.examTypeSlugs ?? [])
        .map((s) => examTypeSlugToId.get(s))
        .filter((id): id is string => Boolean(id));

      for (const examTypeId of wantedExamTypeIds) {
        try {
          await this.prisma.topicExamType.upsert({
            where: { topicId_examTypeId: { topicId: topic.id, examTypeId } },
            create: { topicId: topic.id, examTypeId },
            update: {},
          });
          junctionCount++;
        } catch {
          // composite key veya FK ihlali sessizce geç (zaten varsa OK)
        }
      }
    }
    console.log(`Seed: ${upsertCount} konu, ${junctionCount} sınav türü ilişkisi hazır`);
  }

  /**
   * Canlı oturum tier'ları — ManageLiveTiers'ı doldurur.
   * Label @unique değil → findFirst + create/update pattern.
   * Order array index'inden alınır (mevcut DB'deki 0,0,0,0,0 yerine sıralı).
   */
  private async seedLiveSessionTiers() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const data = require('./seed-data/live-session-tiers.json') as {
      liveSessionTiers: Array<{
        label: string;
        minParticipants: number;
        maxParticipants: number | null;
        priceCents: number;
        isActive: boolean;
        order?: number;
      }>;
    };
    const tiers = data.liveSessionTiers ?? [];
    if (!tiers.length) return;

    for (let i = 0; i < tiers.length; i++) {
      const t = tiers[i];
      const order = t.order ?? i;
      const existing = await this.prisma.liveSessionTier.findFirst({ where: { label: t.label } });
      if (existing) {
        await this.prisma.liveSessionTier.update({
          where: { id: existing.id },
          data: {
            minParticipants: t.minParticipants,
            maxParticipants: t.maxParticipants,
            priceCents: t.priceCents,
            isActive: t.isActive,
            order,
          },
        });
      } else {
        await this.prisma.liveSessionTier.create({
          data: {
            label: t.label,
            minParticipants: t.minParticipants,
            maxParticipants: t.maxParticipants,
            priceCents: t.priceCents,
            isActive: t.isActive,
            order,
          },
        });
      }
    }
    console.log(`Seed: ${tiers.length} canlı oturum tier'ı hazır`);
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

