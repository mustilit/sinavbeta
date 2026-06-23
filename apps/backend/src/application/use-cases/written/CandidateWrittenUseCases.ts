import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';

/** Eğitici adlarını scalar educatorId'lerden çöz (modül-dışı id; relation yok). */
async function resolveEducators(educatorIds: string[]) {
  const ids = [...new Set(educatorIds.filter(Boolean))];
  if (!ids.length) return new Map<string, string>();
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true } });
  return new Map(users.map((u) => [u.id, u.username || 'Eğitici']));
}

/** Sınıf adlarını scalar gradeLevelId'lerden çöz (modül-dışı id; relation yok). */
async function resolveGradeLevels(gradeLevelIds: (string | null | undefined)[]) {
  const ids = [...new Set(gradeLevelIds.filter(Boolean) as string[])];
  if (!ids.length) return new Map<string, string>();
  const rows = await prisma.gradeLevel.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  return new Map(rows.map((g) => [g.id, g.name]));
}

/** Adayın satın aldığı yazılı paketler (Satın Alınanlar sekmesi) — test + deneme durumu. */
export class ListMyWrittenPurchasesUseCase {
  async execute(actorId?: string | null) {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Giriş gerekli', 401);
    const purchases = await prisma.writtenPurchase.findMany({
      where: { candidateId: actorId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, packageId: true, createdAt: true },
    });
    if (!purchases.length) return { items: [] };

    const packageIds = purchases.map((p) => p.packageId);
    const packages = await prisma.writtenPackage.findMany({
      where: { id: { in: packageIds } },
      select: {
        id: true, title: true, description: true, coverImageUrl: true, difficulty: true, educatorId: true, gradeLevelId: true,
        tests: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' }, select: { id: true, title: true, isTimed: true, duration: true, questionCount: true } },
      },
    });
    const testIds = packages.flatMap((p) => p.tests.map((t) => t.id));
    const attempts = testIds.length
      ? await prisma.writtenAttempt.findMany({
          where: { candidateId: actorId, testId: { in: testIds } },
          orderBy: { attemptNumber: 'desc' },
          select: { id: true, testId: true, status: true },
        })
      : [];
    // test başına EN SON deneme durumu
    const stateByTest = new Map<string, { attemptId: string; status: string }>();
    for (const a of attempts) if (!stateByTest.has(a.testId)) stateByTest.set(a.testId, { attemptId: a.id, status: a.status });

    const [educators, gradeLevels] = await Promise.all([
      resolveEducators(packages.map((p) => p.educatorId ?? '')),
      resolveGradeLevels(packages.map((p) => p.gradeLevelId)),
    ]);
    const pkgById = new Map(packages.map((p) => [p.id, p]));

    return {
      items: purchases
        .map((pur) => {
          const p = pkgById.get(pur.packageId);
          if (!p) return null;
          return {
            packageId: p.id,
            title: p.title,
            description: p.description,
            coverImageUrl: p.coverImageUrl,
            difficulty: p.difficulty,
            educatorName: p.educatorId ? educators.get(p.educatorId) ?? null : null,
            gradeLevelId: p.gradeLevelId ?? null,
            gradeLevelName: p.gradeLevelId ? gradeLevels.get(p.gradeLevelId) ?? null : null,
            purchasedAt: pur.createdAt,
            tests: p.tests.map((t) => {
              const st = stateByTest.get(t.id);
              return {
                id: t.id,
                title: t.title,
                isTimed: t.isTimed,
                duration: t.duration,
                questionCount: t.questionCount ?? 0,
                attemptId: st?.attemptId ?? null,
                state: st?.status ?? null, // null=başlanmadı | IN_PROGRESS | SUBMITTED | TIMEOUT
              };
            }),
          };
        })
        .filter(Boolean),
    };
  }
}

