// @ts-nocheck
import { prisma } from '../../../infrastructure/database/prisma';
import { Prisma } from '@prisma/client';

export interface ListMarketplacePackagesFilters {
  examTypeId?: string;
  limit?: number;
  /** Serbest metin araması — tsvector üzerinde çalışır */
  q?: string;
}

export interface MarketplacePackageItem {
  id: string;
  title: string;
  description: string | null;
  priceCents: number;
  difficulty: string;
  publishedAt: string;
  educatorId: string | null;
  educatorUsername: string | null;
  examTypeId: string | null;
  examTypeName: string | null;
  questionCount: number;
  testCount: number;
  ratingAvg: number | null;
  ratingCount: number;
  saleCount: number;
  tags: string[];
}

// ---- Yardımcı: kullanıcı girdisinden tsquery token'ı üret ----
function buildTsquery(raw: string): string | null {
  // Token: Yalnızca harf ve rakam bırak, prefix match için ':*' ekle, AND ile birleştir
  const tokens = raw
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean)
    .map((t) => t + ':*');
  if (tokens.length === 0) return null;
  return tokens.join(' & ');
}

export class ListMarketplacePackagesUseCase {
  async execute(filters?: ListMarketplacePackagesFilters): Promise<{ items: MarketplacePackageItem[] }> {
    const limit = Math.min(100, Math.max(1, filters?.limit ?? 20));
    const rawQuery = (filters?.q ?? '').trim();
    const tsquery = rawQuery.length >= 2 ? buildTsquery(rawQuery) : null;

    let packageRows: any[];

    if (tsquery) {
      // --- Metin araması: raw SQL + tsvector ---
      // Eğitici username da ILIKE ile dahil edilir (tsvector'da değil — farklı tabloda)
      const examTypeClause = filters?.examTypeId
        ? Prisma.sql`AND EXISTS (
            SELECT 1 FROM exam_tests et2
            WHERE et2."packageId" = tp.id
              AND et2."examTypeId" = ${filters.examTypeId}
              AND et2."deletedAt" IS NULL
          )`
        : Prisma.sql``;

      packageRows = await prisma.$queryRaw<any[]>`
        SELECT
          tp.id,
          tp.title,
          tp.description,
          tp."priceCents",
          tp.difficulty,
          tp."publishedAt",
          tp."educatorId",
          u.username       AS "educatorUsername",
          ts_rank(tp.search_vector, to_tsquery('simple', ${tsquery})) AS rank
        FROM test_packages tp
        LEFT JOIN users u ON u.id = tp."educatorId"
        WHERE
          tp."publishedAt" IS NOT NULL
          AND (
            tp.search_vector @@ to_tsquery('simple', ${tsquery})
            OR u.username ILIKE ${'%' + rawQuery + '%'}
          )
          ${examTypeClause}
        ORDER BY rank DESC, tp."publishedAt" DESC
        LIMIT ${limit}
      `;
    } else {
      // --- Arama yok: mevcut Prisma yaklaşımı ---
      const testsWhereForFilter = filters?.examTypeId
        ? { some: { examTypeId: filters.examTypeId, deletedAt: null } }
        : undefined;

      const pkgs = await (prisma.testPackage as any).findMany({
        where: {
          publishedAt: { not: null },
          ...(testsWhereForFilter && { tests: testsWhereForFilter }),
        },
        orderBy: { publishedAt: 'desc' },
        take: limit,
        select: {
          id: true,
          title: true,
          description: true,
          priceCents: true,
          difficulty: true,
          publishedAt: true,
          educatorId: true,
          educator: { select: { id: true, username: true } },
        },
      });
      packageRows = pkgs.map((p: any) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        priceCents: p.priceCents,
        difficulty: p.difficulty,
        publishedAt: p.publishedAt,
        educatorId: p.educatorId,
        educatorUsername: p.educator?.username ?? null,
      }));
    }

    if (packageRows.length === 0) return { items: [] };

    const packageIds: string[] = packageRows.map((p: any) => p.id);

    // Testleri tek sorguda çek
    const testRows: any[] = await (prisma.examTest as any).findMany({
      where: { packageId: { in: packageIds }, deletedAt: null },
      select: {
        id: true,
        packageId: true,
        examTypeId: true,
        examType: { select: { id: true, name: true } },
        _count: { select: { questions: true } },
      },
    });

    const testsByPackage = new Map<string, any[]>();
    for (const t of testRows) {
      if (!testsByPackage.has(t.packageId)) testsByPackage.set(t.packageId, []);
      testsByPackage.get(t.packageId)!.push(t);
    }

    // Rating aggregation
    const allTestIds = testRows.map((t: any) => t.id);
    const ratingRows: any[] = allTestIds.length
      ? await prisma.review.groupBy({
          by: ['testId'],
          where: { testId: { in: allTestIds } },
          _avg: { testRating: true },
          _count: { _all: true },
        } as any)
      : [];

    // Sale aggregation
    const saleRows: any[] = packageIds.length
      ? await (prisma.purchase as any).groupBy({
          by: ['packageId'],
          where: { packageId: { in: packageIds }, status: 'ACTIVE' },
          _count: { _all: true },
        })
      : [];

    const ratingByTestId = new Map<string, { avg: number; count: number }>();
    for (const r of ratingRows) {
      ratingByTestId.set(r.testId, { avg: r._avg.testRating ?? 0, count: r._count._all ?? 0 });
    }

    const saleByPackageId = new Map<string, number>();
    for (const s of saleRows) {
      if (s.packageId) saleByPackageId.set(s.packageId, s._count._all ?? 0);
    }

    const items: MarketplacePackageItem[] = packageRows.map((pkg: any) => {
      const tests: any[] = testsByPackage.get(pkg.id) ?? [];
      const questionCount = tests.reduce((sum: number, t: any) => sum + (t._count?.questions ?? 0), 0);
      const firstTestWithType = tests.find((t: any) => t.examTypeId != null);
      const examTypeId: string | null = firstTestWithType?.examTypeId ?? null;
      const examTypeName: string | null = firstTestWithType?.examType?.name ?? null;

      let ratingSum = 0;
      let ratingCnt = 0;
      for (const t of tests) {
        const r = ratingByTestId.get(t.id);
        if (r && r.count) {
          ratingSum += r.avg * r.count;
          ratingCnt += r.count;
        }
      }

      const publishedAt = pkg.publishedAt instanceof Date
        ? pkg.publishedAt.toISOString()
        : (typeof pkg.publishedAt === 'string' ? pkg.publishedAt : new Date(pkg.publishedAt).toISOString());

      return {
        id: pkg.id,
        title: pkg.title,
        description: pkg.description ?? null,
        priceCents: pkg.priceCents ?? 0,
        difficulty: pkg.difficulty ?? 'medium',
        publishedAt,
        educatorId: pkg.educatorId ?? null,
        educatorUsername: pkg.educatorUsername ?? null,
        examTypeId,
        examTypeName,
        questionCount,
        testCount: tests.length,
        ratingAvg: ratingCnt > 0 ? ratingSum / ratingCnt : null,
        ratingCount: ratingCnt,
        saleCount: saleByPackageId.get(pkg.id) ?? 0,
        tags: [],
      };
    });

    return { items };
  }
}
