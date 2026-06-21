import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';

export type FeaturedEducator = {
  id: string;
  username: string;
  avatarUrl: string | null;
  testCount: number;
  writtenCount: number;
  saleCount: number;
  ratingAvg: number | null;
  gradeLevelIds: string[];
  createdAt: Date;
};

export class ListFeaturedEducatorsUseCase {
  async execute(prisma: PrismaClient, limit = 6, examTypeIds?: string[], gradeLevelId?: string): Promise<FeaturedEducator[]> {
    const capped = Math.min(100, Math.max(1, limit));

    let educatorIds: string[] = [];

    // Sınıf (GradeLevel) filtresi: eğitici uzmanlığı preferences.specialized_grade_levels'te.
    // Verildiğinde liste, bu sınıfı uzmanlık seçmiş aktif eğiticilerden kurulur (bestseller fazları atlanır).
    const gradeFilter = typeof gradeLevelId === 'string' && /^[0-9a-f-]{36}$/i.test(gradeLevelId) ? gradeLevelId : null;
    if (gradeFilter) {
      const prefRows = await prisma.userPreference.findMany({
        where: { user: { role: 'EDUCATOR', status: 'ACTIVE' } },
        select: { userId: true, preferences: true },
      });
      educatorIds = prefRows
        .filter((p) => Array.isArray((p.preferences as any)?.specialized_grade_levels) && (p.preferences as any).specialized_grade_levels.includes(gradeFilter))
        .map((p) => p.userId)
        .slice(0, capped);
      if (educatorIds.length === 0) return [];
    }

    // Phase 1: personalized — educators whose tests belong to the requested exam types
    if (!gradeFilter && examTypeIds && examTypeIds.length > 0) {
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
    if (!gradeFilter && educatorIds.length < capped) {
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

    // Phase 3: kalan kapasiteyi YENİ kaydolan aktif eğiticilerle doldur — henüz
    // satışı olmayan yeni eğiticiler de listede görünsün ki "Yeni" sıralaması ve
    // dizin (directory) eksiksiz olsun. createdAt DESC ile en yeniler eklenir.
    if (!gradeFilter && educatorIds.length < capped) {
      const remaining = capped - educatorIds.length;
      const recentWhere: any = { role: 'EDUCATOR', status: 'ACTIVE' };
      if (examTypeIds && examTypeIds.length > 0) {
        const safeIds = examTypeIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
        if (safeIds.length > 0) {
          const testRows = await prisma.examTest.findMany({
            where: { publishedAt: { not: null }, examTypeId: { in: safeIds } },
            select: { educatorId: true },
            distinct: ['educatorId'],
          });
          const eIds = testRows.map((t) => t.educatorId).filter(Boolean) as string[];
          recentWhere.id = educatorIds.length > 0 ? { in: eIds, notIn: educatorIds } : { in: eIds };
        } else if (educatorIds.length > 0) {
          recentWhere.id = { notIn: educatorIds };
        }
      } else if (educatorIds.length > 0) {
        recentWhere.id = { notIn: educatorIds };
      }
      const recent = await prisma.user.findMany({
        where: recentWhere,
        orderBy: { createdAt: 'desc' },
        take: remaining,
        select: { id: true },
      });
      educatorIds = [...educatorIds, ...recent.map((u) => u.id)];
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
          createdAt: true,
          userPreference: { select: { preferences: true } },
        },
      });
      const testCounts = await prisma.examTest.groupBy({
        by: ['educatorId'],
        where: { educatorId: { in: fallback.map((u) => u.id) }, publishedAt: { not: null } },
        _count: { id: true },
      });
      const byEducator = Object.fromEntries(testCounts.map((t) => [t.educatorId!, t._count.id]));
      const writtenCountsFb = await prisma.writtenPackage.groupBy({
        by: ['educatorId'],
        where: { educatorId: { in: fallback.map((u) => u.id) }, isActive: true, publishedAt: { not: null } },
        _count: { id: true },
      });
      const writtenByEducator = Object.fromEntries(writtenCountsFb.map((w) => [w.educatorId!, w._count.id]));
      return fallback.map((u) => {
        const prefGrades = (u.userPreference?.preferences as any)?.specialized_grade_levels;
        return {
          id: u.id,
          username: u.username,
          avatarUrl: ((u.userPreference?.preferences as any)?.profile_image_url ?? null) as string | null,
          testCount: byEducator[u.id] ?? 0,
          writtenCount: writtenByEducator[u.id] ?? 0,
          saleCount: 0,
          ratingAvg: null as number | null,
          gradeLevelIds: Array.isArray(prefGrades) ? prefGrades.filter((x: unknown) => typeof x === 'string') : [],
          createdAt: u.createdAt,
        };
      });
    }

    // Resolve user data for collected educator IDs (avatar için userPreference dahil)
    const users = await prisma.user.findMany({
      where: { id: { in: educatorIds }, role: 'EDUCATOR' },
      select: {
        id: true,
        username: true,
        createdAt: true,
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

    // Yayında yazılı paket sayısı (educatorId scalar — written modülü)
    const writtenCounts = await prisma.writtenPackage.groupBy({
      by: ['educatorId'],
      where: { educatorId: { in: educatorIds }, isActive: true, publishedAt: { not: null } },
      _count: { id: true },
    });
    const writtenCountMap = new Map(writtenCounts.map((w) => [w.educatorId!, w._count.id]));

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
        const prefGrades = (u.userPreference?.preferences as any)?.specialized_grade_levels;
        return {
          id,
          username: u.username,
          avatarUrl,
          testCount: testCountMap.get(id) ?? 0,
          writtenCount: writtenCountMap.get(id) ?? 0,
          saleCount: saleMap.get(id) ?? 0,
          ratingAvg: ratingMap.get(id) ?? null,
          gradeLevelIds: Array.isArray(prefGrades) ? prefGrades.filter((x: unknown) => typeof x === 'string') : [],
          createdAt: u.createdAt,
        };
      });
  }
}
