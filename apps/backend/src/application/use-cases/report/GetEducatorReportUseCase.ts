import { prisma } from '../../../infrastructure/database/prisma';

export interface EducatorReportItem {
  id: string;
  email: string;
  username: string;
  status: string;
  registeredAt: Date;
  lastLoginAt: Date | null;
  educatorApprovedAt: Date | null;
  lastPublishedAt: Date | null;
  totalTests: number;
  publishedTests: number;
  totalSales: number;
  totalRevenueCents: number;
  uniqueCandidates: number;
  avgTestRating: number | null;
  avgEducatorRating: number | null;
  totalObjections: number;
  openObjections: number;
  examTypeNames: string | null;
}

export interface EducatorReportFilters {
  q?: string;
  status?: string;
  lastLoginFrom?: string;
  lastLoginTo?: string;
  approvedFrom?: string;
  approvedTo?: string;
  minTests?: number;
  maxTests?: number;
  minSales?: number;
  maxSales?: number;
  minRating?: number;
  maxRating?: number;
  hasOpenObjections?: boolean;
  examTypeId?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  order?: string;
}

export class GetEducatorReportUseCase {
  async execute(filters: EducatorReportFilters = {}): Promise<{ items: EducatorReportItem[]; total: number }> {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(200, Math.max(1, filters.limit ?? 50));
    const offset = (page - 1) * limit;

    const conditions: string[] = [`u.role = 'EDUCATOR'`];
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
    if (filters.approvedFrom) {
      conditions.push(`u."educatorApprovedAt" >= $${pIdx}`);
      params.push(new Date(filters.approvedFrom));
      pIdx++;
    }
    if (filters.approvedTo) {
      conditions.push(`u."educatorApprovedAt" <= $${pIdx}`);
      params.push(new Date(filters.approvedTo));
      pIdx++;
    }
    if (filters.examTypeId) {
      conditions.push(`EXISTS (SELECT 1 FROM exam_tests et2 WHERE et2."educatorId" = u.id AND et2."examTypeId" = $${pIdx} AND et2."deletedAt" IS NULL)`);
      params.push(filters.examTypeId);
      pIdx++;
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // HAVING filters
    const havingConds: string[] = [];
    if (typeof filters.minTests === 'number') havingConds.push(`COUNT(DISTINCT et.id) >= ${filters.minTests}`);
    if (typeof filters.maxTests === 'number') havingConds.push(`COUNT(DISTINCT et.id) <= ${filters.maxTests}`);
    if (typeof filters.minSales === 'number') havingConds.push(`COUNT(DISTINCT p.id) >= ${filters.minSales}`);
    if (typeof filters.maxSales === 'number') havingConds.push(`COUNT(DISTINCT p.id) <= ${filters.maxSales}`);
    if (typeof filters.minRating === 'number') havingConds.push(`AVG(r."testRating") >= ${filters.minRating}`);
    if (typeof filters.maxRating === 'number') havingConds.push(`AVG(r."testRating") <= ${filters.maxRating}`);
    if (filters.hasOpenObjections) havingConds.push(`COUNT(DISTINCT obj.id) FILTER (WHERE obj.status = 'OPEN') > 0`);
    const havingClause = havingConds.length ? `HAVING ${havingConds.join(' AND ')}` : '';

    // Sort mapping
    const sortMap: Record<string, string> = {
      registeredAt: 'u."createdAt"',
      lastLoginAt: 'u."lastLoginAt"',
      lastPublishedAt: 'MAX(et."publishedAt")',
      totalTests: 'COUNT(DISTINCT et.id)',
      publishedTests: `COUNT(DISTINCT et.id) FILTER (WHERE et.status = 'PUBLISHED')`,
      totalSales: 'COUNT(DISTINCT p.id)',
      totalRevenue: 'COALESCE(SUM(p."amountCents"),0)',
      uniqueCandidates: 'COUNT(DISTINCT p."candidateId")',
      avgTestRating: 'AVG(r."testRating")',
      totalObjections: 'COUNT(DISTINCT obj.id)',
    };
    const sortCol = sortMap[filters.sortBy ?? ''] ?? 'u."createdAt"';
    const sortOrder = filters.order === 'asc' ? 'ASC' : 'DESC';

    const baseSql = `
      FROM users u
      LEFT JOIN exam_tests et ON et."educatorId" = u.id AND et."deletedAt" IS NULL
      LEFT JOIN purchases p ON p."testId" = et.id AND p.status = 'ACTIVE' AND p."deletedAt" IS NULL
      LEFT JOIN reviews r ON r."educatorId" = u.id
      LEFT JOIN test_attempts ta ON ta."testId" = et.id
      LEFT JOIN objections obj ON obj."attemptId" = ta.id
      ${whereClause}
      GROUP BY u.id, u.email, u.username, u.status, u."lastLoginAt", u."createdAt", u."educatorApprovedAt"
      ${havingClause}
    `;

    // Count
    const countSql = `SELECT COUNT(*) as total FROM (SELECT u.id ${baseSql}) sub`;
    const countResult = await prisma.$queryRawUnsafe(countSql, ...params) as any[];
    const total = Number(countResult[0]?.total ?? 0);

    // Data
    params.push(limit, offset);
    const dataSql = `
      SELECT
        u.id,
        u.email,
        u.username,
        u.status,
        u."createdAt" as "registeredAt",
        u."lastLoginAt",
        u."educatorApprovedAt",
        MAX(et."publishedAt") as "lastPublishedAt",
        COUNT(DISTINCT et.id)::int as "totalTests",
        COUNT(DISTINCT et.id) FILTER (WHERE et.status = 'PUBLISHED')::int as "publishedTests",
        COUNT(DISTINCT p.id)::int as "totalSales",
        COALESCE(SUM(p."amountCents"), 0)::int as "totalRevenueCents",
        COUNT(DISTINCT p."candidateId")::int as "uniqueCandidates",
        ROUND(AVG(r."testRating")::numeric, 2) as "avgTestRating",
        ROUND(AVG(r."educatorRating")::numeric, 2) as "avgEducatorRating",
        COUNT(DISTINCT obj.id)::int as "totalObjections",
        COUNT(DISTINCT obj.id) FILTER (WHERE obj.status = 'OPEN')::int as "openObjections",
        (
          SELECT STRING_AGG(DISTINCT ext.name, ', ' ORDER BY ext.name)
          FROM exam_tests t2
          JOIN exam_types ext ON ext.id = t2."examTypeId"
          WHERE t2."educatorId" = u.id AND t2."deletedAt" IS NULL
        ) as "examTypeNames"
      ${baseSql}
      ORDER BY ${sortCol} ${sortOrder} NULLS LAST
      LIMIT $${pIdx} OFFSET $${pIdx + 1}
    `;

    const rows = await prisma.$queryRawUnsafe(dataSql, ...params) as any[];
    const items: EducatorReportItem[] = rows.map(r => ({
      id: r.id,
      email: r.email,
      username: r.username,
      status: r.status,
      registeredAt: r.registeredAt,
      lastLoginAt: r.lastLoginAt ?? null,
      educatorApprovedAt: r.educatorApprovedAt ?? null,
      lastPublishedAt: r.lastPublishedAt ?? null,
      totalTests: Number(r.totalTests),
      publishedTests: Number(r.publishedTests),
      totalSales: Number(r.totalSales),
      totalRevenueCents: Number(r.totalRevenueCents),
      uniqueCandidates: Number(r.uniqueCandidates),
      avgTestRating: r.avgTestRating != null ? Number(r.avgTestRating) : null,
      avgEducatorRating: r.avgEducatorRating != null ? Number(r.avgEducatorRating) : null,
      totalObjections: Number(r.totalObjections),
      openObjections: Number(r.openObjections),
      examTypeNames: r.examTypeNames ?? null,
    }));

    // Tünel + yazılı satışlarını da satış/gelir toplamına ekle (DB ile tutarlı;
    // ham SQL yalnız paket purchase'larını sayıyor). TunnelPurchase/WrittenPurchase'ta
    // educatorId yok → tünel/paket üzerinden eğiticiye eşlenir. SQL bozulmaz (JS merge).
    const eduIds = items.map((i) => i.id);
    if (eduIds.length) {
      const [tns, pkgs] = await Promise.all([
        prisma.tunnel.findMany({ where: { educatorId: { in: eduIds } }, select: { id: true, educatorId: true } }),
        prisma.writtenPackage.findMany({ where: { educatorId: { in: eduIds } }, select: { id: true, educatorId: true } }),
      ]);
      const eduByTunnel = new Map(tns.map((t) => [t.id, t.educatorId]));
      const eduByPkg = new Map(pkgs.map((p) => [p.id, p.educatorId]));
      const [tps, wps] = await Promise.all([
        tns.length ? prisma.tunnelPurchase.groupBy({ by: ['tunnelId'], where: { tunnelId: { in: tns.map((t) => t.id) }, status: 'ACTIVE' }, _count: { _all: true }, _sum: { amountCents: true } }) : [],
        pkgs.length ? prisma.writtenPurchase.groupBy({ by: ['packageId'], where: { packageId: { in: pkgs.map((p) => p.id) }, status: 'ACTIVE' }, _count: { _all: true }, _sum: { amountCents: true } }) : [],
      ]);
      const extra = new Map<string, { c: number; s: number }>();
      const add = (edu: string | null | undefined, c: number, s: number) => {
        if (!edu) return;
        const cur = extra.get(edu) ?? { c: 0, s: 0 };
        cur.c += c; cur.s += s; extra.set(edu, cur);
      };
      for (const g of tps) add(eduByTunnel.get(g.tunnelId), g._count._all, g._sum.amountCents ?? 0);
      for (const g of wps) add(eduByPkg.get(g.packageId), g._count._all, g._sum.amountCents ?? 0);
      for (const it of items) {
        const e = extra.get(it.id);
        if (e) { it.totalSales += e.c; it.totalRevenueCents += e.s; }
      }
    }

    return { items, total };
  }
}
