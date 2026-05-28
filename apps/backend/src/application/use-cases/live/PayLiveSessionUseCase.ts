import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';

/**
 * PayLiveSessionUseCase — Eğitici canlı test oturumunu öder.
 *
 * Sprint 15 #4: Platform promo kodu desteği eklendi. Eğitici opsiyonel olarak
 * `promoCode` gönderebilir; backend race-condition korumalı şekilde:
 *   1. Promo kodu validate eder (PROMO_NOT_FOUND/INACTIVE/EXPIRED/EXHAUSTED/SCOPE)
 *   2. usedCount++ atomik (lt: maxUses kontrolü dahil)
 *   3. PlatformPromoCodeUsage kaydı oluşturur (unique [promoCodeId, purchaseId])
 *   4. LiveSession.paidCents + platformPromoCodeId + discountCents snapshot yazılır
 * Hepsi tek `$transaction` içinde.
 *
 * promoCode null/undefined ise klasik akış: tier fiyatından tam ödeme.
 */
export class PayLiveSessionUseCase {
  async execute(sessionId: string, educatorId: string, promoCode?: string) {
    const session = await prisma.liveSession.findUnique({
      where: { id: sessionId },
      include: { tier: true },
    });
    if (!session) throw new AppError('SESSION_NOT_FOUND', 'Live session not found', 404);
    if (session.educatorId !== educatorId)
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Not your session' });
    if (session.paidAt)
      throw new BadRequestException({ code: 'ALREADY_PAID', message: 'Session is already paid' });
    if (session.status === 'ENDED')
      throw new BadRequestException({ code: 'SESSION_ENDED', message: 'Session has ended' });

    // Tier fiyatı baz alınır; tier yoksa eski davranış (0 ödeme).
    const basePriceCents = (session as any).tier?.priceCents ?? 0;

    // Sprint 15 #4 — Promo kodu uygulanmışsa atomik validate + apply.
    if (promoCode) {
      const code = promoCode.trim().toUpperCase();
      return prisma.$transaction(async (tx) => {
        const promo = await tx.platformPromoCode.findUnique({ where: { code } });
        if (!promo) throw new AppError('PROMO_NOT_FOUND', 'Promo kodu bulunamadı', 404);
        if (!promo.isActive)
          throw new AppError('PROMO_NOT_ACTIVE', 'Promo kodu pasif', 409);
        if (!promo.scopes.includes('LIVE_SESSION'))
          throw new AppError('PROMO_SCOPE_MISMATCH', 'Bu kod canlı test için geçerli değil', 409);
        const now = new Date();
        if (promo.validFrom && promo.validFrom > now)
          throw new AppError('PROMO_OUT_OF_WINDOW', 'Promo kodu henüz aktif değil', 409);
        if (promo.validUntil && promo.validUntil < now)
          throw new AppError('PROMO_OUT_OF_WINDOW', 'Promo kodunun süresi dolmuş', 409);

        // Race-safe usedCount artırma: maxUses tanımlıysa updateMany ile lt kontrolü.
        // (DiscountCode usage pattern'inin aynısı — PurchaseUseCase'ten.)
        if (promo.maxUses != null) {
          const updated = await tx.platformPromoCode.updateMany({
            where: { id: promo.id, usedCount: { lt: promo.maxUses } },
            data: { usedCount: { increment: 1 } },
          });
          if (updated.count === 0) {
            throw new AppError(
              'PROMO_USAGE_EXHAUSTED',
              'Promo kodu kullanım hakkı tükendi',
              409,
            );
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

        // Usage kaydı — unique [promoCodeId, purchaseId] çift kullanım engelleyici.
        await tx.platformPromoCodeUsage.create({
          data: {
            promoCodeId: promo.id,
            educatorId,
            purchaseType: 'LIVE_SESSION',
            purchaseId: sessionId,
            discountCents,
          },
        });

        return tx.liveSession.update({
          where: { id: sessionId },
          data: {
            paidAt: new Date(),
            paidCents,
            platformPromoCodeId: promo.id,
            platformPromoDiscountCents: discountCents,
          } as any,
        });
      });
    }

    // Promo yok — klasik akış. paidCents tier fiyatına eşit.
    return prisma.liveSession.update({
      where: { id: sessionId },
      data: {
        paidAt: new Date(),
        paidCents: basePriceCents,
      } as any,
    });
  }
}
