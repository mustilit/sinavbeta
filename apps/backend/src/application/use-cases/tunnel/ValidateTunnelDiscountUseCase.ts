import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';

const EDUCATOR_MAX_PERCENT = 50;

/**
 * Aday tünel satın almadan önce indirim kodunu önizleme amaçlı doğrular (sayaç
 * artırMAZ — asıl uygulama PurchaseTunnelUseCase transaction'ında). Kapsam +
 * clamp PurchaseTunnelUseCase ile birebir: global kod (createdById=null) clamp
 * yok; eğitici kodu (createdById=tunnel.educatorId) %50 üst sınır.
 * Dönüş paket validate ile aynı: { code, percentOff, discountCents, finalAmountCents, description }.
 */
export class ValidateTunnelDiscountUseCase {
  async execute(input: { code: string; tunnelId: string }): Promise<{
    code: string;
    percentOff: number;
    discountCents: number;
    finalAmountCents: number;
    description: string | null;
  }> {
    const code = (input.code ?? '').trim().toUpperCase();
    if (!code || !input.tunnelId) throw new AppError('DISCOUNT_NOT_FOUND', 'Geçersiz indirim kodu', 400);

    const tunnel = await prisma.tunnel.findUnique({
      where: { id: input.tunnelId },
      select: { id: true, educatorId: true, status: true, priceCents: true },
    });
    if (!tunnel || tunnel.status !== 'PUBLISHED') throw new AppError('TUNNEL_NOT_FOUND', 'Tünel bulunamadı', 404);

    const dc = await prisma.discountCode.findFirst({
      where: { code: { equals: code, mode: 'insensitive' } },
      select: { code: true, description: true, percentOff: true, maxUses: true, usedCount: true, validFrom: true, validUntil: true, isActive: true, createdById: true },
    });
    if (!dc) throw new AppError('DISCOUNT_NOT_FOUND', 'İndirim kodu bulunamadı', 404);
    if (!dc.isActive) throw new AppError('DISCOUNT_NOT_ACTIVE', 'İndirim kodu pasif', 409);

    const isGlobal = dc.createdById === null;
    if (!isGlobal && dc.createdById !== tunnel.educatorId)
      throw new AppError('DISCOUNT_NOT_OWNED', 'Bu kod bu tünel için geçerli değil', 409);

    const now = new Date();
    if (dc.validFrom && dc.validFrom > now) throw new AppError('DISCOUNT_OUT_OF_WINDOW', 'İndirim kodu henüz aktif değil', 409);
    if (dc.validUntil && dc.validUntil < now) throw new AppError('DISCOUNT_OUT_OF_WINDOW', 'İndirim kodunun süresi dolmuş', 409);
    if (dc.maxUses != null && dc.usedCount >= dc.maxUses)
      throw new AppError('DISCOUNT_USAGE_EXHAUSTED', 'İndirim kodu kullanım hakkı tükendi', 409);

    const percentOff = isGlobal ? dc.percentOff : Math.min(dc.percentOff, EDUCATOR_MAX_PERCENT);
    const discountCents = Math.floor((tunnel.priceCents * percentOff) / 100);
    const finalAmountCents = Math.max(0, tunnel.priceCents - discountCents);

    return { code: dc.code, percentOff, discountCents, finalAmountCents, description: dc.description };
  }
}
