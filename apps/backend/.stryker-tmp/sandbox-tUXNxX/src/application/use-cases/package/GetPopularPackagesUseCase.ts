// @ts-nocheck
import { prisma } from '../../../infrastructure/database/prisma';

export interface PopularPackageItem {
  id: string;
  title: string;
  educatorId: string | null;
  educatorUsername: string | null;
  examTypeId: string | null;
  examTypeName: string | null;
  priceCents: number | null;
  currency: string;
  isTimed: boolean;
  questionCount: number;
  saleCount: number;
  ratingAvg: number | null;
  ratingCount: number;
}

export class GetPopularPackagesUseCase {
  async execute(examTypeIds?: string[], limit = 6): Promise<PopularPackageItem[]> {
    const l = Math.min(20, Math.max(1, limit));

    let personalized: PopularPackageItem[] = [];

    // Phase 1: preferred exam types first (up to 70% of slots)
    if (examTypeIds && examTypeIds.length > 0) {
      const preferredLimit = Math.ceil(l * 0.7);
      personalized = await this.fetch(
        l,
        [],
        examTypeIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id)),
      );
      personalized = personalized.slice(0, preferredLimit);
    }

    // Phase 2: fill remaining slots with global bestsellers
    if (personalized.length < l) {
      const excludeIds = personalized.map((i) => i.id);
      const global = await this.fetch(l - personalized.length, excludeIds, []);
      personalized = [...personalized, ...global];
    }

    return personalized.slice(0, l);
  }

  private async fetch(
    limit: number,
    excludeIds: string[],
    examTypeIds: string[],
  ): Promise<PopularPackageItem[]> {
    let whereClause = `t."publishedAt" IS NOT NULL AND t."deletedAt" IS NULL`;
    const params: any[] = [];
    let paramIdx = 1;

    if (excludeIds.length > 0) {
      whereClause += ` AND t.id != ALL($${paramIdx}::uuid[])`;
      params.push(excludeIds);
      paramIdx++;
    }
    if (examTypeIds.length > 0) {
      whereClause += ` AND t."examTypeId" = ANY($${paramIdx}::uuid[])`;
      params.push(examTypeIds);
      paramIdx++;
    }
    params.push(limit);

    const rows = await prisma.$queryRawUnsafe<any[]>(
      `
      SELECT
        t.id,
        t.title,
        t."educatorId",
        u.username AS "educatorUsername",
        t."examTypeId",
        et.name AS "examTypeName",
        t."priceCents",
        COALESCE(t.currency, 'TRY') AS currency,
        t."isTimed",
        COALESCE(t."questionCount", 0) AS "questionCount",
        COUNT(p.id)::int AS "saleCount",
        AVG(r."testRating")::float AS "ratingAvg",
        COUNT(r.id)::int AS "ratingCount"
      FROM exam_tests t
      LEFT JOIN users u ON u.id = t."educatorId"
      LEFT JOIN exam_types et ON et.id = t."examTypeId"
      LEFT JOIN purchases p ON p."testId" = t.id AND p."deletedAt" IS NULL AND p.status = 'ACTIVE'
      LEFT JOIN reviews r ON r."testId" = t.id AND r."testRating" IS NOT NULL
      WHERE ${whereClause}
      GROUP BY t.id, u.username, et.name
      ORDER BY "saleCount" DESC, t."publishedAt" DESC
      LIMIT $${paramIdx}
    `,
      ...params,
    );

    return rows.map((r: any) => ({
      id: r.id,
      title: r.title,
      educatorId: r.educatorId ?? null,
      educatorUsername: r.educatorUsername ?? null,
      examTypeId: r.examTypeId ?? null,
      examTypeName: r.examTypeName ?? null,
      priceCents: r.priceCents ?? null,
      currency: r.currency ?? 'TRY',
      isTimed: Boolean(r.isTimed),
      questionCount: Number(r.questionCount ?? 0),
      saleCount: Number(r.saleCount ?? 0),
      ratingAvg: r.ratingAvg ? Number(r.ratingAvg) : null,
      ratingCount: Number(r.ratingCount ?? 0),
    }));
  }
}
