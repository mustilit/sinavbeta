import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import { ensureEducatorActive } from '../../policies/ensureEducatorActive';
import type { IUserRepository } from '../../../domain/interfaces/IUserRepository';

/** FR-E-06: Eğitici satış ve çözülme raporları */
export class GetEducatorSalesReportUseCase {
  constructor(private readonly userRepo: IUserRepository) {}

  async execute(educatorId: string) {
    const user = await this.userRepo.findById(educatorId);
    if (!user) throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    ensureEducatorActive(user);

    const [testIds, tunnelAgg] = await Promise.all([
      prisma.examTest.findMany({ where: { educatorId }, select: { id: true } }).then((r) => r.map((t) => t.id)),
      // Tünel satışları (paket gibi gelir) — eğiticinin tünellerine ACTIVE satın almalar
      prisma.tunnelPurchase.aggregate({
        where: { status: 'ACTIVE', tunnel: { educatorId } },
        _count: true,
        _sum: { amountCents: true },
      }),
    ]);
    const tunnelPurchaseCount = tunnelAgg._count ?? 0;
    const tunnelRevenueCents = tunnelAgg._sum.amountCents ?? 0;

    // Yazılı paket satışları (written modülü scalar — educatorId writtenPackage'da).
    const writtenPkgIds = await prisma.writtenPackage
      .findMany({ where: { educatorId }, select: { id: true } })
      .then((r) => r.map((p) => p.id));
    const writtenAgg = writtenPkgIds.length
      ? await prisma.writtenPurchase.aggregate({
          where: { status: 'ACTIVE', packageId: { in: writtenPkgIds } },
          _count: true,
          _sum: { amountCents: true },
        })
      : { _count: 0, _sum: { amountCents: 0 } };
    const writtenPurchaseCount = writtenAgg._count ?? 0;
    const writtenRevenueCents = writtenAgg._sum.amountCents ?? 0;

    if (testIds.length === 0) {
      return {
        totalPurchases: tunnelPurchaseCount + writtenPurchaseCount,
        totalRevenueCents: tunnelRevenueCents + writtenRevenueCents,
        totalAttempts: 0,
        totalObjections: 0,
        objectionsResolved: 0,
        objectionsEscalated: 0,
        objectionsOpen: 0,
        tunnelPurchaseCount,
        tunnelRevenueCents,
        writtenPurchaseCount,
        writtenRevenueCents,
        byTest: [],
      };
    }

    const [purchases, attempts, objections] = await Promise.all([
      prisma.purchase.aggregate({
        where: { testId: { in: testIds }, status: 'ACTIVE' },
        _count: true,
        _sum: { amountCents: true },
      }),
      prisma.testAttempt.count({
        where: { testId: { in: testIds }, status: 'SUBMITTED' },
      }),
      prisma.objection.findMany({
        where: {
          attempt: { testId: { in: testIds } },
        },
        select: { status: true, escalatedAt: true },
      }),
    ]);

    const objectionsByStatus = {
      open: objections.filter((o) => o.status === 'OPEN').length,
      resolved: objections.filter((o) => o.status === 'ANSWERED').length,
      escalated: objections.filter((o) => o.escalatedAt != null).length,
    };

    const byTest = await Promise.all(
      testIds.map(async (testId) => {
        const [p, a, objTotal, objResolved] = await Promise.all([
          prisma.purchase.aggregate({
            where: { testId, status: 'ACTIVE' },
            _count: true,
            _sum: { amountCents: true },
          }),
          prisma.testAttempt.count({ where: { testId, status: 'SUBMITTED' } }),
          prisma.objection.count({ where: { attempt: { testId } } }),
          prisma.objection.count({ where: { attempt: { testId }, status: 'ANSWERED' } }),
        ]);
        const test = await prisma.examTest.findUnique({
          where: { id: testId },
          select: { title: true },
        });
        return {
          testId,
          title: test?.title ?? '',
          purchaseCount: p._count,
          revenueCents: p._sum.amountCents ?? 0,
          attemptCount: a,
          objectionCount: objTotal,
          objectionsResolved: objResolved,
        };
      }),
    );

    return {
      // Toplamlar tünel + yazılı satışlarını da içerir (paket gibi gelir sayılır)
      totalPurchases: purchases._count + tunnelPurchaseCount + writtenPurchaseCount,
      totalRevenueCents: (purchases._sum.amountCents ?? 0) + tunnelRevenueCents + writtenRevenueCents,
      totalAttempts: attempts,
      totalObjections: objections.length,
      objectionsResolved: objectionsByStatus.resolved,
      objectionsEscalated: objectionsByStatus.escalated,
      objectionsOpen: objectionsByStatus.open,
      tunnelPurchaseCount,
      tunnelRevenueCents,
      writtenPurchaseCount,
      writtenRevenueCents,
      byTest,
    };
  }
}
