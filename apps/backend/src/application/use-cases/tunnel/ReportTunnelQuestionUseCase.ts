import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';

const MAX_REASON = 1000;

/**
 * Aday, çözüm sırasında bir tünel sorusu için "hata bildirimi" gönderir.
 * Tünelin satın alınmış olması beklenir (aktif purchase). Kayıt hafif tablodur;
 * eğitici/admin sonradan inceler.
 */
export class ReportTunnelQuestionUseCase {
  async execute(
    tunnelId: string,
    input: { questionId?: string | null; reason: string },
    actorId?: string | null,
  ) {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Giriş gerekli', 401);
    const reason = (input.reason ?? '').trim();
    if (!reason) throw new AppError('REASON_REQUIRED', 'Bildirim metni gerekli', 400);

    const purchase = await prisma.tunnelPurchase.findUnique({
      where: { candidateId_tunnelId: { candidateId: actorId, tunnelId } },
      select: { id: true, status: true, tenantId: true },
    });
    if (!purchase || purchase.status !== 'ACTIVE')
      throw new AppError('TUNNEL_NOT_PURCHASED', 'Bu tüneli satın almadınız', 403);

    const report = await (prisma as any).tunnelQuestionReport.create({
      data: {
        tenantId: purchase.tenantId,
        tunnelId,
        questionId: input.questionId ?? null,
        candidateId: actorId,
        reason: reason.slice(0, MAX_REASON),
      },
      select: { id: true },
    });
    // İşlem geçmişi / audit — hata bildirimi (best-effort, akışı bloke etmez).
    await prisma.auditLog
      .create({
        data: {
          action: 'OBJECTION_CREATED', entityType: 'TunnelQuestionReport', entityId: report.id, actorId,
          metadata: { kind: 'tunnel', tunnelId, questionId: input.questionId ?? null } as object,
          tenantId: purchase.tenantId ?? null,
        },
      })
      .catch(() => {});
    return { ok: true, id: report.id };
  }
}
