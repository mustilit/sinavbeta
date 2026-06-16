import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';

/**
 * Adayın tünel çözerken açtığı soru hata bildirimlerini (TunnelQuestionReport)
 * MyObjections sayfasının okuduğu "objection benzeri" şekle map'leyerek döndürür.
 *
 * Neden burada: Normal testlerde "soru hata bildirimi" = Objection olduğu için
 * MyObjections'da görünür. Tünel hata bildirimi AYRI bir modeldir (tunnel_question_reports)
 * ve aday-yüzlü hiçbir yerde görünmüyordu. Bu use-case onları aynı listede gösterir.
 *
 * TunnelQuestionReport.status: OPEN | RESOLVED. MyObjections badge'leri OPEN/ANSWERED/
 * ESCALATED bekler → RESOLVED, ANSWERED'a map'lenir (yeşil "yanıtlandı" rozeti).
 * Tünel raporlarının deadline/eğitici-yanıtı yoktur; o alanlar undefined bırakılır
 * (sayfa bunları "—" gösterir, daysLeft deadlineAt yokken null → render güvenli).
 */
export class ListMyTunnelQuestionReportsUseCase {
  async execute(actorId?: string | null, filters?: { status?: string }) {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Giriş gerekli', 401);

    const reports = await prisma.tunnelQuestionReport.findMany({
      where: { candidateId: actorId },
      orderBy: { createdAt: 'desc' },
    });
    if (!reports.length) return [];

    const tunnelIds = [...new Set(reports.map((r) => r.tunnelId))];
    const questionIds = [
      ...new Set(reports.map((r) => r.questionId).filter((id): id is string => Boolean(id))),
    ];
    const [tunnels, questions] = await Promise.all([
      prisma.tunnel.findMany({ where: { id: { in: tunnelIds } }, select: { id: true, title: true } }),
      questionIds.length
        ? prisma.tunnelQuestion.findMany({ where: { id: { in: questionIds } }, select: { id: true, content: true } })
        : Promise.resolve([] as { id: string; content: string }[]),
    ]);
    const titleByTunnel = new Map(tunnels.map((t) => [t.id, t.title]));
    const contentByQuestion = new Map(questions.map((q) => [q.id, q.content]));

    const mapped = reports.map((r) => ({
      id: r.id,
      reason: r.reason,
      status: r.status === 'RESOLVED' ? 'ANSWERED' : 'OPEN',
      createdAt: r.createdAt,
      questionId: r.questionId ?? '',
      questionContent: r.questionId ? contentByQuestion.get(r.questionId) ?? '' : '',
      testId: r.tunnelId,
      testTitle: `Tünel: ${titleByTunnel.get(r.tunnelId) ?? '—'}`,
      source: 'TUNNEL' as const,
    }));

    // Frontend status'u client-side filtreler; yine de server filtre gelirse uygula.
    if (filters?.status && filters.status !== 'ALL') {
      return mapped.filter((m) => m.status === filters.status);
    }
    return mapped;
  }
}
