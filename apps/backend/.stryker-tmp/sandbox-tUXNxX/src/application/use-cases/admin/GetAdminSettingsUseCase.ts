// @ts-nocheck
import { Injectable } from '@nestjs/common';
import type { AdminSettings } from '../../../domain/types';

/** FR-Y-06: Admin ayarlarını okuma */
@Injectable()
export class GetAdminSettingsUseCase {
  async execute(prisma: {
    adminSettings: { findUnique: (args: any) => Promise<any> };
    $queryRaw?: (query: TemplateStringsArray, ...values: any[]) => Promise<any>;
  }): Promise<AdminSettings> {
    const row = await prisma.adminSettings.findUnique({ where: { id: 1 } });
    if (!row) {
      return {
        commissionPercent: 20,
        vatPercent: 18,
        purchasesEnabled: true,
        packageCreationEnabled: true,
        testPublishingEnabled: true,
        testAttemptsEnabled: true,
        adPurchasesEnabled: true,
        minPackagePriceCents: 100,
        minQuestionsPerTest: 1,
        maxQuestionsPerTest: 100,
        maxTestsPerPackage: 10,
        maxLiveQuestions: 50,
      };
    }

    // minPackagePriceCents Prisma client'ta olmayabilir; raw okuma güvenli yol
    let minPackagePriceCents = 100;
    if (prisma.$queryRaw) {
      const result = await prisma.$queryRaw`SELECT "minPackagePriceCents" FROM admin_settings WHERE id = 1` as any[];
      minPackagePriceCents = result[0]?.minPackagePriceCents ?? 100;
    } else {
      minPackagePriceCents = (row as any).minPackagePriceCents ?? 100;
    }

    return {
      commissionPercent: row.commissionPercent ?? 20,
      vatPercent: row.vatPercent ?? 18,
      purchasesEnabled: row.purchasesEnabled ?? true,
      packageCreationEnabled: row.packageCreationEnabled ?? true,
      testPublishingEnabled: row.testPublishingEnabled ?? true,
      testAttemptsEnabled: row.testAttemptsEnabled ?? true,
      adPurchasesEnabled: (row as any).adPurchasesEnabled ?? true,
      minPackagePriceCents,
      minQuestionsPerTest: (row as any).minQuestionsPerTest ?? 1,
      maxQuestionsPerTest: (row as any).maxQuestionsPerTest ?? 100,
      maxTestsPerPackage: (row as any).maxTestsPerPackage ?? 10,
      maxLiveQuestions: (row as any).maxLiveQuestions ?? 50,
    };
  }
}
