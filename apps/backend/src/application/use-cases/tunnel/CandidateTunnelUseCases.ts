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
    language: t.language ?? 'tr',
    layerCount: t.layerCount,
    examTypeName: t.examType?.name ?? null,
    gradeLevelId: t.gradeLevelId ?? null,
    gradeLevelName: t.gradeLevel?.name ?? null,
    topicName: t.topic?.name ?? null,
    educatorId: t.educatorId ?? null,
    educatorUsername: t.educator?.username ?? null,
    questionCount: t._count?.questions ?? 0,
  };
}

/** Aday: yayınlanmış tünellerin pazar listesi (soru/cevap içermez).
 *  actorId verilirse her tünel için purchased + attemptStatus döner (kart durumu). */
export class ListPublishedTunnelsUseCase {
  async execute(filter?: { examTypeId?: string; gradeLevelId?: string; topicId?: string; language?: string }, actorId?: string | null) {
    const rows = await prisma.tunnel.findMany({
      where: {
        status: 'PUBLISHED',
        ...(filter?.examTypeId ? { examTypeId: filter.examTypeId } : {}),
        ...(filter?.gradeLevelId ? { gradeLevelId: filter.gradeLevelId } : {}),
        ...(filter?.topicId ? { topicId: filter.topicId } : {}),
        ...(filter?.language ? { language: filter.language } : {}),
      },
      orderBy: [{ publishedAt: 'desc' }],
      include: {
        examType: { select: { name: true } },
        gradeLevel: { select: { name: true } },
        topic: { select: { name: true } },
        educator: { select: { username: true } },
        _count: { select: { questions: true } },
      },
    });

    let purchased = new Set<string>();
    let attemptStatus = new Map<string, string>();
    const purchaseByTunnel = new Map<string, { id: string; createdAt: Date }>();
    if (actorId && rows.length) {
      const ids = rows.map((r) => r.id);
      const [ps, as] = await Promise.all([
        prisma.tunnelPurchase.findMany({
          where: { candidateId: actorId, tunnelId: { in: ids }, status: 'ACTIVE' },
          select: { id: true, tunnelId: true, createdAt: true },
        }),
        prisma.tunnelAttempt.findMany({
          where: { candidateId: actorId, tunnelId: { in: ids } },
          select: { tunnelId: true, status: true },
        }),
      ]);
      purchased = new Set(ps.map((p) => p.tunnelId));
      for (const p of ps) purchaseByTunnel.set(p.tunnelId, { id: p.id, createdAt: p.createdAt });
      attemptStatus = new Map(as.map((a) => [a.tunnelId, a.status]));
    }

    return {
      items: rows.map((t) => ({
        ...pubSummary(t),
        purchased: purchased.has(t.id),
        attemptStatus: attemptStatus.get(t.id) ?? null,
        // İade akışı için: TunnelPurchase id'si + satın alma tarihi (yalnız satın alındıysa)
        purchaseId: purchaseByTunnel.get(t.id)?.id ?? null,
        purchasedAt: purchaseByTunnel.get(t.id)?.createdAt ?? null,
      })),
    };
  }
}

/** Aday: tek tünel meta + satın alma/ilerleme durumu (soru/cevap içermez). */
export class GetPublishedTunnelMetaUseCase {
  async execute(tunnelId: string, actorId?: string | null) {
    const t = await prisma.tunnel.findUnique({
      where: { id: tunnelId },
      include: {
        examType: { select: { name: true } },
        gradeLevel: { select: { name: true } },
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
    const salesCount = await prisma.tunnelPurchase.count({ where: { tunnelId, status: 'ACTIVE' } });
    return { ...pubSummary(t), salesCount, purchased, attemptStatus };
  }
}
