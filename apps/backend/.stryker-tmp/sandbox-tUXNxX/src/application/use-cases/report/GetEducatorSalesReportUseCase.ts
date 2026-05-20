// @ts-nocheck
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

    const testIds = await prisma.examTest.findMany({
      where: { educatorId },
      select: { id: true },
    }).then((r) => r.map((t) => t.id));

    if (testIds.length === 0) {
      return {
        totalPurchases: 0,
        totalRevenueCents: 0,
        totalAttempts: 0,
        totalObjections: 0,
        objectionsResolved: 0,
        objectionsEscalated: 0,
        objectionsOpen: 0,
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
      totalPurchases: purchases._count,
      totalRevenueCents: purchases._sum.amountCents ?? 0,
      totalAttempts: attempts,
      totalObjections: objections.length,
      objectionsResolved: objectionsByStatus.resolved,
      objectionsEscalated: objectionsByStatus.escalated,
      objectionsOpen: objectionsByStatus.open,
      byTest,
    };
  }
}
