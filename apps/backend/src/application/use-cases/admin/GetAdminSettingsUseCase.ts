import { Injectable } from '@nestjs/common';
import type { AdminSettings } from '../../../domain/types';
import { maskStoredSecret } from '../../services/security/SecretsVault';

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
        twoFactorSystemEnabled: false,
        minPackagePriceCents: 100,
        minTunnelPriceCents: 0,
        maxDiscountPercent: 50,
        googleClientId: null,
        turnstileSiteKey: null,
        turnstileSecretKey: null,
        minQuestionsPerTest: 1,
        maxQuestionsPerTest: 100,
        maxTestsPerPackage: 10,
        maxLiveQuestions: 50,
        maxLayersPerTunnel: 7,
        minQuestionsPerLayer: 10,
        maxQuestionsPerLayer: 50,
        tunnelAdvanceStreak: 10,
        tunnelOptionsPerQuestion: 10,
      };
    }

    // Raw okuma — Prisma client güncellenmemiş olabilir
    let minPackagePriceCents = 100;
    let maxDiscountPercent = 50;
    let googleClientId: string | null = null;
    let turnstileSiteKey: string | null = null;
    let turnstileSecretKey: string | null = null;
    if (prisma.$queryRaw) {
      const result = await prisma.$queryRaw`SELECT "minPackagePriceCents", "maxDiscountPercent", "googleClientId", "turnstileSiteKey", "turnstileSecretKey" FROM admin_settings WHERE id = 1` as any[];
      minPackagePriceCents = result[0]?.minPackagePriceCents ?? 100;
      maxDiscountPercent = result[0]?.maxDiscountPercent ?? 50;
      googleClientId = result[0]?.googleClientId ?? null;
      turnstileSiteKey = result[0]?.turnstileSiteKey ?? null;
      turnstileSecretKey = result[0]?.turnstileSecretKey ?? null;
    } else {
      minPackagePriceCents = (row as any).minPackagePriceCents ?? 100;
      maxDiscountPercent = (row as any).maxDiscountPercent ?? 50;
      googleClientId = (row as any).googleClientId ?? null;
      turnstileSiteKey = (row as any).turnstileSiteKey ?? null;
      turnstileSecretKey = (row as any).turnstileSecretKey ?? null;
    }

    return {
      commissionPercent: row.commissionPercent ?? 20,
      vatPercent: row.vatPercent ?? 18,
      purchasesEnabled: row.purchasesEnabled ?? true,
      packageCreationEnabled: row.packageCreationEnabled ?? true,
      testPublishingEnabled: row.testPublishingEnabled ?? true,
      testAttemptsEnabled: row.testAttemptsEnabled ?? true,
      adPurchasesEnabled: (row as any).adPurchasesEnabled ?? true,
      twoFactorSystemEnabled: (row as any).twoFactorSystemEnabled ?? false,
      minPackagePriceCents,
      minTunnelPriceCents: (row as any).minTunnelPriceCents ?? 0,
      maxDiscountPercent,
      googleClientId,
      turnstileSiteKey,
      // turnstileSecretKey gizlidir — UI'a yalnızca maskelenmiş gösterilir
      // ("0x4A•••ABCD"). Backend kendi içinde TurnstileVerifier üzerinden
      // gerçek değeri decrypt edip kullanır; admin endpoint'i asla plain
      // döndürmez (DB sızıntısı + log sızıntısı yüzeyini daraltır).
      turnstileSecretKey: maskStoredSecret(turnstileSecretKey).masked || null,
      minQuestionsPerTest: (row as any).minQuestionsPerTest ?? 1,
      maxQuestionsPerTest: (row as any).maxQuestionsPerTest ?? 100,
      maxTestsPerPackage: (row as any).maxTestsPerPackage ?? 10,
      maxLiveQuestions: (row as any).maxLiveQuestions ?? 50,
      maxLayersPerTunnel: (row as any).maxLayersPerTunnel ?? 7,
      minQuestionsPerLayer: (row as any).minQuestionsPerLayer ?? 10,
      maxQuestionsPerLayer: (row as any).maxQuestionsPerLayer ?? 50,
      tunnelAdvanceStreak: (row as any).tunnelAdvanceStreak ?? 10,
      tunnelOptionsPerQuestion: (row as any).tunnelOptionsPerQuestion ?? 10,
    };
  }
}
