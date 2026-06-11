import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import { LiveActor, resolveLiveParticipant } from './resolveLiveParticipant';

export class GetLiveSessionStateUseCase {
  async execute(sessionId: string, actor?: LiveActor) {
    // requesterId = kayıtlı kullanıcı id'si (eğitici tespiti + round1 lookup için).
    // Misafirde null; katılımcı çözümü guestToken ile resolveLiveParticipant'ta yapılır.
    const requesterId = actor?.userId ?? null;
    const session = await prisma.liveSession.findUnique({
      where: { id: sessionId },
      include: {
        tier: true,
        questions: { orderBy: { order: 'asc' }, include: { options: { orderBy: { order: 'asc' } } } },
        _count: { select: { participants: true } },
        rounds: { select: { id: true, joinCode: true, status: true, roundNumber: true } },
        parent: {
          select: {
            id: true,
            questions: { orderBy: { order: 'asc' }, include: { options: { orderBy: { order: 'asc' } } } },
          },
        },
      },
    });
    if (!session) throw new AppError('SESSION_NOT_FOUND', 'Live session not found', 404);
    const isEducator = requesterId === session.educatorId;
    const activeThreshold = new Date(Date.now() - 30_000);
    const activeCount = await prisma.liveParticipant.count({
      where: { sessionId: session.id, lastSeenAt: { gte: activeThreshold } },
    });
    const currentQ = session.questions[session.currentQuestionIdx] ?? null;

    let stats: Record<string, { optionId: string; content: string; count: number; isCorrect: boolean }[]> | null = null;
    // parentStats: Tur 2 oturumunda, aynı sıradaki Tur 1 sorusunun yanıt dağılımı.
    // Karşılaştırma amaçlı; option order ile eşleştirilir (Tur 2 option id'siyle anahtarlanır).
    let parentStats: Record<string, { optionId: string; count: number; total: number }[]> | null = null;

    if ((session.showStats || isEducator) && currentQ) {
      const answers = await prisma.liveAnswer.groupBy({
        by: ['optionId'],
        where: { questionId: currentQ.id },
        _count: { optionId: true },
      });
      const countMap = new Map(answers.map((a) => [a.optionId, a._count.optionId]));
      stats = {
        [currentQ.id]: currentQ.options.map((o) => ({
          optionId: o.id,
          content: o.content,
          count: countMap.get(o.id) ?? 0,
          isCorrect: o.isCorrect,
        })),
      };

      // Tur 2'de aynı sıradaki Tur 1 sorusunun istatistikleri (varsa)
      if (session.roundNumber === 2 && session.parent) {
        const r1Q = session.parent.questions.find((q) => q.order === currentQ.order);
        if (r1Q) {
          const r1Answers = await prisma.liveAnswer.groupBy({
            by: ['optionId'],
            where: { questionId: r1Q.id },
            _count: { optionId: true },
          });
          const r1CountMap = new Map(r1Answers.map((a) => [a.optionId, a._count.optionId]));
          const r1Total = r1Answers.reduce((s, a) => s + a._count.optionId, 0);
          // Tur 1 ve Tur 2 option'larını order ile eşle; frontend için Tur 2'nin option id'siyle key'le
          parentStats = {
            [currentQ.id]: currentQ.options.map((r2Opt, idx) => {
              const r1Opt = r1Q.options[idx];
              return {
                optionId: r2Opt.id,
                count: r1Opt ? (r1CountMap.get(r1Opt.id) ?? 0) : 0,
                total: r1Total,
              };
            }),
          };
        }
      }
    }

    let myAnswer: string | null = null;
    let myResults: any = null;

    if (!isEducator) {
      // Kayıtlı kullanıcı (userId) veya misafir (guestToken) katılımcısını çöz.
      const participant = await resolveLiveParticipant(sessionId, actor);
      if (participant) {
        if (currentQ) {
          const ans = await prisma.liveAnswer.findUnique({
            where: { questionId_participantId: { questionId: currentQ.id, participantId: participant.id } },
          });
          myAnswer = ans?.optionId ?? null;
        }
        if (session.status === 'ENDED') {
          const buildResults = async (qs: typeof session.questions, partId: string, sess: { id: string }) => {
            const allAnswers = await prisma.liveAnswer.findMany({ where: { participantId: partId, sessionId: sess.id } });
            const answerMap = new Map(allAnswers.map((a) => [a.questionId, a.optionId]));
            const items = qs.map((q) => {
              const chosenOptionId = answerMap.get(q.id) ?? null;
              const chosenOption = chosenOptionId ? q.options.find((o) => o.id === chosenOptionId) : null;
              const correctOption = q.options.find((o) => o.isCorrect)!;
              return {
                questionId: q.id,
                questionContent: q.content,
                chosenOptionId,
                chosenOptionContent: chosenOption?.content ?? null,
                correctOptionId: correctOption?.id ?? '',
                correctOptionContent: correctOption?.content ?? '',
                isCorrect: chosenOptionId != null && chosenOptionId === correctOption?.id,
              };
            });
            return { correct: items.filter((a) => a.isCorrect).length, total: qs.length, answers: items };
          };
          myResults = await buildResults(session.questions, participant.id, session);
          myResults.round1Results = null;
          if (session.roundNumber === 2 && session.parent && requesterId) {
            const r1p = await prisma.liveParticipant.findUnique({
              where: { sessionId_userId: { sessionId: session.parent.id, userId: requesterId } },
            });
            if (r1p) myResults.round1Results = await buildResults(session.parent.questions, r1p.id, session.parent);
          }
        }
      }
    }

    return {
      id: session.id,
      title: session.title,
      joinCode: session.joinCode,
      status: session.status,
      currentQuestionIdx: session.currentQuestionIdx,
      totalQuestions: session.questions.length,
      showStats: session.showStats,
      participantCount: session._count.participants,
      activeParticipantCount: activeCount,
      maxParticipants: session.maxParticipants,
      tier: session.tier ? { id: session.tier.id, label: session.tier.label } : null,
      paidAt: session.paidAt,
      currentQuestion: currentQ ? {
        id: currentQ.id,
        content: currentQ.content,
        mediaUrl: currentQ.mediaUrl,
        order: currentQ.order,
        options: currentQ.options.map((o) => ({
          id: o.id, content: o.content, mediaUrl: (o as any).mediaUrl ?? null, order: o.order,
          isCorrect: isEducator || session.status === 'ENDED' ? o.isCorrect : undefined,
        })),
      } : null,
      stats,
      parentStats,
      myAnswer,
      myResults,
      roundNumber: session.roundNumber,
      parentSessionId: session.parentSessionId,
      round2: session.rounds?.[0] ?? null,
    };
  }
}
