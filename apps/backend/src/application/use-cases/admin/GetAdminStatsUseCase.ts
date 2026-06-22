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
    // Kaynak kırılımı (paket + tünel + yazılı) — gelir raporu için
    packageSales: number;
    packageRevenueCents: number;
    tunnelSales: number;
    tunnelRevenueCents: number;
    writtenSales: number;
    writtenRevenueCents: number;
  };
}

@Injectable()
export class GetAdminStatsUseCase {
  async execute(): Promise<AdminStats> {
    const [
      totalUsers,
      candidates,
      educators,
      totalPackages,
      publishedPackages,
      totalSales,
      revenueAggregate,
      tunnelAgg,
      writtenAgg,
    ] = await Promise.all([
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
      // Tünel + yazılı gelirleri toplam gelire dahil edilir (paket gibi sayılır).
      prisma.tunnelPurchase.aggregate({ _count: true, _sum: { amountCents: true }, where: { status: 'ACTIVE' } }),
      prisma.writtenPurchase.aggregate({ _count: true, _sum: { amountCents: true }, where: { status: 'ACTIVE' } }),
    ]);

    const packageRevenueCents = revenueAggregate._sum.amountCents ?? 0;
    const tunnelSales = tunnelAgg._count ?? 0;
    const tunnelRevenueCents = tunnelAgg._sum.amountCents ?? 0;
    const writtenSales = writtenAgg._count ?? 0;
    const writtenRevenueCents = writtenAgg._sum.amountCents ?? 0;

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
        total: totalSales + tunnelSales + writtenSales,
        totalRevenueCents: packageRevenueCents + tunnelRevenueCents + writtenRevenueCents,
        packageSales: totalSales,
        packageRevenueCents,
        tunnelSales,
        tunnelRevenueCents,
        writtenSales,
        writtenRevenueCents,
      },
    };
  }
}
