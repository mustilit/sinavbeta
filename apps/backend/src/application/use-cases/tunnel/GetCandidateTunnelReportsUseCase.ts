import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';

/**
 * Aday tünel raporu (hafif) — satın alınan tüneller için ilerleme + durum.
 * progressPercent = öğrenilen soru / toplam soru. status: null (başlanmadı) |
 * IN_PROGRESS | COMPLETED.
 */
export class GetCandidateTunnelReportsUseCase {
  async execute(actorId?: string | null) {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Giriş gerekli', 401);

    const purchases = await prisma.tunnelPurchase.findMany({
      where: { candidateId: actorId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      select: {
        tunnelId: true,
        tunnel: {
          select: {
            id: true,
            title: true,
            examType: { select: { name: true } },
            topic: { select: { name: true } },
            _count: { select: { questions: true } },
          },
        },
      },
    });
    if (!purchases.length) return { items: [] };

    const tunnelIds = purchases.map((p) => p.tunnelId);
    const attempts = await prisma.tunnelAttempt.findMany({
      where: { candidateId: actorId, tunnelId: { in: tunnelIds } },
      select: { id: true, tunnelId: true, status: true, startedAt: true, completedAt: true },
    });
    const attByTunnel = new Map(attempts.map((a) => [a.tunnelId, a]));

    const masteredByAttempt = new Map<string, number>();
    const attemptIds = attempts.map((a) => a.id);
    if (attemptIds.length) {
      const grp = await prisma.tunnelQuestionProgress.groupBy({
        by: ['attemptId'],
        where: { attemptId: { in: attemptIds }, mastered: true },
        _count: { _all: true },
      });
      for (const g of grp) masteredByAttempt.set(g.attemptId, g._count._all);
    }

    const items = purchases.map((p) => {
      const t = p.tunnel;
      const total = t._count.questions;
      const att = attByTunnel.get(p.tunnelId);
      const mastered = att ? masteredByAttempt.get(att.id) ?? 0 : 0;
      return {
        tunnelId: t.id,
        title: t.title,
        examTypeName: t.examType?.name ?? null,
        topicName: t.topic?.name ?? null,
        totalQuestions: total,
        masteredQuestions: mastered,
        progressPercent: total > 0 ? Math.round((mastered / total) * 100) : 0,
        status: att?.status ?? null, // null = başlanmadı
        startedAt: att?.startedAt ?? null,
        completedAt: att?.completedAt ?? null,
      };
    });
    return { items };
  }
}
