import { prisma } from '../../../infrastructure/database/prisma';
import { prismaRead } from '../../../infrastructure/database/dbRouter';

// Sprint 10 — Admin aday raporu, replica'dan oku (lag toleranslı).

export interface CandidateReportItem {
  id: string;
  email: string;
  username: string;
  status: string;
  registeredAt: Date;
  lastLoginAt: Date | null;
  lastPurchaseAt: Date | null;
  totalPurchases: number;
  totalSpentCents: number;
  avgTestRating: number | null;
  avgEducatorRating: number | null;
  totalAttempts: number;
  totalAnswered: number;
  totalCorrect: number;
  correctRate: number | null;
}

export interface CandidateReportFilters {
  q?: string;
  status?: string;
  registeredFrom?: string;
  registeredTo?: string;
  lastLoginFrom?: string;
  lastLoginTo?: string;
  minPurchases?: number;
  maxPurchases?: number;
  minSpentCents?: number;
  maxSpentCents?: number;
  minCorrectRate?: number;
  maxCorrectRate?: number;
  hasNeverLoggedIn?: boolean;
  page?: number;
  limit?: number;
  sortBy?: string;
  order?: string;
}

export class GetCandidateReportUseCase {
  async execute(filters: CandidateReportFilters = {}): Promise<{ items: CandidateReportItem[]; total: number }> {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(200, Math.max(1, filters.limit ?? 50));
    const offset = (page - 1) * limit;

    const conditions: string[] = [`u.role = 'CANDIDATE'`];
    const params: any[] = [];
    let pIdx = 1;

    if (filters.q) {
      conditions.push(`(u.email ILIKE $${pIdx} OR u.username ILIKE $${pIdx})`);
      params.push(`%${filters.q}%`);
      pIdx++;
    }
    if (filters.status) {
      conditions.push(`u.status = $${pIdx}`);
      params.push(filters.status);
      pIdx++;
    }
    if (filters.registeredFrom) {
      conditions.push(`u."createdAt" >= $${pIdx}`);
      params.push(new Date(filters.registeredFrom));
      pIdx++;
    }
    if (filters.registeredTo) {
      conditions.push(`u."createdAt" <= $${pIdx}`);
      params.push(new Date(filters.registeredTo));
      pIdx++;
    }
    if (filters.lastLoginFrom) {
      conditions.push(`u."lastLoginAt" >= $${pIdx}`);
      params.push(new Date(filters.lastLoginFrom));
      pIdx++;
    }
    if (filters.lastLoginTo) {
      conditions.push(`u."lastLoginAt" <= $${pIdx}`);
      params.push(new Date(filters.lastLoginTo));
      pIdx++;
    }
    if (filters.hasNeverLoggedIn) {
      conditions.push(`u."lastLoginAt" IS NULL`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // HAVING filters (post-aggregation)
    const havingConds: string[] = [];
    if (typeof filters.minPurchases === 'number') {
      havingConds.push(`COUNT(DISTINCT p.id) >= ${filters.minPurchases}`);
    }
    if (typeof filters.maxPurchases === 'number') {
      havingConds.push(`COUNT(DISTINCT p.id) <= ${filters.maxPurchases}`);
    }
    if (typeof filters.minSpentCents === 'number') {
      havingConds.push(`COALESCE(SUM(p."amountCents"), 0) >= ${filters.minSpentCents}`);
    }
    if (typeof filters.maxSpentCents === 'number') {
      havingConds.push(`COALESCE(SUM(p."amountCents"), 0) <= ${filters.maxSpentCents}`);
    }
    if (typeof filters.minCorrectRate === 'number') {
      havingConds.push(`CASE WHEN COUNT(aa.id) > 0 THEN (COUNT(CASE WHEN aa."isCorrect" = true THEN 1 END) * 100.0 / COUNT(aa.id)) ELSE NULL END >= ${filters.minCorrectRate}`);
    }
    if (typeof filters.maxCorrectRate === 'number') {
      havingConds.push(`CASE WHEN COUNT(aa.id) > 0 THEN (COUNT(CASE WHEN aa."isCorrect" = true THEN 1 END) * 100.0 / COUNT(aa.id)) ELSE NULL END <= ${filters.maxCorrectRate}`);
    }
    const havingClause = havingConds.length ? `HAVING ${havingConds.join(' AND ')}` : '';

    // Sort
    const sortMap: Record<string, string> = {
      registeredAt: 'u."createdAt"',
      lastLoginAt: 'u."lastLoginAt"',
      totalPurchases: 'COUNT(DISTINCT p.id)',
      totalSpentCents: 'COALESCE(SUM(p."amountCents"),0)',
      avgTestRating: 'AVG(r."testRating")',
      correctRate: 'CASE WHEN COUNT(aa.id) > 0 THEN (COUNT(CASE WHEN aa."isCorrect" = true THEN 1 END) * 100.0 / COUNT(aa.id)) ELSE NULL END',
    };
    const sortCol = sortMap[filters.sortBy ?? ''] ?? 'u."createdAt"';
    const sortOrder = filters.order === 'asc' ? 'ASC' : 'DESC';

    const baseSql = `
      FROM users u
      LEFT JOIN purchases p ON p."candidateId" = u.id AND p.status = 'ACTIVE' AND p."deletedAt" IS NULL
      LEFT JOIN reviews r ON r."candidateId" = u.id
      LEFT JOIN test_attempts ta ON ta."candidateId" = u.id AND ta.status = 'SUBMITTED'
      LEFT JOIN attempt_answers aa ON aa."attemptId" = ta.id
      ${whereClause}
      GROUP BY u.id, u.email, u.username, u.status, u."lastLoginAt", u."createdAt"
      ${havingClause}
    `;

    // Count query
    const countSql = `SELECT COUNT(*) as total FROM (SELECT u.id ${baseSql}) sub`;
    const countResult = await prismaRead().$queryRawUnsafe(countSql, ...params) as any[];
    const total = Number(countResult[0]?.total ?? 0);

    // Data query
    params.push(limit, offset);
    const dataSql = `
      SELECT
        u.id,
        u.email,
        u.username,
        u.status,
        u."createdAt" as "registeredAt",
        u."lastLoginAt",
        MAX(p."createdAt") as "lastPurchaseAt",
        COUNT(DISTINCT p.id)::int as "totalPurchases",
        COALESCE(SUM(p."amountCents"), 0)::int as "totalSpentCents",
        ROUND(AVG(r."testRating")::numeric, 2) as "avgTestRating",
        ROUND(AVG(r."educatorRating")::numeric, 2) as "avgEducatorRating",
        COUNT(DISTINCT ta.id)::int as "totalAttempts",
        COUNT(aa.id)::int as "totalAnswered",
        COUNT(CASE WHEN aa."isCorrect" = true THEN 1 END)::int as "totalCorrect",
        CASE WHEN COUNT(aa.id) > 0
          THEN ROUND((COUNT(CASE WHEN aa."isCorrect" = true THEN 1 END) * 100.0 / COUNT(aa.id))::numeric, 1)
          ELSE NULL
        END as "correctRate"
      ${baseSql}
      ORDER BY ${sortCol} ${sortOrder} NULLS LAST
      LIMIT $${pIdx} OFFSET $${pIdx + 1}
    `;

    const rows = await prismaRead().$queryRawUnsafe(dataSql, ...params) as any[];
    const items: CandidateReportItem[] = rows.map(r => ({
      id: r.id,
      email: r.email,
      username: r.username,
      status: r.status,
      registeredAt: r.registeredAt,
      lastLoginAt: r.lastLoginAt ?? null,
      lastPurchaseAt: r.lastPurchaseAt ?? null,
      totalPurchases: Number(r.totalPurchases),
      totalSpentCents: Number(r.totalSpentCents),
      avgTestRating: r.avgTestRating != null ? Number(r.avgTestRating) : null,
      avgEducatorRating: r.avgEducatorRating != null ? Number(r.avgEducatorRating) : null,
      totalAttempts: Number(r.totalAttempts),
      totalAnswered: Number(r.totalAnswered),
      totalCorrect: Number(r.totalCorrect),
      correctRate: r.correctRate != null ? Number(r.correctRate) : null,
    }));

    // Tünel + yazılı satın almaları da harcama/adet toplamına ekle (DB ile tutarlı).
    // Ham SQL paket purchase'ları sayıyor; bunları JS'te birleştiriyoruz (SQL'i bozmadan).
    const candIds = items.map((i) => i.id);
    if (candIds.length) {
      const read = prismaRead();
      const [tp, wp] = await Promise.all([
        read.tunnelPurchase.groupBy({ by: ['candidateId'], where: { candidateId: { in: candIds }, status: 'ACTIVE' }, _count: { _all: true }, _sum: { amountCents: true } }),
        read.writtenPurchase.groupBy({ by: ['candidateId'], where: { candidateId: { in: candIds }, status: 'ACTIVE' }, _count: { _all: true }, _sum: { amountCents: true } }),
      ]);
      const extra = new Map<string, { c: number; s: number }>();
      for (const g of [...tp, ...wp]) {
        const cur = extra.get(g.candidateId) ?? { c: 0, s: 0 };
        cur.c += g._count._all;
        cur.s += g._sum.amountCents ?? 0;
        extra.set(g.candidateId, cur);
      }
      for (const it of items) {
        const e = extra.get(it.id);
        if (e) { it.totalPurchases += e.c; it.totalSpentCents += e.s; }
      }
    }

    return { items, total };
  }
}
