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
   * @param promoCode    - Sprint 15 #4: opsiyonel platform promo (AD_PACKAGE scope).
   *                       Varsa atomik validate + apply + Usage kaydı + AdPurchase snapshot.
   */
  async execute(educatorId: string, adPackageId: string, testId: string | null, targetType: 'TEST' | 'EDUCATOR' | 'WRITTEN' = 'TEST', promoCode?: string, writtenPackageId?: string | null) {
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
    let resolvedWrittenPackageId: string | null = null;
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
    } else if (targetType === 'WRITTEN') {
      // WRITTEN türünde writtenPackageId zorunlu (yazılı modülü scalar — FK YOK)
      if (!writtenPackageId) throw new BadRequestException({ code: 'WRITTEN_PACKAGE_ID_REQUIRED', message: 'writtenPackageId is required for WRITTEN type ads' });

      const pkg = await prisma.writtenPackage.findUnique({ where: { id: writtenPackageId } });
      if (!pkg) throw new BadRequestException({ code: 'WRITTEN_PACKAGE_NOT_FOUND', message: 'Written package not found' });
      if ((pkg as any).educatorId !== educatorId) {
        throw new AppError('FORBIDDEN_NOT_OWNER', 'Only the educator who owns the written package can purchase ads for it', 403);
      }
      if (!(pkg as any).publishedAt || (pkg as any).isActive === false) {
        throw new BadRequestException({ code: 'WRITTEN_PACKAGE_NOT_PUBLISHED', message: 'Written package must be published to purchase ads' });
      }
      resolvedWrittenPackageId = writtenPackageId;
      tenantId                 = (pkg as any).tenantId ?? getDefaultTenantId();
    } else {
      // EDUCATOR türünde eğiticinin tenant'ını kullan
      tenantId = (user as any).tenantId ?? getDefaultTenantId();
    }

    // Geçerlilik bitiş tarihi: bugün + paket süresi (gün cinsinden)
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + adPackage.durationDays);

    // Sprint 15 #4 — Promo kodu opsiyonel uygulama. Atomik:
    //   1) promo validate + usedCount++ (race-safe maxUses kontrolü)
    //   2) AdPurchase create (snapshot alanları dahil)
    //   3) PlatformPromoCodeUsage kaydı
    // Promo yoksa klasik akış: paidCents = adPackage.priceCents (varsa) veya null.
    const basePriceCents = (adPackage as any).priceCents ?? 0;

    if (promoCode) {
      const code = promoCode.trim().toUpperCase();
      const result = await prisma.$transaction(async (tx) => {
        const promo = await tx.platformPromoCode.findUnique({ where: { code } });
        if (!promo) throw new AppError('PROMO_NOT_FOUND', 'Promo kodu bulunamadı', 404);
        if (!promo.isActive)
          throw new AppError('PROMO_NOT_ACTIVE', 'Promo kodu pasif', 409);
        if (!promo.scopes.includes('AD_PACKAGE'))
          throw new AppError('PROMO_SCOPE_MISMATCH', 'Bu kod reklam paketi için geçerli değil', 409);
        const now = new Date();
        if (promo.validFrom && promo.validFrom > now)
          throw new AppError('PROMO_OUT_OF_WINDOW', 'Promo kodu henüz aktif değil', 409);
        if (promo.validUntil && promo.validUntil < now)
          throw new AppError('PROMO_OUT_OF_WINDOW', 'Promo kodunun süresi dolmuş', 409);

        if (promo.maxUses != null) {
          const updated = await tx.platformPromoCode.updateMany({
            where: { id: promo.id, usedCount: { lt: promo.maxUses } },
            data: { usedCount: { increment: 1 } },
          });
          if (updated.count === 0) {
            throw new AppError('PROMO_USAGE_EXHAUSTED', 'Promo kodu kullanım hakkı tükendi', 409);
          }
        } else {
          await tx.platformPromoCode.update({
            where: { id: promo.id },
            data: { usedCount: { increment: 1 } },
          });
        }

        const percent = Math.min(Math.max(promo.percentOff, 1), 100);
        const discountCents = Math.floor((basePriceCents * percent) / 100);
        const paidCents = Math.max(0, basePriceCents - discountCents);

        const purchase = await tx.adPurchase.create({
          data: {
            tenantId,
            educatorId,
            adPackageId,
            targetType,
            testId: resolvedTestId,
            writtenPackageId: resolvedWrittenPackageId,
            validUntil,
            impressionsRemaining: adPackage.impressions,
            impressionsDelivered: 0,
            paidCents,
            platformPromoCodeId: promo.id,
            platformPromoDiscountCents: discountCents,
          } as any,
        });

        await tx.platformPromoCodeUsage.create({
          data: {
            promoCodeId: promo.id,
            educatorId,
            purchaseType: 'AD_PACKAGE',
            purchaseId: purchase.id,
            discountCents,
          },
        });

        return purchase;
      });

      return {
        id:                   result.id,
        targetType:           result.targetType,
        adPackageId,
        testId:               resolvedTestId,
        writtenPackageId:     resolvedWrittenPackageId,
        validUntil:           result.validUntil,
        impressionsRemaining: result.impressionsRemaining,
        createdAt:            result.createdAt,
        paidCents:            (result as any).paidCents,
        platformPromoDiscountCents: (result as any).platformPromoDiscountCents,
      };
    }

    // Promo yok — klasik akış
    const purchase = await prisma.adPurchase.create({
      data: {
        tenantId,
        educatorId,
        adPackageId,
        targetType,
        testId:               resolvedTestId,
        writtenPackageId:     resolvedWrittenPackageId,
        validUntil,
        impressionsRemaining: adPackage.impressions,
        impressionsDelivered: 0,
        paidCents:            basePriceCents,
      } as any,
    });

    return {
      id:                   purchase.id,
      targetType:           purchase.targetType,
      adPackageId,
      testId:               resolvedTestId,
      writtenPackageId:     resolvedWrittenPackageId,
      validUntil:           purchase.validUntil,
      impressionsRemaining: purchase.impressionsRemaining,
      createdAt:            purchase.createdAt,
    };
  }
}