/** Yayımlanmış yazılı paketler (pazar listesi — kart alanları). */
export class ListPublishedWrittenPackagesUseCase {
  async execute(params?: { limit?: number; cursor?: string | null; gradeLevelId?: string | null; featured?: boolean; viewerId?: string | null }) {
    const take = Math.min(Math.max(params?.limit ?? 20, 1), 100);
    const rows = await prisma.writtenPackage.findMany({
      where: { isActive: true, publishedAt: { not: null }, ...(params?.gradeLevelId ? { gradeLevelId: params.gradeLevelId } : {}) },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(params?.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        title: true,
        description: true,
        coverImageUrl: true,
        priceCents: true,
        currency: true,
        difficulty: true,
        publishedAt: true,
        educatorId: true,
        gradeLevelId: true,
        tests: { where: { deletedAt: null }, select: { questionCount: true } },
      },
    });
    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, -1) : rows;
    const [educators, gradeLevels, ratings] = await Promise.all([
      resolveEducators(items.map((p) => p.educatorId ?? '')),
      resolveGradeLevels(items.map((p) => p.gradeLevelId)),
      items.length
        ? prisma.writtenReview.groupBy({
            by: ['packageId'],
            where: { packageId: { in: items.map((p) => p.id) } },
            _avg: { rating: true },
          })
        : Promise.resolve([] as { packageId: string; _avg: { rating: number | null } }[]),
    ]);
    const ratingByPkg = new Map(ratings.map((r) => [r.packageId, r._avg.rating]));
    const mapItem = (p: (typeof items)[number], tags?: string[]) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      coverImageUrl: p.coverImageUrl,
      priceCents: p.priceCents,
      currency: p.currency,
      difficulty: p.difficulty,
      testCount: p.tests.length,
      totalQuestions: p.tests.reduce((s, t) => s + (t.questionCount ?? 0), 0),
      avgRating: ratingByPkg.get(p.id) != null ? Math.round((ratingByPkg.get(p.id) as number) * 10) / 10 : null,
      educatorId: p.educatorId,
      educatorName: p.educatorId ? educators.get(p.educatorId) ?? null : null,
      gradeLevelId: p.gradeLevelId ?? null,
      gradeLevelName: p.gradeLevelId ? gradeLevels.get(p.gradeLevelId) ?? null : null,
      ...(tags ? { tags, featured: true } : {}),
    });

    let mappedItems = items.map((p) => mapItem(p));

    // Öne çıkarma (reklam) — yalnız ilk sayfada (cursor yok) ve featured istendiğinde.
    // Aktif WRITTEN reklamı olan paketleri en üste taşır, AD_BOOSTED rozetiyle işaretler.
    if (params?.featured && !params?.cursor) {
      try {
        const boosted = await this.applyWrittenAds(mappedItems, items, mapItem, params.viewerId ?? null);
        mappedItems = boosted;
      } catch {
        /* reklam öne çıkarma kritik değil — sessiz geç */
      }
    }

    return {
      items: mappedItems,
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
    };
  }

  /**
   * Aktif WRITTEN reklamlarını listenin başına yerleştirir (AD_BOOSTED).
   * Listede olmayan öne çıkan paketleri ayrıca çeker. Impression best-effort kaydeder.
   */
  private async applyWrittenAds(
    mapped: any[],
    rawItems: any[],
    mapItem: (p: any, tags?: string[]) => any,
    viewerId: string | null,
  ): Promise<any[]> {
    const now = new Date();
    const ads = await prisma.adPurchase.findMany({
      where: {
        targetType: 'WRITTEN' as any,
        validUntil: { gt: now },
        impressionsRemaining: { gt: 0 },
        writtenPackageId: { not: null },
      } as any,
      select: { id: true, educatorId: true, writtenPackageId: true } as any,
    });
    if (ads.length === 0) return mapped;

    // Reklamı olan, yayında + aktif paket id'leri (sahibi tarafından yayından kaldırılmış olabilir)
    const adByPkg = new Map<string, { id: string; educatorId: string }>();
    for (const a of ads as any[]) {
      if (a.writtenPackageId && !adByPkg.has(a.writtenPackageId)) {
        adByPkg.set(a.writtenPackageId, { id: a.id, educatorId: a.educatorId });
      }
    }
    const adPkgIds = [...adByPkg.keys()];

    // Listede zaten olan öne çıkanları tag'le; olmayanları ayrıca çek
    const presentIds = new Set(mapped.map((m) => m.id));
    const missingIds = adPkgIds.filter((id) => !presentIds.has(id));

    let extra: any[] = [];
    if (missingIds.length > 0) {
      const extraRows = await prisma.writtenPackage.findMany({
        where: { id: { in: missingIds }, isActive: true, publishedAt: { not: null } },
        select: {
          id: true, title: true, description: true, coverImageUrl: true, priceCents: true,
          currency: true, difficulty: true, publishedAt: true, educatorId: true, gradeLevelId: true,
          tests: { where: { deletedAt: null }, select: { questionCount: true } },
        },
      });
      const [edu, grades] = await Promise.all([
        resolveEducators(extraRows.map((p) => p.educatorId ?? '')),
        resolveGradeLevels(extraRows.map((p) => p.gradeLevelId)),
      ]);
      extra = extraRows.map((p) => ({
        ...mapItem({ ...p, tests: p.tests } as any, ['AD_BOOSTED']),
        educatorName: p.educatorId ? edu.get(p.educatorId) ?? null : null,
        gradeLevelName: p.gradeLevelId ? grades.get(p.gradeLevelId) ?? null : null,
      }));
    }

    // Geçerli (yayında olan) öne çıkan id kümesi
    const validAdIds = new Set([...presentIds].filter((id) => adByPkg.has(id)).concat(extra.map((e) => e.id)));

    // Mevcut listedekileri öne çıkan/normal diye ayır + tag uygula
    const boostedExisting = mapped.filter((m) => validAdIds.has(m.id)).map((m) => ({ ...m, tags: ['AD_BOOSTED'], featured: true }));
    const normal = mapped.filter((m) => !validAdIds.has(m.id));

    // Impression best-effort
    const impressionPayload = [...boostedExisting, ...extra]
      .map((it) => adByPkg.get(it.id))
      .filter(Boolean) as { id: string; educatorId: string }[];
    if (impressionPayload.length > 0) {
      try {
        const { RecordAdImpressionsUseCase } = await import('../ad/RecordAdImpressionsUseCase');
        new RecordAdImpressionsUseCase()
          .execute(impressionPayload.map((p) => ({ id: p.id, educatorId: p.educatorId, testId: null })), viewerId)
          .catch(() => {});
      } catch { /* impression kaydı kritik değil */ }
    }

    return [...extra, ...boostedExisting, ...normal];
  }
}

