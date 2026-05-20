// @ts-nocheck
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

type SnapshotQuestion = {
  id: string;
  options: Array<{ id: string; isCorrect: boolean }>;
};

/** snapshot varsa doğru seçenek kümesini snapshot'tan üretir, yoksa live verisini kullanır */
function buildCorrectSetFromSnapshot(
  snapshot: SnapshotQuestion[] | null,
): Map<string, boolean> | null {
  if (!snapshot || snapshot.length === 0) return null;
  const map = new Map<string, boolean>();
  for (const q of snapshot) {
    for (const o of q.options) {
      map.set(o.id, o.isCorrect);
    }
  }
  return map;
}

export class SubmitAttemptUseCase {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Finalize attempt: compute correct/wrong/blank without N+1 queries.
   * questionsSnapshot varsa isCorrect ve toplam soru sayısı snapshot'tan alınır —
   * eğiticinin sonraki güncellemeleri bu attempt'in skorunu etkilemez.
   */
  async execute(attemptId: string, answers?: { questionId: string; optionId: string }[], actorId?: string) {
    if (!attemptId) throw new BadRequestException({ code: 'INVALID_INPUT', message: 'Missing attemptId' });

    const attempt = await this.prisma.testAttempt.findUnique({ where: { id: attemptId } });
    if (!attempt) throw new BadRequestException({ code: 'ATTEMPT_NOT_FOUND', message: 'Attempt not found' });

    if (actorId && attempt.candidateId !== actorId) {
      throw new ForbiddenException({ message: 'NOT_ATTEMPT_OWNER' });
    }

    const snapshot: SnapshotQuestion[] | null = (attempt as any).questionsSnapshot ?? null;
    const snapshotCorrectMap = buildCorrectSetFromSnapshot(snapshot);
    const totalQuestionsFromSnapshot = snapshot?.length ?? null;

    // If already submitted, return current stats (idempotent)
    if ((attempt as any).status === 'SUBMITTED') {
      const existingRows = await this.prisma.attemptAnswer.findMany({
        where: { attemptId },
        select: { questionId: true, selectedOptionId: true },
      });
      const answeredCountEx = existingRows.length;

      let correctEx = 0;
      if (snapshotCorrectMap) {
        // Snapshot üzerinden hesapla
        for (const r of existingRows) {
          if (r.selectedOptionId && snapshotCorrectMap.get(r.selectedOptionId) === true) correctEx++;
        }
      } else {
        // Eski attempt'ler: canlı tablodan oku
        const rawOptionIdsEx = existingRows.map((r) => r.selectedOptionId);
        const optionIdsEx = Array.from(
          new Set((rawOptionIdsEx ?? []).filter((v): v is string => typeof v === 'string' && v.length > 0)),
        );
        const optionsEx =
          optionIdsEx.length > 0
            ? await this.prisma.examOption.findMany({ where: { id: { in: optionIdsEx } }, select: { id: true, isCorrect: true } })
            : [];
        const correctSetEx = new Set(optionsEx.filter((o) => o.isCorrect).map((o) => o.id));
        for (const r of existingRows) {
          if (r.selectedOptionId && correctSetEx.has(r.selectedOptionId)) correctEx++;
        }
      }

      const totalQuestionsEx =
        totalQuestionsFromSnapshot ?? (await this.prisma.examQuestion.count({ where: { testId: attempt.testId } }));
      const wrongEx = answeredCountEx - correctEx;
      const blankEx = Math.max(0, totalQuestionsEx - answeredCountEx);
      return { correct: correctEx, wrong: wrongEx, blank: blankEx, score: attempt.score ?? correctEx, updated: attempt };
    }

    // gather answer rows
    let answerRows: { questionId: string; selectedOptionId: string }[] = [];
    if (Array.isArray(answers) && answers.length > 0) {
      answerRows = answers.map((a) => ({ questionId: a.questionId, selectedOptionId: a.optionId }));
    } else {
      answerRows = (await this.prisma.attemptAnswer.findMany({
        where: { attemptId },
        select: { questionId: true, selectedOptionId: true },
      })) as any;
    }

    const answeredCount = answerRows.length;

    let correct = 0;
    if (snapshotCorrectMap) {
      // Snapshot üzerinden hesapla — canlı tablo sorgusu yok
      for (const r of answerRows) {
        if (r.selectedOptionId && snapshotCorrectMap.get(r.selectedOptionId) === true) correct++;
      }
    } else {
      // Eski attempt'ler: canlı tablodan oku
      const optionIds = Array.from(
        new Set(answerRows.map((r) => r.selectedOptionId).filter((x): x is string => x != null)),
      );
      const options =
        optionIds.length > 0
          ? await this.prisma.examOption.findMany({ where: { id: { in: optionIds } }, select: { id: true, isCorrect: true } })
          : [];
      const correctSet = new Set(options.filter((o) => o.isCorrect).map((o) => o.id));
      for (const r of answerRows) {
        if (r.selectedOptionId && correctSet.has(r.selectedOptionId)) correct++;
      }
    }

    // Toplam soru sayısı: snapshot varsa snapshot'tan, yoksa canlı sayım
    const totalQuestions =
      totalQuestionsFromSnapshot ?? (await this.prisma.examQuestion.count({ where: { testId: attempt.testId } }));
    const wrong = answeredCount - correct;
    const blank = Math.max(0, totalQuestions - answeredCount);
    const score = correct;

    // ─── Süre aşımı hesapla ─────────────────────────────────────────────────
    let overtimeSeconds: number | null = null;
    const testMeta = await this.prisma.examTest.findUnique({
      where: { id: attempt.testId },
      select: { isTimed: true, duration: true },
    });
    if (testMeta?.isTimed && testMeta.duration && attempt.startedAt) {
      const deadlineMs = new Date(attempt.startedAt).getTime() + testMeta.duration * 60 * 1000;
      const nowMs = Date.now();
      if (nowMs > deadlineMs) {
        overtimeSeconds = Math.max(1, Math.round((nowMs - deadlineMs) / 1000));
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.testAttempt.update({
        where: { id: attemptId },
        data: {
          score,
          status: 'SUBMITTED',
          submittedAt: new Date(),
          completedAt: new Date(),
          ...(overtimeSeconds !== null ? { overtimeSeconds } : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          action: 'SUBMIT_ATTEMPT',
          entityType: 'TestAttempt',
          entityId: attemptId,
          actorId: actorId ?? null,
          metadata: { correct, wrong, blank, score, overtimeSeconds },
        },
      });
      return u;
    });

    return { correct, wrong, blank, score, overtimeSeconds, updated };
  }
}
