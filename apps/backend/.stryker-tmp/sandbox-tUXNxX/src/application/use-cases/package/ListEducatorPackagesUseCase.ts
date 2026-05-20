// @ts-nocheck
import { ITestPackageRepository } from '../../../domain/interfaces/ITestPackageRepository';
import { prisma } from '../../../infrastructure/database/prisma';

export class ListEducatorPackagesUseCase {
  constructor(private readonly repo: ITestPackageRepository) {}

  async execute(educatorId: string) {
    const packages = await this.repo.findByEducatorId(educatorId);
    if (packages.length === 0) return packages;

    const packageIds = packages.map((p: any) => p.id);
    const allTestIds: string[] = packages.flatMap((p: any) =>
      (p.tests ?? []).map((t: any) => t.id),
    );

    const [saleRows, ratingRows] = await Promise.all([
      (prisma.purchase as any).groupBy({
        by: ['packageId'],
        where: { packageId: { in: packageIds }, status: 'ACTIVE' },
        _count: { _all: true },
      }),
      allTestIds.length
        ? prisma.review.groupBy({
            by: ['testId'],
            where: { testId: { in: allTestIds } },
            _avg: { testRating: true },
            _count: { _all: true },
          } as any)
        : [],
    ]);

    const saleByPackageId = new Map<string, number>();
    for (const s of saleRows) {
      if (s.packageId) saleByPackageId.set(s.packageId, s._count._all ?? 0);
    }

    const ratingByTestId = new Map<string, { avg: number; count: number }>();
    for (const r of ratingRows as any[]) {
      ratingByTestId.set(r.testId, { avg: r._avg.testRating ?? 0, count: r._count._all ?? 0 });
    }

    return packages.map((pkg: any) => {
      const tests: any[] = pkg.tests ?? [];
      let ratingSum = 0;
      let ratingCnt = 0;
      for (const t of tests) {
        const r = ratingByTestId.get(t.id);
        if (r && r.count) {
          ratingSum += r.avg * r.count;
          ratingCnt += r.count;
        }
      }
      return {
        ...pkg,
        saleCount: saleByPackageId.get(pkg.id) ?? 0,
        ratingAvg: ratingCnt > 0 ? ratingSum / ratingCnt : null,
        ratingCount: ratingCnt,
      };
    });
  }
}
