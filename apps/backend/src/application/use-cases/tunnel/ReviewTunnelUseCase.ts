import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import { logger } from '../../../infrastructure/logger/logger';

/**
 * Admin tünel onayı: PENDING_APPROVAL → PUBLISHED (onaylanan tünel yayınlanır).
 * Eğitici onaysız yayınlayamaz; bu use-case tek yetkili yayın yolu.
 *
 * NOT: AuditAction enum'unda tünel değeri henüz yok → şimdilik structured logger.info
 * (ileride enum'a TUNNEL_APPROVED/REJECTED eklenip AuditLogger'a taşınacak).
 */
export class ApproveTunnelUseCase {
  async execute(tunnelId: string, actorId?: string | null) {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Giriş gerekli', 401);
    const tunnel = await prisma.tunnel.findUnique({ where: { id: tunnelId }, select: { id: true, status: true } });
    if (!tunnel) throw new AppError('TUNNEL_NOT_FOUND', 'Tünel bulunamadı', 404);
    if (tunnel.status !== 'PENDING_APPROVAL')
      throw new AppError('TUNNEL_NOT_PENDING', 'Tünel onay bekleyen durumda değil', 409);

    const now = new Date();
    const updated = await prisma.tunnel.update({
      where: { id: tunnelId },
      data: { status: 'PUBLISHED', reviewedById: actorId, reviewedAt: now, publishedAt: now, reviewNote: null },
    });
    logger.info('tunnel.approved', { tunnelId, actorId });
    return updated;
  }
}

/**
 * Admin tünel reddi: PENDING_APPROVAL → REJECTED (+ sebep). Eğitici düzeltip
 * yeniden onaya gönderebilir (REJECTED düzenlenebilir durumdadır).
 */
export class RejectTunnelUseCase {
  async execute(tunnelId: string, reason: string, actorId?: string | null) {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Giriş gerekli', 401);
    const note = (reason ?? '').trim();
    if (!note) throw new AppError('REASON_REQUIRED', 'Red sebebi zorunlu', 400);
    const tunnel = await prisma.tunnel.findUnique({ where: { id: tunnelId }, select: { id: true, status: true } });
    if (!tunnel) throw new AppError('TUNNEL_NOT_FOUND', 'Tünel bulunamadı', 404);
    if (tunnel.status !== 'PENDING_APPROVAL')
      throw new AppError('TUNNEL_NOT_PENDING', 'Tünel onay bekleyen durumda değil', 409);

    const updated = await prisma.tunnel.update({
      where: { id: tunnelId },
      data: { status: 'REJECTED', reviewedById: actorId, reviewedAt: new Date(), reviewNote: note },
    });
    logger.info('tunnel.rejected', { tunnelId, actorId });
    return updated;
  }
}
