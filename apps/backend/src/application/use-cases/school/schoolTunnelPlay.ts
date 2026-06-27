/**
 * E-Sınıf tünel oynanış yardımcıları — market tunnelPlay.ts deseni, SchoolExam üzerinde.
 * Saf adaptif motor (tunnel/engine.ts) yeniden kullanılır. Katman = SchoolQuestion.layerIndex.
 */
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import { EngineQuestion, isMastered } from '../tunnel/engine';

export type QMeta = {
  id: string;
  layerIndex: number;
  content: string;
  mediaUrl: string | null;
  options: { id: string; content: string; mediaUrl: string | null }[];
};

export type SchoolPlayData = {
  exam: { id: string; title: string; schoolId: string; examType: string; layerCount: number; optionsPerQuestion: number; advanceStreak: number };
  questions: EngineQuestion[];
  qmeta: Map<string, QMeta>;
};

export async function loadSchoolPlayData(examId: string): Promise<SchoolPlayData> {
  const e = await prisma.schoolExam.findUnique({
    where: { id: examId },
    include: { questions: { orderBy: { order: 'asc' }, include: { options: { orderBy: { order: 'asc' } } } } },
  });
  if (!e) throw new AppError('EXAM_NOT_FOUND', 'Sınav bulunamadı', 404);

  const questions: EngineQuestion[] = [];
  const qmeta = new Map<string, QMeta>();
  for (const q of e.questions as any[]) {
    const correct = q.options.find((o: any) => o.isCorrect);
    questions.push({
      id: q.id,
      layerIndex: q.layerIndex ?? 1,
      optionIds: q.options.map((o: any) => o.id),
      correctOptionId: correct?.id ?? q.options[0]?.id,
    });
    qmeta.set(q.id, {
      id: q.id,
      layerIndex: q.layerIndex ?? 1,
      content: q.content,
      mediaUrl: q.mediaUrl ?? null,
      options: q.options.map((o: any) => ({ id: o.id, content: o.content, mediaUrl: o.mediaUrl ?? null })),
    });
  }

  return {
    exam: {
      id: e.id,
      title: e.title,
      schoolId: e.schoolId,
      examType: e.examType as string,
      layerCount: e.layerCount ?? 7,
      optionsPerQuestion: e.optionsPerQuestion ?? 10,
      advanceStreak: e.advanceStreak ?? 10,
    },
    questions,
    qmeta,
  };
}

export async function loadSchoolMasks(attemptId: string): Promise<Map<string, number>> {
  const rows = await prisma.schoolTunnelProgress.findMany({ where: { attemptId }, select: { questionId: true, correctMask: true } });
  return new Map(rows.map((r) => [r.questionId, r.correctMask]));
}

/** Öğrenciye gösterilecek durum — KATMAN/DOĞRU SIZDIRMADAN (market buildAttemptState deseni). */
export function buildSchoolAttemptState(attempt: any, play: SchoolPlayData, masks: Map<string, number>) {
  const total = play.questions.length;
  let mastered = 0;
  for (const q of play.questions) if (isMastered(masks.get(q.id) ?? 0)) mastered++;

  let currentQuestion: any = null;
  if (attempt.currentQuestionId && attempt.currentOrderJson) {
    const meta = play.qmeta.get(attempt.currentQuestionId);
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
    title: play.exam.title,
    totalQuestions: total,
    masteredQuestions: mastered,
    progressPercent: total > 0 ? Math.round((mastered / total) * 100) : 0,
    currentQuestion,
  };
}
