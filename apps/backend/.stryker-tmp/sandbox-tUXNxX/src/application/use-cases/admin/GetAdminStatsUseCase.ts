// @ts-nocheck
import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { prisma } from '../../../infrastructure/database/prisma';

export interface AdminStats {
  users: {
    total: number;
    candidates: number;
    educators: number;
  };
  packages: {
    total: number;
    published: number;
    draft: number;
  };
  sales: {
    total: number;
    totalRevenueCents: number;
  };
}

@Injectable()
export class GetAdminStatsUseCase {
  async execute(): Promise<AdminStats> {
    const [totalUsers, candidates, educators, totalPackages, publishedPackages, totalSales, revenueAggregate] =
      await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { role: UserRole.CANDIDATE } }),
        prisma.user.count({ where: { role: UserRole.EDUCATOR } }),
        prisma.testPackage.count(),
        prisma.testPackage.count({ where: { publishedAt: { not: null } } }),
        prisma.purchase.count({ where: { status: 'ACTIVE' } }),
        prisma.purchase.aggregate({
          _sum: { amountCents: true },
          where: { status: 'ACTIVE' },
        }),
      ]);

    return {
      users: {
        total: totalUsers,
        candidates,
        educators,
      },
      packages: {
        total: totalPackages,
        published: publishedPackages,
        draft: totalPackages - publishedPackages,
      },
      sales: {
        total: totalSales,
        totalRevenueCents: revenueAggregate._sum.amountCents ?? 0,
      },
    };
  }
}
