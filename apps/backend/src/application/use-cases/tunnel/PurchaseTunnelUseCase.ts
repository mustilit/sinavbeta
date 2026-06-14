import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';

/**
 * Aday yayınlanmış bir tüneli satın alır (paket gibi; fiyat snapshot).
 * Idempotent: zaten satın alınmışsa mevcut kayıt döner. Ödeme sağlayıcı entegrasyonu
 * Faz 3'te; şimdilik ücretsiz/snapshot kayıt (ACTIVE).
 */
export class PurchaseTunnelUseCase {
  async execute(tunnelId: string, actorId?: string | null) {
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

    return prisma.tunnelPurchase.create({
      data: {
        tenantId: candidate.tenantId,
        tunnelId,
        candidateId: actorId,
        amountCents: tunnel.priceCents,
        currency: tunnel.currency,
        status: 'ACTIVE',
      },
    });
  }
}
