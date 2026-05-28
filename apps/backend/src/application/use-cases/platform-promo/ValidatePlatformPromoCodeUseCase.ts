import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import type { PlatformPromoScope } from './CreatePlatformPromoCodeUseCase';

/**
 * Sprint 15 #3 — Eğiticinin canlı test / reklam paketi satın almadan ÖNCE
 * platform promo kodunu doğrular. Sadece kontrol — usedCount artırma asıl
 * satın alma use case'inde (PayLiveSessionUseCase / PurchaseAdUseCase)
 * transaction altında yapılır.
 *
 * Geri dönüş:
 *   { id, code, percentOff, discountCents, finalAmountCents, description }
 *
 * Hata kodları:
 *   - PROMO_NOT_FOUND
 *   - PROMO_NOT_ACTIVE
 *   - PROMO_OUT_OF_WINDOW
 *   - PROMO_USAGE_EXHAUSTED
 *   - PROMO_SCOPE_MISMATCH (kod bu purchase tipinde geçerli değil)
 */
export class ValidatePlatformPromoCodeUseCase {
  async execute(input: {
    code: string;
    scope: PlatformPromoScope;
    basePriceCents: number;
  }): Promise<{
    id: string;
    code: string;
    percentOff: number;
    discountCents: number;
    finalAmountCents: number;
    description: string | null;
  }> {
    const code = (input.code ?? '').trim().toUpperCase();
    if (!code || input.basePriceCents == null) {
      throw new AppError('PROMO_NOT_FOUND', 'Promo kodu geçersiz', 400);
    }

    const promo = await prisma.platformPromoCode.findUnique({
      where: { code },
      select: {
        id: true,
        code: true,
        description: true,
        percentOff: true,
        scopes: true,
        maxUses: true,
        usedCount: true,
        validFrom: true,
        validUntil: true,
        isActive: true,
      },
    });
    if (!promo) {
      throw new AppError('PROMO_NOT_FOUND', 'Promo kodu bulunamadı', 404);
    }
    if (!promo.isActive) {
      throw new AppError('PROMO_NOT_ACTIVE', 'Promo kodu pasif', 409);
    }
    if (!promo.scopes.includes(input.scope)) {
      throw new AppError(
        'PROMO_SCOPE_MISMATCH',
        'Bu kod bu satın alma tipinde geçerli değil',
        409,
      );
    }
    const now = new Date();
    if (promo.validFrom && promo.validFrom > now) {
      throw new AppError('PROMO_OUT_OF_WINDOW', 'Promo kodu henüz aktif değil', 409);
    }
    if (promo.validUntil && promo.validUntil < now) {
      throw new AppError('PROMO_OUT_OF_WINDOW', 'Promo kodunun süresi dolmuş', 409);
    }
    if (promo.maxUses != null && promo.usedCount >= promo.maxUses) {
      throw new AppError('PROMO_USAGE_EXHAUSTED', 'Promo kodu kullanım hakkı tükendi', 409);
    }

    const percent = Math.min(Math.max(promo.percentOff, 1), 100);
    const discountCents = Math.floor((input.basePriceCents * percent) / 100);
    const finalAmountCents = Math.max(0, input.basePriceCents - discountCents);

    return {
      id: promo.id,
      code: promo.code,
      percentOff: percent,
      discountCents,
      finalAmountCents,
      description: promo.description,
    };
  }
}
