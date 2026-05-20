// @ts-nocheck
import { prisma } from '../../../infrastructure/database/prisma';
import { BadRequestException } from '@nestjs/common';
import { AppError } from '../../errors/AppError';
import { ensureEducatorActive } from '../../policies/ensureEducatorActive';
import type { IUserRepository } from '../../../domain/interfaces/IUserRepository';
import { getDefaultTenantId } from '../../../common/tenant';

/**
 * FR-E-07: Eğitici reklam paketi satın alır.
 * İki hedef türü desteklenir:
 *   - TEST: Belirli bir yayınlanmış test paketi öne çıkarılır (testId zorunlu)
 *   - EDUCATOR: Eğiticinin kendisi öne çıkarılır (testId opsiyonel)
 *
 * Ön koşullar:
 *   - Eğitici aktif ve onaylı olmalıdır.
 *   - Reklam paketi aktif olmalıdır.
 *   - TEST türünde: test yayınlanmış ve eğiticiye ait olmalıdır.
 */
export class PurchaseAdUseCase {
  constructor(private readonly userRepo: IUserRepository) {}

  /**
   * Reklam satın alma işlemini gerçekleştirir.
   * @param educatorId   - Satın almayı yapan eğiticinin ID'si.
   * @param adPackageId  - Satın alınacak reklam paketinin ID'si.
   * @param testId       - TEST türünde zorunlu; EDUCATOR türünde null.
   * @param targetType   - 'TEST' | 'EDUCATOR'; varsayılan 'TEST'
   */
  async execute(educatorId: string, adPackageId: string, testId: string | null, targetType: 'TEST' | 'EDUCATOR' = 'TEST') {
    // Admin reklam kill-switch kontrolü — false ise satın alma engellenir (fail-open: satır yoksa izin verilir)
    const settings = await prisma.adminSettings.findFirst({ where: { id: 1 } });
    if (settings && (settings as any).adPurchasesEnabled === false) {
      throw new BadRequestException({ code: 'AD_PURCHASES_DISABLED', message: 'Ad purchases are temporarily suspended' });
    }

    const user = await this.userRepo.findById(educatorId);
    if (!user) throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    // Eğitici askıya alınmış veya onaylanmamışsa işlemi engelle
    ensureEducatorActive(user);

    // Reklam paketi mevcut mu?
    const adPackage = await prisma.adPackage.findUnique({ where: { id: adPackageId } });
    if (!adPackage) throw new BadRequestException({ code: 'AD_PACKAGE_NOT_FOUND', message: 'Ad package not found' });
    if (!adPackage.active) throw new BadRequestException({ code: 'AD_PACKAGE_INACTIVE', message: 'Ad package is not active' });

    let resolvedTestId: string | null = null;
    let tenantId: string = getDefaultTenantId();

    if (targetType === 'TEST') {
      // TEST türünde testId zorunlu
      if (!testId) throw new BadRequestException({ code: 'TEST_ID_REQUIRED', message: 'testId is required for TEST type ads' });

      const test = await prisma.examTest.findUnique({ where: { id: testId } });
      if (!test) throw new BadRequestException({ code: 'TEST_NOT_FOUND', message: 'Test not found' });
      // Sadece testin sahibi olan eğitici reklam alabilir
      if (test.educatorId !== educatorId) {
        throw new AppError('FORBIDDEN_NOT_OWNER', 'Only the educator who owns the test can purchase ads for it', 403);
      }
      if ((test as any).status !== 'PUBLISHED') {
        throw new BadRequestException({ code: 'TEST_NOT_PUBLISHED', message: 'Test must be published to purchase ads' });
      }
      resolvedTestId = testId;
      tenantId       = (test as any).tenantId ?? getDefaultTenantId();
    } else {
      // EDUCATOR türünde eğiticinin tenant'ını kullan
      tenantId = (user as any).tenantId ?? getDefaultTenantId();
    }

    // Geçerlilik bitiş tarihi: bugün + paket süresi (gün cinsinden)
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + adPackage.durationDays);

    const purchase = await prisma.adPurchase.create({
      data: {
        tenantId,
        educatorId,
        adPackageId,
        targetType,
        testId:               resolvedTestId,
        validUntil,
        impressionsRemaining: adPackage.impressions,
        impressionsDelivered: 0,
      },
    });

    return {
      id:                   purchase.id,
      targetType:           purchase.targetType,
      adPackageId,
      testId:               resolvedTestId,
      validUntil:           purchase.validUntil,
      impressionsRemaining: purchase.impressionsRemaining,
      createdAt:            purchase.createdAt,
    };
  }
}
