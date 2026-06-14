import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';

/**
 * Tünelin tam detayını (katmanlar + sorular + seçenekler) döndürür — eğitici
 * düzenleme/önizleme ve admin inceleme için. Eğitici yalnız kendi tünelini,
 * admin her tüneli görebilir.
 */
export class GetTunnelUseCase {
  async execute(tunnelId: string, actorId?: string | null, actorRole?: string | null) {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Giriş gerekli', 401);

    const tunnel = await prisma.tunnel.findUnique({
      where: { id: tunnelId },
      include: {
        examType: { select: { id: true, name: true } },
        topic: { select: { id: true, name: true } },
        educator: { select: { id: true, username: true } },
        layers: {
          orderBy: { index: 'asc' },
          include: {
            questions: {
              orderBy: { order: 'asc' },
              include: { options: { orderBy: { order: 'asc' } } },
            },
          },
        },
      },
    });
    if (!tunnel) throw new AppError('TUNNEL_NOT_FOUND', 'Tünel bulunamadı', 404);

    const isAdmin = actorRole === 'ADMIN' || actorRole === 'WORKER';
    if (!isAdmin && tunnel.educatorId !== actorId)
      throw new AppError('FORBIDDEN', 'Bu tünele erişiminiz yok', 403);

    return serializeTunnelDetail(tunnel);
  }
}

export function serializeTunnelDetail(t: any) {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    priceCents: t.priceCents,
    currency: t.currency,
    layerCount: t.layerCount,
    optionsPerQuestion: t.optionsPerQuestion,
    advanceStreak: t.advanceStreak,
    examType: t.examType ? { id: t.examType.id, name: t.examType.name } : null,
    topic: t.topic ? { id: t.topic.id, name: t.topic.name } : null,
    educator: t.educator ? { id: t.educator.id, username: t.educator.username } : null,
    reviewNote: t.reviewNote ?? null,
    submittedAt: t.submittedAt?.toISOString() ?? null,
    reviewedAt: t.reviewedAt?.toISOString() ?? null,
    publishedAt: t.publishedAt?.toISOString() ?? null,
    createdAt: t.createdAt?.toISOString?.() ?? null,
    layers: (t.layers ?? []).map((l: any) => ({
      index: l.index,
      questions: (l.questions ?? []).map((q: any) => ({
        id: q.id,
        content: q.content,
        mediaUrl: q.mediaUrl,
        options: (q.options ?? []).map((o: any) => ({
          id: o.id,
          content: o.content,
          isCorrect: o.isCorrect,
          order: o.order,
        })),
      })),
    })),
  };
}
