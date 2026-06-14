import { Injectable } from '@nestjs/common';
import type { AdminSettings } from '../../../domain/types';
import { AuditLogger, AuditContext } from '../../../infrastructure/audit/AuditLogger';
import { logger } from '../../../infrastructure/logger/logger';
import { TurnstileVerifier } from '../../services/security/TurnstileVerifier';
import { encryptStoredSecret } from '../../services/security/SecretsVault';

type AdminSettingsPrisma = {
  adminSettings: {
    upsert: (args: any) => Promise<any>;
    findUnique?: (args: any) => Promise<any>;
  };
  $executeRaw?: (query: TemplateStringsArray, ...values: any[]) => Promise<any>;
  $queryRaw?: (query: TemplateStringsArray, ...values: any[]) => Promise<any>;
};

export interface UpdateAdminSettingsInput {
  commissionPercent?: number;
  vatPercent?: number;
  purchasesEnabled?: boolean;
  packageCreationEnabled?: boolean;
  testPublishingEnabled?: boolean;
  testAttemptsEnabled?: boolean;
  adPurchasesEnabled?: boolean;
  twoFactorSystemEnabled?: boolean;
  minPackagePriceCents?: number;
  maxDiscountPercent?: number;
  googleClientId?: string | null;
  turnstileSiteKey?: string | null;
  turnstileSecretKey?: string | null;
  minQuestionsPerTest?: number;
  maxQuestionsPerTest?: number;
  maxTestsPerPackage?: number;
  maxLiveQuestions?: number;
  maxLayersPerTunnel?: number;
  minQuestionsPerLayer?: number;
  maxQuestionsPerLayer?: number;
  tunnelAdvanceStreak?: number;
  tunnelOptionsPerQuestion?: number;
}

/**
 * FR-Y-06: Komisyon + KDV + feature flag ayarlari.
 *
 * Audit: Her degisiklik (before/after diff) ADMIN_SETTINGS_UPDATED audit log'a
 * yazilir. `audit` constructor'da verilmezse fallback olarak structured logger'a
 * yazilir (geriye donuk uyumluluk icin opsiyonel birakildi).
 */
@Injectable()
export class UpdateAdminSettingsUseCase {
  constructor(private readonly audit?: AuditLogger) {}

