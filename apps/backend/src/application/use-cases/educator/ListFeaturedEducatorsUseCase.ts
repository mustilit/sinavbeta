import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';

export type FeaturedEducator = {
  id: string;
  username: string;
  avatarUrl: string | null;
  testCount: number;
  saleCount: number;
  ratingAvg: number | null;
};

export class ListFeaturedEducatorsUseCase {
  async execute(prisma: PrismaClient, limit = 6, examTypeIds?: string[]): Promise<FeaturedEducator[]> {
    const capped = Math.min(100, Math.max(1, limit));

    let educatorIds: string[] = [];

    // Phase 1: personalized — educators whose tests belong to the requested exam types
    if (examTypeIds && examTypeIds.length > 0) {
      const safeIds = examTypeIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
      if (safeIds.length > 0) {
        const preferredLimit = Math.ceil(capped * 0.7);
        // examTypeId sütunu TEXT tipinde — cast gerekmez, doğrudan text karşılaştırması
        const examTypeIdList = Prisma.join(safeIds.map((id) => Prisma.sql`${id}`));
        const preferredRows = await prisma.$queryRaw<{ educator_id: string; cnt: number }[]>(
          Prisma.sql`
            SELECT t."educatorId" AS educator_id, COUNT(p.id)::int AS cnt
            FROM purchases p
            JOIN exam_tests t ON p."testId" = t.id
            WHERE t."educatorId" IS NOT NULL
              AND t."publishedAt" IS NOT NULL
              AND t."examTypeId" IN (${examTypeIdList})
            GROUP BY t."educatorId"
            ORDER BY cnt DESC
            LIMIT ${preferredLimit}
          `
        );
        educatorIds = preferredRows.map((r) => r.educator_id);
      }
    }

    // Phase 2: fill remaining slots with global bestsellers
    if (educatorIds.length < capped) {
      const remaining = capped - educatorIds.length;
      let globalRows: { educator_id: string; cnt: number }[];
      if (educatorIds.length === 0) {
        // Exclude listesi boşsa ayrı sorgu
        globalRows = await prisma.$queryRaw<{ educator_id: string; cnt: number }[]>(
          Prisma.sql`
            SELECT t."educatorId" AS educator_id, COUNT(p.id)::int AS cnt
            FROM purchases p
            JOIN exam_tests t ON p."testId" = t.id
            WHERE t."educatorId" IS NOT NULL
              AND t."publishedAt" IS NOT NULL
            GROUP BY t."educatorId"
            ORDER BY cnt DESC
            LIMIT ${remaining}
          `
        );
      } else {
        // educatorId TEXT sütunu — cast gerekmez
        const excludeList = Prisma.join(educatorIds.map((id) => Prisma.sql`${id}`));
        globalRows = await prisma.$queryRaw<{ educator_id: string; cnt: number }[]>(
          Prisma.sql`
            SELECT t."educatorId" AS educator_id, COUNT(p.id)::int AS cnt
            FROM purchases p
            JOIN exam_tests t ON p."testId" = t.id
            WHERE t."educatorId" IS NOT NULL
              AND t."publishedAt" IS NOT NULL
              AND t."educatorId" NOT IN (${excludeList})
            GROUP BY t."educatorId"
            ORDER BY cnt DESC
            LIMIT ${remaining}
          `
        );
      }
      educatorIds = [...educatorIds, ...globalRows.map((r) => r.educator_id)];
    }

    // Fallback: no purchase data at all — return active educators by creation date
    if (educatorIds.length === 0) {
      let fallbackWhere: any = { role: 'EDUCATOR', status: 'ACTIVE' };
      if (examTypeIds && examTypeIds.length > 0) {
        const safeIds = examTypeIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
        if (safeIds.length > 0) {
          const testRows = await prisma.examTest.findMany({
            where: { publishedAt: { not: null }, examTypeId: { in: safeIds } },
            select: { educatorId: true },
            distinct: ['educatorId'],
          });
          const eIds = testRows.map((t) => t.educatorId).filter(Boolean) as string[];
          if (eIds.length === 0) return [];
          fallbackWhere = { ...fallbackWhere, id: { in: eIds } };
        }
      }
      const fallback = await prisma.user.findMany({
        where: fallbackWhere,
        take: capped,
        select: {
          id: true,
          username: true,
          userPreference: { select: { preferences: true } },
        },
      });
      const testCounts = await prisma.examTest.groupBy({
        by: ['educatorId'],
        where: { educatorId: { in: fallback.map((u) => u.id) }, publishedAt: { not: null } },
        _count: { id: true },
      });
      const byEducator = Object.fromEntries(testCounts.map((t) => [t.educatorId!, t._count.id]));
      return fallback.map((u) => ({
        id: u.id,
        username: u.username,
        avatarUrl: ((u.userPreference?.preferences as any)?.profile_image_url ?? null) as string | null,
        testCount: byEducator[u.id] ?? 0,
        saleCount: 0,
        ratingAvg: null as number | null,
      }));
    }

    // Resolve user data for collected educator IDs (avatar için userPreference dahil)
    const users = await prisma.user.findMany({
      where: { id: { in: educatorIds }, role: 'EDUCATOR' },
      select: {
        id: true,
        username: true,
        userPreference: { select: { preferences: true } },
      },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    const testCounts = await prisma.examTest.groupBy({
      by: ['educatorId'],
      where: { educatorId: { in: educatorIds }, publishedAt: { not: null } },
      _count: { id: true },
    });
    const testCountMap = new Map(testCounts.map((t) => [t.educatorId!, t._count.id]));

    // Build sale count map — educatorId TEXT sütunu, cast gerekmez
    const educatorIdList = Prisma.join(educatorIds.map((id) => Prisma.sql`${id}`));
    const allSales = await prisma.$queryRaw<{ educator_id: string; cnt: number }[]>(
      Prisma.sql`
        SELECT t."educatorId" AS educator_id, COUNT(p.id)::int AS cnt
        FROM purchases p
        JOIN exam_tests t ON p."testId" = t.id
        WHERE t."educatorId" IN (${educatorIdList})
          AND t."publishedAt" IS NOT NULL
        GROUP BY t."educatorId"
      `
    );
    const saleMap = new Map(allSales.map((r) => [r.educator_id, r.cnt]));

    const ratingRows = await prisma.review.groupBy({
      by: ['educatorId'],
      where: { educatorId: { in: educatorIds }, educatorRating: { not: null } },
      _avg: { educatorRating: true },
      _count: { id: true },
    });
    const ratingMap = new Map(ratingRows.map((r) => [r.educatorId, r._avg.educatorRating ?? null]));

    return educatorIds
      .filter((id) => userMap.has(id))
      .map((id) => {
        const u = userMap.get(id)!;
        const avatarUrl: string | null = (u.userPreference?.preferences as any)?.profile_image_url ?? null;
        return {
          id,
          username: u.username,
          avatarUrl,
          testCount: testCountMap.get(id) ?? 0,
          saleCount: saleMap.get(id) ?? 0,
          ratingAvg: ratingMap.get(id) ?? null,
        };
      });
  }
}
