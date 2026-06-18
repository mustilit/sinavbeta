import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';

/**
 * Adayın yazılı test hata bildirimlerini MyObjections'ın okuduğu "objection benzeri"
 * şekle map'ler (ListMyTunnelQuestionReports deseni). RESOLVED → ANSWERED.
 * testTitle "Yazılı: <başlık>" ile etiketlenir; source 'WRITTEN'.
 */
export class ListMyWrittenQuestionReportsUseCase {
  async execute(actorId?: string | null, filters?: { status?: string }) {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Giriş gerekli', 401);

    const reports = await prisma.writtenQuestionReport.findMany({
      where: { candidateId: actorId },
      orderBy: { createdAt: 'desc' },
    });
    if (!reports.length) return [];

    const testIds = [...new Set(reports.map((r) => r.testId).filter((id): id is string => Boolean(id)))];
    const questionIds = [...new Set(reports.map((r) => r.questionId).filter((id): id is string => Boolean(id)))];
    const [tests, questions] = await Promise.all([
      testIds.length
        ? prisma.writtenTest.findMany({ where: { id: { in: testIds } }, select: { id: true, title: true } })
        : Promise.resolve([] as { id: string; title: string }[]),
      questionIds.length
        ? prisma.writtenQuestion.findMany({ where: { id: { in: questionIds } }, select: { id: true, content: true } })
        : Promise.resolve([] as { id: string; content: string }[]),
    ]);
    const titleByTest = new Map(tests.map((t) => [t.id, t.title]));
    const contentByQuestion = new Map(questions.map((q) => [q.id, q.content]));

    const mapped = reports.map((r) => ({
      id: r.id,
      reason: r.reason,
      status: r.status === 'RESOLVED' ? 'ANSWERED' : 'OPEN',
      createdAt: r.createdAt,
      questionId: r.questionId ?? '',
      questionContent: r.questionId ? contentByQuestion.get(r.questionId) ?? '' : '',
      testId: r.testId ?? '',
      testTitle: `Yazılı: ${(r.testId && titleByTest.get(r.testId)) || '—'}`,
      source: 'WRITTEN' as const,
    }));

    if (filters?.status && filters.status !== 'ALL') {
      return mapped.filter((m) => m.status === filters.status);
    }
    return mapped;
  }
}
