import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';

const EDUCATOR_MAX_PERCENT = 50;

/**
 * Aday yayınlanmış bir tüneli satın alır (paket gibi; fiyat snapshot).
 * Idempotent: zaten satın alınmışsa mevcut kayıt döner.
 *
 * İndirim kodu (opsiyonel): DiscountCode modelini kullanır. Tünel eğiticisinin
 * kendi kodu (createdById === tunnel.educatorId, %50 üst sınır) VEYA global admin
 * kodu (createdById === null, sınırsız %) geçerli. usedCount artışı race-safe.
 * Komisyon RAPORU entegrasyonu ayrı iterasyon; burada tutar + indirim snapshot'lanır.
 */
type PurchaseCtx = {
  acceptedDistanceSaleContractId?: string | null;
  paymentProvider?: string | null;
  ip?: string | null;
  userAgent?: string | null;
};

export class PurchaseTunnelUseCase {
  async execute(
    tunnelId: string,
    actorId?: string | null,
    discountCodeRaw?: string | null,
    ctx?: PurchaseCtx,
  ) {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Giriş gerekli', 401);

    const candidate = await prisma.user.findUnique({
      where: { id: actorId },
      select: { id: true, tenantId: true },
    });
    if (!candidate) throw new AppError('UNAUTHORIZED', 'Kullanıcı bulunamadı', 401);

    const tunnel = await prisma.tunnel.findUnique({
      where: { id: tunnelId },
      select: { id: true, status: true, educatorId: true, priceCents: true, currency: true },
    });
    if (!tunnel) throw new AppError('TUNNEL_NOT_FOUND', 'Tünel bulunamadı', 404);
    if (tunnel.status !== 'PUBLISHED')
      throw new AppError('TUNNEL_NOT_PUBLISHED', 'Tünel satın alınabilir değil', 409);
    if (tunnel.educatorId === actorId)
      throw new AppError('OWN_TUNNEL', 'Kendi tünelinizi satın alamazsınız', 403);

    const existing = await prisma.tunnelPurchase.findUnique({
      where: { candidateId_tunnelId: { candidateId: actorId, tunnelId } },
    });
    if (existing) return existing;

    // Mesafeli satış sözleşmesi (paket akışıyla aynı): aktif sözleşme varsa onay zorunlu.
    // Aktif sözleşme yoksa (test/dev) atlanır — paketlerle tutarlı snapshot, esnek kapı.
    const activeContract = await prisma.contract.findFirst({
      where: { type: 'DISTANCE_SALE', isActive: true },
      orderBy: { version: 'desc' },
    });
    if (activeContract) {
      if (!ctx?.acceptedDistanceSaleContractId || ctx.acceptedDistanceSaleContractId !== activeContract.id)
        throw new AppError('TERMS_NOT_ACCEPTED', 'Mesafeli satış sözleşmesi onayı zorunludur', 400);
    }
    const contractSnapshot = activeContract
      ? {
          paymentProvider: ctx?.paymentProvider ?? null,
          distanceSaleContractId: activeContract.id,
          distanceSaleAcceptedAt: new Date(),
          distanceSaleAcceptedIp: ctx?.ip ?? null,
          distanceSaleAcceptedUserAgent: ctx?.userAgent ?? null,
        }
      : { paymentProvider: ctx?.paymentProvider ?? null };

    const code = (discountCodeRaw ?? '').trim();
    // İndirimsiz / ücretsiz akış
    if (!code || tunnel.priceCents <= 0) {
      const created = await prisma.tunnelPurchase.create({
        data: {
          tenantId: candidate.tenantId,
          tunnelId,
          candidateId: actorId,
          amountCents: tunnel.priceCents,
          currency: tunnel.currency,
          status: 'ACTIVE',
          ...contractSnapshot,
        },
      });
      // İşlem geçmişi / audit — best-effort (akışı bloke etmez).
      await prisma.auditLog
        .create({
          data: {
            action: 'PURCHASE',
            entityType: 'TunnelPurchase',
            entityId: created.id,
            actorId,
            metadata: { kind: 'tunnel', tunnelId, educatorId: tunnel.educatorId, amountCents: created.amountCents, discountCode: null },
          },
        })
        .catch(() => {});
      return created;
    }

    // İndirim kodu doğrulama
    const dc = await prisma.discountCode.findFirst({
      where: { code: { equals: code, mode: 'insensitive' }, isActive: true },
    });
    if (!dc) throw new AppError('DISCOUNT_NOT_FOUND', 'İndirim kodu bulunamadı', 404);
    const now = new Date();
    if ((dc.validFrom && dc.validFrom > now) || (dc.validUntil && dc.validUntil < now))
      throw new AppError('DISCOUNT_OUT_OF_WINDOW', 'İndirim kodu geçerli tarih aralığında değil', 400);
    const isGlobal = dc.createdById === null;
    if (!isGlobal && dc.createdById !== tunnel.educatorId)
      throw new AppError('DISCOUNT_NOT_OWNED', 'Bu kod bu tünelde geçerli değil', 409);

    const pct = isGlobal ? dc.percentOff : Math.min(dc.percentOff, EDUCATOR_MAX_PERCENT);
    const discountAmount = Math.floor((tunnel.priceCents * pct) / 100);
    const finalAmount = Math.max(0, tunnel.priceCents - discountAmount);

    return prisma.$transaction(async (tx) => {
      // Race-safe usedCount artışı
      const inc = await tx.discountCode.updateMany({
        where: {
          id: dc.id,
          isActive: true,
          // maxUses null → sınırsız (kontrol yok); aksi halde usedCount < maxUses.
          ...(dc.maxUses != null ? { usedCount: { lt: dc.maxUses } } : {}),
        },
        data: { usedCount: { increment: 1 } },
      });
      if (inc.count === 0) throw new AppError('DISCOUNT_USAGE_EXHAUSTED', 'İndirim kodu kullanım limiti doldu', 409);

      const created = await tx.tunnelPurchase.create({
        data: {
          tenantId: candidate.tenantId,
          tunnelId,
          candidateId: actorId,
          amountCents: finalAmount,
          currency: tunnel.currency,
          status: 'ACTIVE',
          discountCodeId: dc.id,
          discountAmountCents: discountAmount,
          ...contractSnapshot,
        },
      });
      // İşlem geçmişi / audit — satın alma ile aynı transaction (atomik).
      await tx.auditLog.create({
        data: {
          action: 'PURCHASE',
          entityType: 'TunnelPurchase',
          entityId: created.id,
          actorId,
          metadata: { kind: 'tunnel', tunnelId, educatorId: tunnel.educatorId, amountCents: finalAmount, discountCode: dc.code },
        },
      });
      return created;
    });
  }
}
