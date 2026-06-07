import { ReviewAggregationService } from '../../services/ReviewAggregationService';
import { PrismaUserPreferenceRepository } from '../../../infrastructure/repositories/PrismaUserPreferenceRepository';

/**
 * Eğitici profil sayfasını oluşturur: eğitici bilgisi, yayınlanan testler ve agregat puanlar.
 *
 * Puan stratejisi:
 *   1. Önce stats tablosundan önceden hesaplanmış değerler denenir (hızlı)
 *   2. İstatistik eksik testler için ReviewAggregationService canlı hesaplar
 */
export class GetEducatorPageUseCase {
  constructor(private readonly usersRepo: any, private readonly examsRepo: any, private readonly statsRepo: any, private readonly reviewAgg: any = new ReviewAggregationService(), private readonly prefsRepo: { findByUserId(id: string): Promise<{ preferences: Record<string, unknown> } | null> } = new PrismaUserPreferenceRepository()) {}

  async execute(educatorId: string, opts?: { page?: number; limit?: number; examTypeId?: string; sortBy?: string; sortDir?: string }) {
    if (!educatorId) throw new Error('INVALID_INPUT');
    // Sayfa sınırlamaları: en az 1. sayfa, maksimum 50 test/sayfa
    const page = Math.max(1, opts?.page ?? 1);
    const limit = Math.min(50, Math.max(1, opts?.limit ?? 20));

    const educator = await this.usersRepo.findById(educatorId);
    if (!educator || educator.role !== 'EDUCATOR') throw new Error('EDUCATOR_NOT_FOUND');

    const prefs = await this.prefsRepo.findByUserId(educatorId);
    const avatarUrl: string | null = (prefs?.preferences as any)?.profile_image_url ?? null;

    // sortBy: dışarıdan 'PRICE' veya 'NEWEST' gelir; içeride kolon adına eşlenir
    const { items: tests, total } = await this.examsRepo.listPublishedByEducator({ educatorId, examTypeId: opts?.examTypeId, page, limit, sortBy: opts?.sortBy === 'PRICE' ? 'price' : opts?.sortBy === 'NEWEST' ? 'publishedAt' : 'publishedAt', order: opts?.sortDir ?? 'desc' });

    const testIds = tests.map((t: { id: string }) => t.id);
    // Stats tablosu: eğer test istatistikleri önceden hesaplanmışsa buradan alınır
    const statsRows = await this.statsRepo.findManyByTestIds(testIds);
    const statsMap: Record<string, { ratingAvg?: number; ratingCount?: number; testId?: string }> = {};
    for (const s of statsRows) statsMap[s.testId] = s;

    let eduAgg: Record<string, { avg?: number; count?: number }> = {};
    // İstatistiği bulunmayan testler için canlı agregat hesapla
    const missingIds = testIds.filter((id: string) => !statsMap[id]);
    if (missingIds.length) {
      eduAgg = await this.reviewAgg.getAggregatesForTestIds(testIds);
    }

    // Eğitici puanı SADECE Review.educatorRating'den hesaplanır — test puanından (testRating)
    // TÜRETİLMEZ. educatorRating: adayın eğiticiye verdiği ayrı puan. Hiç educatorRating yoksa
    // ratingAvg=null, ratingCount=0 döner ve frontend rozeti hiç göstermez.
    const ratingData: { ratingAvg: number | null; ratingCount: number } = { ratingAvg: null, ratingCount: 0 };
    {
      const { prisma } = require('../../../infrastructure/database/prisma');
      const agg = await prisma.review.aggregate({
        where: { educatorId, educatorRating: { not: null } },
        _avg: { educatorRating: true },
        _count: { _all: true },
      });
      ratingData.ratingAvg = agg._avg.educatorRating ?? null;
      ratingData.ratingCount = agg._count._all ?? 0;
    }

    // Toplam satış — Home/Educators kartlarıyla tutarlı (testId join, yayındaki testler).
    let totalPurchases = 0;
    {
      const { prisma } = require('../../../infrastructure/database/prisma');
      const rows: Array<{ cnt: number }> = await prisma.$queryRaw`
        SELECT COUNT(p.id)::int AS cnt
        FROM purchases p
        JOIN exam_tests t ON p."testId" = t.id
        WHERE t."educatorId" = ${educatorId} AND t."publishedAt" IS NOT NULL
      `;
      totalPurchases = Number(rows?.[0]?.cnt ?? 0);
    }

    const items = tests.map((t: any) => ({
      id: t.id,
      title: t.title,
      educatorId: t.educatorId,
      examTypeId: t.examTypeId ?? null,
      priceCents: t.priceCents ?? null,
      currency: t.currency ?? 'TRY',
      isTimed: t.isTimed,
      questionCount: t.questionCount ?? 0,
      ratingAvg: statsMap[t.id]?.ratingAvg ?? (eduAgg as any)[t.id]?.avg ?? null,
      ratingCount: statsMap[t.id]?.ratingCount ?? (eduAgg as any)[t.id]?.count ?? 0,
    }));

    return {
      // Bio (tanıtım metni) kanonik olarak metadata.bio'da saklanır
      // (UpdateEducatorProfileUseCase whitelist'i metadata'ya yazar; bio kolonu
      // legacy/boş). Public profil bunu metadata'dan okumalı — yoksa kolona düş.
      educator: { id: educator.id, displayName: educator.username, bio: (((educator.metadata as Record<string, unknown> | undefined)?.bio as string | undefined) ?? educator.bio) ?? null, avatarUrl, isApproved: educator.status === 'ACTIVE' },
      stats: { ratingAvg: ratingData.ratingAvg, ratingCount: ratingData.ratingCount, totalPublishedTests: total, totalPurchases },
      tests: { items, meta: { page, limit, total } },
    };
  }
}