  async execute(
    prisma: AdminSettingsPrisma,
    input: UpdateAdminSettingsInput,
    ctx?: AuditContext,
  ): Promise<AdminSettings> {
    // 1) Audit "before" snapshot — degisiklik oncesi durumu yakala
    const before = await this.snapshot(prisma);

    // minPackagePriceCents Prisma client'in eski surumunde tanimsiz olabilir;
    // guvenli yol: once normal upsert, sonra raw SQL ile guncelle.
    const row = await prisma.adminSettings.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        commissionPercent: input.commissionPercent ?? 20,
        vatPercent: input.vatPercent ?? 18,
        purchasesEnabled: input.purchasesEnabled ?? true,
        packageCreationEnabled: input.packageCreationEnabled ?? true,
        testPublishingEnabled: input.testPublishingEnabled ?? true,
        testAttemptsEnabled: input.testAttemptsEnabled ?? true,
        adPurchasesEnabled: input.adPurchasesEnabled ?? true,
        twoFactorSystemEnabled: input.twoFactorSystemEnabled ?? false,
      },
      update: {
        ...(input.commissionPercent !== undefined && { commissionPercent: input.commissionPercent }),
        ...(input.vatPercent !== undefined && { vatPercent: input.vatPercent }),
        ...(input.purchasesEnabled !== undefined && { purchasesEnabled: input.purchasesEnabled }),
        ...(input.packageCreationEnabled !== undefined && { packageCreationEnabled: input.packageCreationEnabled }),
        ...(input.testPublishingEnabled !== undefined && { testPublishingEnabled: input.testPublishingEnabled }),
        ...(input.testAttemptsEnabled !== undefined && { testAttemptsEnabled: input.testAttemptsEnabled }),
        ...(input.adPurchasesEnabled !== undefined && { adPurchasesEnabled: input.adPurchasesEnabled }),
        ...(input.twoFactorSystemEnabled !== undefined && { twoFactorSystemEnabled: input.twoFactorSystemEnabled }),
      },
    });

    // minPackagePriceCents ve yeni limit alanlari icin raw SQL — Prisma client versiyonundan bagimsiz
    if (prisma.$executeRaw) {
      if (input.minPackagePriceCents !== undefined) {
        await prisma.$executeRaw`
          UPDATE admin_settings
          SET "minPackagePriceCents" = ${input.minPackagePriceCents}
          WHERE id = 1
        `;
      }
      if (input.maxDiscountPercent !== undefined) {
        await prisma.$executeRaw`
          UPDATE admin_settings SET "maxDiscountPercent" = ${input.maxDiscountPercent} WHERE id = 1
        `;
      }
      if (input.googleClientId !== undefined) {
        // Boş string'i NULL'a çevir — Google ile giriş'i kapatmak için kullanılır
        const val = input.googleClientId && input.googleClientId.trim() ? input.googleClientId.trim() : null;
        await prisma.$executeRaw`
          UPDATE admin_settings SET "googleClientId" = ${val} WHERE id = 1
        `;
      }
      if (input.turnstileSiteKey !== undefined) {
        // Boş string → NULL (CAPTCHA devre dışı kalır)
        const val = input.turnstileSiteKey && input.turnstileSiteKey.trim() ? input.turnstileSiteKey.trim() : null;
        await prisma.$executeRaw`
          UPDATE admin_settings SET "turnstileSiteKey" = ${val} WHERE id = 1
        `;
      }
      if (input.turnstileSecretKey !== undefined) {
        // Gizli alan — AES-GCM ile şifrelenerek saklanır. SecretsVault prefix
        // ile (enc:v1:...) işaretler; decrypt sadece backend tarafında olur.
        const val = encryptStoredSecret(input.turnstileSecretKey);
        await prisma.$executeRaw`
          UPDATE admin_settings SET "turnstileSecretKey" = ${val} WHERE id = 1
        `;
        TurnstileVerifier.invalidateCache();
      }
      if (input.minQuestionsPerTest !== undefined) {
        await prisma.$executeRaw`
          UPDATE admin_settings SET "minQuestionsPerTest" = ${input.minQuestionsPerTest} WHERE id = 1
        `;
      }
      if (input.maxQuestionsPerTest !== undefined) {
        await prisma.$executeRaw`
          UPDATE admin_settings SET "maxQuestionsPerTest" = ${input.maxQuestionsPerTest} WHERE id = 1
        `;
      }
      if (input.maxTestsPerPackage !== undefined) {
        await prisma.$executeRaw`
          UPDATE admin_settings SET "maxTestsPerPackage" = ${input.maxTestsPerPackage} WHERE id = 1
        `;
      }
      if (input.maxLiveQuestions !== undefined) {
        await prisma.$executeRaw`
          UPDATE admin_settings SET "maxLiveQuestions" = ${input.maxLiveQuestions} WHERE id = 1
        `;
      }
      // Tünel limitleri
      if (input.maxLayersPerTunnel !== undefined) {
        await prisma.$executeRaw`UPDATE admin_settings SET "maxLayersPerTunnel" = ${input.maxLayersPerTunnel} WHERE id = 1`;
      }
      if (input.minQuestionsPerLayer !== undefined) {
        await prisma.$executeRaw`UPDATE admin_settings SET "minQuestionsPerLayer" = ${input.minQuestionsPerLayer} WHERE id = 1`;
      }
      if (input.maxQuestionsPerLayer !== undefined) {
        await prisma.$executeRaw`UPDATE admin_settings SET "maxQuestionsPerLayer" = ${input.maxQuestionsPerLayer} WHERE id = 1`;
      }
      if (input.tunnelAdvanceStreak !== undefined) {
        await prisma.$executeRaw`UPDATE admin_settings SET "tunnelAdvanceStreak" = ${input.tunnelAdvanceStreak} WHERE id = 1`;
      }
      if (input.tunnelOptionsPerQuestion !== undefined) {
        await prisma.$executeRaw`UPDATE admin_settings SET "tunnelOptionsPerQuestion" = ${input.tunnelOptionsPerQuestion} WHERE id = 1`;
      }
    }

    // Guncel degerleri raw okuyarak dondur
    let minPackagePriceCents = 100;
    let maxDiscountPercent = 50;
    let googleClientId: string | null = null;
    let turnstileSiteKey: string | null = null;
    let turnstileSecretKey: string | null = null;
    let minQuestionsPerTest = 1;
    let maxQuestionsPerTest = 100;
    let maxTestsPerPackage = 10;
    let maxLiveQuestions = 50;

    if (prisma.$queryRaw) {
      const result = await prisma.$queryRaw`
        SELECT "minPackagePriceCents", "maxDiscountPercent", "googleClientId", "turnstileSiteKey", "turnstileSecretKey", "minQuestionsPerTest", "maxQuestionsPerTest", "maxTestsPerPackage", "maxLiveQuestions"
        FROM admin_settings WHERE id = 1
      ` as any[];
      const r = result[0];
      minPackagePriceCents = r?.minPackagePriceCents ?? 100;
      maxDiscountPercent = r?.maxDiscountPercent ?? 50;
      googleClientId = r?.googleClientId ?? null;
      turnstileSiteKey = r?.turnstileSiteKey ?? null;
      turnstileSecretKey = r?.turnstileSecretKey ?? null;
      minQuestionsPerTest = r?.minQuestionsPerTest ?? 1;
      maxQuestionsPerTest = r?.maxQuestionsPerTest ?? 100;
      maxTestsPerPackage = r?.maxTestsPerPackage ?? 10;
      maxLiveQuestions = r?.maxLiveQuestions ?? 50;
    } else {
      minPackagePriceCents = (row as any).minPackagePriceCents ?? 100;
      maxDiscountPercent = (row as any).maxDiscountPercent ?? 50;
      googleClientId = (row as any).googleClientId ?? null;
      turnstileSiteKey = (row as any).turnstileSiteKey ?? null;
      turnstileSecretKey = (row as any).turnstileSecretKey ?? null;
      minQuestionsPerTest = (row as any).minQuestionsPerTest ?? 1;
      maxQuestionsPerTest = (row as any).maxQuestionsPerTest ?? 100;
      maxTestsPerPackage = (row as any).maxTestsPerPackage ?? 10;
      maxLiveQuestions = (row as any).maxLiveQuestions ?? 50;
    }

    const after: AdminSettings = {
      commissionPercent: row.commissionPercent,
      vatPercent: row.vatPercent,
      purchasesEnabled: row.purchasesEnabled,
      packageCreationEnabled: row.packageCreationEnabled ?? true,
      testPublishingEnabled: row.testPublishingEnabled ?? true,
      testAttemptsEnabled: row.testAttemptsEnabled ?? true,
      adPurchasesEnabled: (row as any).adPurchasesEnabled ?? true,
      twoFactorSystemEnabled: (row as any).twoFactorSystemEnabled ?? false,
      minPackagePriceCents,
      maxDiscountPercent,
      googleClientId,
      turnstileSiteKey,
      turnstileSecretKey,
      minQuestionsPerTest,
      maxQuestionsPerTest,
      maxTestsPerPackage,
      maxLiveQuestions,
      maxLayersPerTunnel: (row as any).maxLayersPerTunnel ?? 7,
      minQuestionsPerLayer: (row as any).minQuestionsPerLayer ?? 10,
      maxQuestionsPerLayer: (row as any).maxQuestionsPerLayer ?? 50,
      tunnelAdvanceStreak: (row as any).tunnelAdvanceStreak ?? 10,
      tunnelOptionsPerQuestion: (row as any).tunnelOptionsPerQuestion ?? 10,
    };

    // 2) Audit: degisen alanlari diff'le ve ADMIN_SETTINGS_UPDATED yaz
    const changed = diffSettings(before, after);
    this.writeAuditLog(ctx, before, after, changed, input);

    return after;
  }

  /** Mevcut admin_settings satirini oku. Yoksa null doner — ilk insert. */
  private async snapshot(prisma: AdminSettingsPrisma): Promise<AdminSettings | null> {
    if (!prisma.adminSettings.findUnique) return null;
    try {
      const row = await prisma.adminSettings.findUnique({ where: { id: 1 } });
      if (!row) return null;
      let mpp = 100;
      let mdp = 50;
      let gci: string | null = null;
      let tsk: string | null = null;
      let tssk: string | null = null;
      let minQ = 1;
      let maxQ = 100;
      let maxTpp = 10;
      let maxLq = 50;
      if (prisma.$queryRaw) {
        const r = await prisma.$queryRaw`
          SELECT "minPackagePriceCents", "maxDiscountPercent", "googleClientId", "turnstileSiteKey", "turnstileSecretKey", "minQuestionsPerTest", "maxQuestionsPerTest",
                 "maxTestsPerPackage", "maxLiveQuestions"
          FROM admin_settings WHERE id = 1
        ` as any[];
        mpp = r[0]?.minPackagePriceCents ?? 100;
        mdp = r[0]?.maxDiscountPercent ?? 50;
        gci = r[0]?.googleClientId ?? null;
        tsk = r[0]?.turnstileSiteKey ?? null;
        tssk = r[0]?.turnstileSecretKey ?? null;
        minQ = r[0]?.minQuestionsPerTest ?? 1;
        maxQ = r[0]?.maxQuestionsPerTest ?? 100;
        maxTpp = r[0]?.maxTestsPerPackage ?? 10;
        maxLq = r[0]?.maxLiveQuestions ?? 50;
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
        minPackagePriceCents: mpp,
        maxDiscountPercent: mdp,
        googleClientId: gci,
        turnstileSiteKey: tsk,
        turnstileSecretKey: tssk,
        minQuestionsPerTest: minQ,
        maxQuestionsPerTest: maxQ,
        maxTestsPerPackage: maxTpp,
        maxLiveQuestions: maxLq,
        maxLayersPerTunnel: (row as any).maxLayersPerTunnel ?? 7,
        minQuestionsPerLayer: (row as any).minQuestionsPerLayer ?? 10,
        maxQuestionsPerLayer: (row as any).maxQuestionsPerLayer ?? 50,
        tunnelAdvanceStreak: (row as any).tunnelAdvanceStreak ?? 10,
        tunnelOptionsPerQuestion: (row as any).tunnelOptionsPerQuestion ?? 10,
      };
    } catch (err) {
      // Snapshot fail — audit eksik kalsin ama akis patlamasin
      logger.warn('admin-settings: before snapshot failed', {
        err: (err as Error).message,
      });
      return null;
    }
  }

  private writeAuditLog(
    ctx: AuditContext | undefined,
    before: AdminSettings | null,
    after: AdminSettings,
    changed: Record<string, { before: unknown; after: unknown }>,
    rawInput: UpdateAdminSettingsInput,
  ): void {
    // Hicbir alan gercekten degismediyse de log yaz — audit gorunurlugu icin
    // kullanicinin PATCH attigi bilinmeli (deneme/regresyon tespiti).
    logger.info('admin.settings.updated', {
      requestId: (ctx as any)?.requestId,
      actorId: ctx?.userId,
      changedFields: Object.keys(changed),
      requestedFields: Object.keys(rawInput),
    });

    if (this.audit) {
      this.audit.logAsync(ctx ?? {}, {
        action: 'ADMIN_SETTINGS_UPDATED',
        entityType: 'AdminSettings',
        entityId: '1',
        before: before ?? undefined,
        after,
        metadata: {
          changedFields: Object.keys(changed),
          diff: changed,
        },
      });
    }
  }
}

/** Duz objeleri shallow karsilastirir, degisen alanlari donderir. */
function diffSettings(
  before: AdminSettings | null,
  after: AdminSettings,
): Record<string, { before: unknown; after: unknown }> {
  const diff: Record<string, { before: unknown; after: unknown }> = {};
  if (!before) {
    // Ilk insert — tum alanlar "yeni"
    for (const k of Object.keys(after) as Array<keyof AdminSettings>) {
      diff[k as string] = { before: undefined, after: after[k] };
    }
    return diff;
  }
  for (const k of Object.keys(after) as Array<keyof AdminSettings>) {
    if (before[k] !== after[k]) {
      diff[k as string] = { before: before[k], after: after[k] };
    }
  }
  return diff;
}
