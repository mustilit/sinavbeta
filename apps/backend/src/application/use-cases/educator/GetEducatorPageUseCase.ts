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

    // Pazaryeri birimi TestPackage'dır — eğitici profili tekil testleri DEĞİL,
    // yayındaki PAKETLERİ listeler (bir pakette N test olsa da TEK kart). Kart
    // alanları popular-packages ile tutarlı: paket fiyatı, paketteki TOPLAM soru,
    // paket bazlı puan (reviews.packageId). examTypeId paketin ilk testinden türetilir
    // (test_packages'ta examTypeId kolonu yok). Frontend examTypeId/sort'u client'ta
    // uygular (limit=50 ile tüm liste gelir) — server filtre/sort minimal tutulur.
    const { prisma } = require('../../../infrastructure/database/prisma');
    const offset = (page - 1) * limit;
    const sortCol = opts?.sortBy === 'PRICE' ? 'tp."priceCents"' : 'tp."publishedAt"';
    const sortDir = String(opts?.sortDir ?? 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const pkgRows: any[] = await prisma.$queryRawUnsafe(
      `
      SELECT
        tp.id, tp.title, tp."educatorId", tp."priceCents",
        COALESCE(tp.currency, 'TRY') AS currency,
        (SELECT t2."examTypeId" FROM exam_tests t2
           WHERE t2."packageId" = tp.id AND t2."deletedAt" IS NULL AND t2."examTypeId" IS NOT NULL
           ORDER BY t2."createdAt" ASC LIMIT 1) AS "examTypeId",
        COALESCE((SELECT COUNT(q.id) FROM exam_questions q
           JOIN exam_tests t3 ON t3.id = q."testId"
           WHERE t3."packageId" = tp.id AND t3."deletedAt" IS NULL), 0)::int AS "questionCount",
        AVG(r."testRating")::float AS "ratingAvg",
        COUNT(r.id)::int AS "ratingCount"
      FROM test_packages tp
      LEFT JOIN reviews r ON r."packageId" = tp.id AND r."testRating" IS NOT NULL
      WHERE tp."educatorId" = $1 AND tp."publishedAt" IS NOT NULL
      GROUP BY tp.id
      ORDER BY ${sortCol} ${sortDir} NULLS LAST, tp.id DESC
      LIMIT $2 OFFSET $3
      `,
      educatorId, limit, offset,
    );
    const totalRows: Array<{ cnt: number }> = await prisma.$queryRaw`
      SELECT COUNT(*)::int AS cnt FROM test_packages
      WHERE "educatorId" = ${educatorId} AND "publishedAt" IS NOT NULL
    `;
    const total = Number(totalRows?.[0]?.cnt ?? 0);

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

    const items = pkgRows.map((r: any) => ({
      id: r.id,
      title: r.title,
      educatorId: r.educatorId,
      examTypeId: r.examTypeId ?? null,
      priceCents: r.priceCents ?? null,
      currency: r.currency ?? 'TRY',
      isTimed: false,
      questionCount: Number(r.questionCount ?? 0),
      ratingAvg: r.ratingAvg != null ? Number(r.ratingAvg) : null,
      ratingCount: Number(r.ratingCount ?? 0),
    }));

    // Eğitici Sınıf uzmanlığı (preferences.specialized_grade_levels) — adlarla çöz.
    const gradeLevelIds: string[] = Array.isArray((prefs?.preferences as any)?.specialized_grade_levels)
      ? ((prefs!.preferences as any).specialized_grade_levels as unknown[]).filter((x): x is string => typeof x === 'string')
      : [];
    let gradeLevels: { id: string; name: string }[] = [];
    if (gradeLevelIds.length) {
      gradeLevels = await prisma.gradeLevel.findMany({ where: { id: { in: gradeLevelIds }, active: true }, select: { id: true, name: true } });
    }

    return {
      // Bio (tanıtım metni) kanonik olarak metadata.bio'da saklanır
      // (UpdateEducatorProfileUseCase whitelist'i metadata'ya yazar; bio kolonu
      // legacy/boş). Public profil bunu metadata'dan okumalı — yoksa kolona düş.
      educator: { id: educator.id, displayName: educator.username, bio: (((educator.metadata as Record<string, unknown> | undefined)?.bio as string | undefined) ?? educator.bio) ?? null, avatarUrl, isApproved: educator.status === 'ACTIVE', gradeLevels, gradeLevelIds },
      stats: { ratingAvg: ratingData.ratingAvg, ratingCount: ratingData.ratingCount, totalPublishedTests: total, totalPurchases },
      tests: { items, meta: { page, limit, total } },
    };
  }
}

