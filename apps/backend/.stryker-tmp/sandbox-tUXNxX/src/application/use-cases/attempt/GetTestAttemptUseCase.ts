// @ts-nocheck
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

/**
 * Gerçek zamanlı kalan süreyi hesaplar.
 * Deneme duraklatılmışsa remainingSec olduğu gibi döner;
 * devam ediyorsa son resume anından itibaren geçen süre düşülür.
 */
function recomputeRemaining(attempt: any, now: Date) {
  if (attempt.status !== 'IN_PROGRESS') {
    return attempt.remainingSec ?? 0;
  }
  // Son devam (resume) zamanı veya başlangıç zamanı baz alınır
  const lastResumedAt: Date = attempt.lastResumedAt ?? attempt.startedAt;
  const elapsedSec = Math.max(0, Math.floor((now.getTime() - lastResumedAt.getTime()) / 1000));
  const prevRemaining = attempt.remainingSec ?? 0;
  return Math.max(0, prevRemaining - elapsedSec);
}

/**
 * Mevcut deneme durumunu getirir: sorular, verilen cevaplar ve kalan süre.
 * Süre dolmuşsa denemeyi otomatik EXPIRED olarak işaretler.
 */
export class GetTestAttemptUseCase {
  constructor(private readonly prisma: PrismaClient) {}

  async execute(attemptId: string, userId: string) {
    if (!attemptId || !userId) {
      throw new BadRequestException({ code: 'INVALID_INPUT', message: 'Missing attemptId or userId' });
    }

    const attempt = await this.prisma.testAttempt.findUnique({
      where: { id: attemptId },
      include: {
        test: {
          include: {
            questions: {
              include: { options: true },
            },
          },
        },
        answers: true,
      },
    });

    if (!attempt) throw new NotFoundException({ code: 'ATTEMPT_NOT_FOUND', message: 'Attempt not found' });
    if (attempt.candidateId !== userId) {
      throw new ForbiddenException({ code: 'NOT_OWNER', message: 'Attempt does not belong to user' });
    }

    const now = new Date();
    let remainingSec = recomputeRemaining(attempt as any, now);
    let status = attempt.status as any;

    // Süre dolmuşsa istemci sonraki getirme isteğinde de zaman aşımını fark etsin
    if (status === 'IN_PROGRESS' && remainingSec <= 0) {
      status = 'EXPIRED';
      const updated = await this.prisma.testAttempt.update({
        where: { id: attemptId },
        data: {
          status,
          remainingSec: 0,
          finishedAt: now,
        } as any,
        include: {
          test: {
            include: {
              questions: {
                include: { options: true },
              },
            },
          },
          answers: true,
        },
      });
      return {
        id: updated.id,
        status: updated.status,
        remainingSec: 0,
        questions: updated.test.questions,
        answers: updated.answers,
        canAnswer: false,
      };
    }

    return {
      id: attempt.id,
      status,
      remainingSec,
      questions: attempt.test.questions,
      answers: attempt.answers,
      canAnswer: status === 'IN_PROGRESS',
    };
  }
}

