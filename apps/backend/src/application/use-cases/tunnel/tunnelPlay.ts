import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import { EngineQuestion, isMastered } from './engine';

export type QMeta = {
  id: string;
  layerIndex: number;
  content: string;
  mediaUrl: string | null;
  options: { id: string; content: string; mediaUrl: string | null }[]; // kanonik
};

export type PlayData = {
  tunnel: { id: string; title: string; optionsPerQuestion: number; advanceStreak: number; layerCount: number; status: string };
  questions: EngineQuestion[];
  qmeta: Map<string, QMeta>;
};

/** Tüneli oynanış için yükler: motor soruları + sunum meta'sı. */
export async function loadPlayData(tunnelId: string): Promise<PlayData> {
  const t = await prisma.tunnel.findUnique({
    where: { id: tunnelId },
    include: {
      layers: {
        orderBy: { index: 'asc' },
        include: {
          questions: { orderBy: { order: 'asc' }, include: { options: { orderBy: { order: 'asc' } } } },
        },
      },
    },
  });
  if (!t) throw new AppError('TUNNEL_NOT_FOUND', 'Tünel bulunamadı', 404);

  const questions: EngineQuestion[] = [];
  const qmeta = new Map<string, QMeta>();
  for (const layer of t.layers as any[]) {
    for (const q of layer.questions as any[]) {
      const correct = q.options.find((o: any) => o.isCorrect);
      questions.push({
        id: q.id,
        layerIndex: layer.index,
        optionIds: q.options.map((o: any) => o.id),
        correctOptionId: correct?.id ?? q.options[0]?.id,
      });
      qmeta.set(q.id, {
        id: q.id,
        layerIndex: layer.index,
        content: q.content,
        mediaUrl: q.mediaUrl ?? null,
        options: q.options.map((o: any) => ({ id: o.id, content: o.content, mediaUrl: o.mediaUrl ?? null })),
      });
    }
  }

  return {
    tunnel: {
      id: t.id,
      title: t.title,
      optionsPerQuestion: t.optionsPerQuestion,
      advanceStreak: t.advanceStreak,
      layerCount: t.layerCount,
      status: t.status,
    },
    questions,
    qmeta,
  };
}

/** Attempt'in ilerleme maskeleri (questionId → correctMask). */
export async function loadMasks(attemptId: string): Promise<Map<string, number>> {
  const rows = await prisma.tunnelQuestionProgress.findMany({
    where: { attemptId },
    select: { questionId: true, correctMask: true },
  });
  return new Map(rows.map((r) => [r.questionId, r.correctMask]));
}

/**
 * Aday'a gösterilecek state — KATMAN/DOĞRU CEVAP SIZDIRMADAN.
 * currentQuestion: o anki sunum (seçenekler currentOrderJson sırasında, isCorrect YOK).
 * progress: toplam/öğrenilen soru + tamamlanan katman sayısı (genel ilerleme hissi).
 */
export function buildAttemptState(
  attempt: any,
  play: PlayData,
  masks: Map<string, number>,
) {
  const { tunnel, qmeta } = play;
  const total = play.questions.length;
  let mastered = 0;
  for (const q of play.questions) if (isMastered(masks.get(q.id) ?? 0, tunnel.optionsPerQuestion)) mastered++;

  // Katman tamamlanma (öğrenilen katman sayısı) — aday hangi katmanda olduğunu görmez,
  // yalnızca genel ilerleme yüzdesi.
  let currentQuestion: any = null;
  if (attempt.currentQuestionId && attempt.currentOrderJson) {
    const meta = qmeta.get(attempt.currentQuestionId);
    if (meta) {
      let order: string[] = [];
      try { order = JSON.parse(attempt.currentOrderJson); } catch { order = meta.options.map((o) => o.id); }
      const byId = new Map(meta.options.map((o) => [o.id, o]));
      currentQuestion = {
        id: meta.id,
        content: meta.content,
        mediaUrl: meta.mediaUrl,
        options: order.map((oid) => ({ id: oid, content: byId.get(oid)?.content ?? '', mediaUrl: byId.get(oid)?.mediaUrl ?? null })),
      };
    }
  }

  return {
    attemptId: attempt.id,
    status: attempt.status,
    title: tunnel.title,
    totalQuestions: total,
    masteredQuestions: mastered,
    progressPercent: total > 0 ? Math.round((mastered / total) * 100) : 0,
    currentQuestion,
  };
}