/** Yayımlanmış paket detay (public — ÇÖZÜM ve soru içeriği SIZDIRMAZ; sadece test listesi). */
export class GetPublishedWrittenPackageUseCase {
  async execute(packageId: string) {
    const pkg = await prisma.writtenPackage.findUnique({
      where: { id: packageId },
      select: {
        id: true,
        title: true,
        description: true,
        coverImageUrl: true,
        priceCents: true,
        currency: true,
        difficulty: true,
        isActive: true,
        publishedAt: true,
        educatorId: true,
        gradeLevelId: true,
        tests: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
          select: { id: true, title: true, isTimed: true, duration: true, questionCount: true },
        },
      },
    });
    if (!pkg || !pkg.publishedAt || !pkg.isActive)
      throw new AppError('WRITTEN_PACKAGE_NOT_FOUND', 'Paket bulunamadı', 404);

    const [educators, gradeLevels, ratingAgg, salesCount] = await Promise.all([
      resolveEducators([pkg.educatorId ?? '']),
      resolveGradeLevels([pkg.gradeLevelId]),
      prisma.writtenReview.aggregate({ where: { packageId: pkg.id }, _avg: { rating: true }, _count: { _all: true } }),
      prisma.writtenPurchase.count({ where: { packageId: pkg.id, status: 'ACTIVE' } }),
    ]);
    const tests = pkg.tests.map((t) => ({
      id: t.id,
      title: t.title,
      isTimed: t.isTimed,
      duration: t.duration,
      questionCount: t.questionCount ?? 0,
    }));
    return {
      id: pkg.id,
      title: pkg.title,
      description: pkg.description,
      coverImageUrl: pkg.coverImageUrl,
      priceCents: pkg.priceCents,
      currency: pkg.currency,
      difficulty: pkg.difficulty,
      educatorId: pkg.educatorId,
      educatorName: pkg.educatorId ? educators.get(pkg.educatorId) ?? null : null,
      educatorUsername: pkg.educatorId ? educators.get(pkg.educatorId) ?? null : null,
      gradeLevelId: pkg.gradeLevelId ?? null,
      gradeLevelName: pkg.gradeLevelId ? gradeLevels.get(pkg.gradeLevelId) ?? null : null,
      testCount: tests.length,
      totalQuestions: tests.reduce((s, t) => s + (t.questionCount ?? 0), 0),
      salesCount,
      avgRating: ratingAgg._avg.rating != null ? Math.round(ratingAgg._avg.rating * 10) / 10 : null,
      reviewCount: ratingAgg._count._all,
      tests,
    };
  }
}
