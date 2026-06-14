import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';

function pubSummary(t: any) {
  return {
    id: t.id,
    title: t.title,
    description: t.description ?? null,
    coverImageUrl: t.coverImageUrl ?? null,
    priceCents: t.priceCents,
    currency: t.currency,
    layerCount: t.layerCount,
    examTypeName: t.examType?.name ?? null,
    topicName: t.topic?.name ?? null,
    educatorUsername: t.educator?.username ?? null,
    questionCount: t._count?.questions ?? 0,
  };
}

/** Aday: yayınlanmış tünellerin pazar listesi (soru/cevap içermez). */
export class ListPublishedTunnelsUseCase {
  async execute(filter?: { examTypeId?: string; topicId?: string }) {
    const rows = await prisma.tunnel.findMany({
      where: {
        status: 'PUBLISHED',
        ...(filter?.examTypeId ? { examTypeId: filter.examTypeId } : {}),
        ...(filter?.topicId ? { topicId: filter.topicId } : {}),
      },
      orderBy: [{ publishedAt: 'desc' }],
      include: {
        examType: { select: { name: true } },
        topic: { select: { name: true } },
        educator: { select: { username: true } },
        _count: { select: { questions: true } },
      },
    });
    return { items: rows.map(pubSummary) };
  }
}

/** Aday: tek tünel meta + satın alma/ilerleme durumu (soru/cevap içermez). */
export class GetPublishedTunnelMetaUseCase {
  async execute(tunnelId: string, actorId?: string | null) {
    const t = await prisma.tunnel.findUnique({
      where: { id: tunnelId },
      include: {
        examType: { select: { name: true } },
        topic: { select: { name: true } },
        educator: { select: { username: true } },
        _count: { select: { questions: true } },
      },
    });
    if (!t || t.status !== 'PUBLISHED') throw new AppError('TUNNEL_NOT_FOUND', 'Tünel bulunamadı', 404);

    let purchased = false;
    let attemptStatus: string | null = null;
    if (actorId) {
      const p = await prisma.tunnelPurchase.findUnique({
        where: { candidateId_tunnelId: { candidateId: actorId, tunnelId } },
      });
      purchased = !!p && p.status === 'ACTIVE';
      const a = await prisma.tunnelAttempt.findUnique({
        where: { candidateId_tunnelId: { candidateId: actorId, tunnelId } },
        select: { status: true },
      });
      attemptStatus = a?.status ?? null;
    }
    return { ...pubSummary(t), purchased, attemptStatus };
  }
}
