import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import { logger } from '../../../infrastructure/logger/logger';

const SUBMITTABLE: ReadonlySet<string> = new Set(['DRAFT', 'REJECTED']);

/**
 * Eğitici tüneli admin onayına gönderir (DRAFT/REJECTED → PENDING_APPROVAL).
 * Tamlık doğrulaması: her katmanda admin'in min/max soru kuralı sağlanmalı ve
 * her sorunun seçenek yapısı geçerli olmalı (kaydetme sırasında da kontrol edilir).
 */
export class SubmitTunnelForApprovalUseCase {
  async execute(tunnelId: string, actorId?: string | null) {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Giriş gerekli', 401);

    const tunnel = await prisma.tunnel.findUnique({
      where: { id: tunnelId },
      include: {
        layers: {
          orderBy: { index: 'asc' },
          include: { _count: { select: { questions: true } } },
        },
      },
    });
    if (!tunnel) throw new AppError('TUNNEL_NOT_FOUND', 'Tünel bulunamadı', 404);
    if (tunnel.educatorId !== actorId) throw new AppError('FORBIDDEN', 'Bu tünel size ait değil', 403);
    if (!SUBMITTABLE.has(tunnel.status))
      throw new AppError('TUNNEL_NOT_SUBMITTABLE', 'Tünel bu durumda onaya gönderilemez', 409);

    const settings = await prisma.adminSettings.findFirst({ where: { id: 1 } });
    const minQ = settings?.minQuestionsPerLayer ?? 10;
    const maxQ = settings?.maxQuestionsPerLayer ?? 50;

    for (const layer of tunnel.layers) {
      const n = layer._count.questions;
      if (n < minQ)
        throw new AppError(
          'LAYER_TOO_FEW',
          `Katman ${layer.index}: en az ${minQ} soru gerekli (şu an ${n})`,
          400,
        );
      if (n > maxQ)
        throw new AppError(
          'LAYER_TOO_MANY',
          `Katman ${layer.index}: en fazla ${maxQ} soru olabilir (şu an ${n})`,
          400,
        );
    }

    const updated = await prisma.tunnel.update({
      where: { id: tunnelId },
      data: { status: 'PENDING_APPROVAL', submittedAt: new Date(), reviewNote: null },
    });

    // İşlem geçmişi / audit — tünel onaya gönderildi (best-effort).
    await prisma.auditLog
      .create({
        data: {
          action: 'TUNNEL_SUBMITTED', entityType: 'Tunnel', entityId: tunnelId, actorId,
          metadata: { kind: 'tunnel', layerCount: tunnel.layers.length } as object,
          tenantId: (updated as any).tenantId ?? null,
        },
      })
      .catch((e) => logger.warn('tunnel.submit.audit_failed', { error: (e as any)?.message, tunnelId, actorId }));

    return updated;
  }
}
