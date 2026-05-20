// @ts-nocheck
import { BadRequestException } from '@nestjs/common';
import type { PrismaClient, AuditAction } from '@prisma/client';

/**
 * Devam eden bir test denemesinde soruya cevap kaydeder.
 * - Kalan süre anlık olarak hesaplanır; süre bitmişse deneme otomatik EXPIRED yapılır.
 * - selectedOptionId verilmezse "boş bırak" olarak yorumlanır ve mevcut cevap silinir.
 * - Cevap kaydı ve audit log aynı transaction içinde atomik olarak yazılır.
 */
export class SubmitAnswerUseCase {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Soruya cevap kaydeder veya günceller.
   * @param attemptId        - Cevabın kaydedileceği denemenin ID'si.
   * @param questionId       - Cevap verilen sorunun ID'si.
   * @param selectedOptionId - Seçilen şıkkın ID'si; null/undefined ise cevap silinir.
   * @param actorId          - İşlemi yapan kullanıcı (opsiyonel, sahiplik kontrolü için).
   */
  async execute(attemptId: string, questionId: string, selectedOptionId?: string | null, actorId?: string) {
    if (!attemptId || !questionId) throw new BadRequestException({ code: 'INVALID_INPUT', message: 'Missing fields' });

    // Deneme yüklenir
    const attempt = await this.prisma.testAttempt.findUnique({ where: { id: attemptId } });
    if (!attempt) throw new BadRequestException({ code: 'ATTEMPT_NOT_FOUND', message: 'Attempt not found' });

    if (actorId && attempt.candidateId !== actorId) {
      throw new BadRequestException({ code: 'NOT_ATTEMPT_OWNER', message: 'Actor not owner of attempt' });
    }

    const now = new Date();
    // remainingSec null ise zamanlayıcı henüz başlatılmamış demektir — süre kontrolü atlanır
    const rawRemainingSec = (attempt as any).remainingSec;
    let remainingSec: number | null = rawRemainingSec;
    if (rawRemainingSec !== null && rawRemainingSec !== undefined) {
      // Son devam etme anından bu yana geçen süre kalan süreden düşülür
      const lastResumedAt = (attempt as any).lastResumedAt ?? attempt.startedAt;
      if ((attempt as any).status === 'IN_PROGRESS') {
        const elapsedSec = Math.max(0, Math.floor((now.getTime() - lastResumedAt.getTime()) / 1000));
        remainingSec = Math.max(0, rawRemainingSec - elapsedSec);
      }

      // Süre bitmişse deneme otomatik TIMEOUT durumuna alınır ve hata döndürülür
      if ((remainingSec as number) <= 0) {
        await this.prisma.testAttempt.update({
          where: { id: attemptId },
          data: {
            status: 'TIMEOUT',
            remainingSec: 0,
            finishedAt: now,
          } as any,
        });
        throw new BadRequestException({ code: 'ATTEMPT_EXPIRED', message: 'Attempt has expired' });
      }
    }

    if ((attempt as any).status !== 'IN_PROGRESS') {
      throw new BadRequestException({ code: 'ATTEMPT_NOT_IN_PROGRESS', message: 'Attempt is not in progress' });
    }

    // Sorunun bu teste ait olduğu doğrulanır
    const question = await this.prisma.examQuestion.findUnique({ where: { id: questionId } });
    if (!question || (question as any).testId !== attempt.testId) {
      throw new BadRequestException({ code: 'QUESTION_NOT_IN_TEST', message: 'Question does not belong to this test' });
    }

    // selectedOptionId yoksa: soruyu boş bırak — mevcut cevap varsa sil
    if (!selectedOptionId) {
      try {
        const [deleted] = await this.prisma.$transaction([
          this.prisma.attemptAnswer.deleteMany({ where: { attemptId, questionId } }),
          this.prisma.auditLog.create({
            data: {
              action: 'SUBMIT_ANSWER' as AuditAction,
              entityType: 'AttemptAnswer',
              entityId: attemptId,
              actorId: actorId ?? null,
              metadata: { questionId, action: 'DELETE_ANSWER' },
            },
          }),
        ]);
        return deleted;
      } catch (e) {
        throw new BadRequestException({ code: 'DELETE_FAILED', message: 'Failed to delete answer' });
      }
    }

    // Şıkkın bu soruya ait olduğu doğrulanır
    const option = await this.prisma.examOption.findUnique({ where: { id: selectedOptionId } });
    if (!option || (option as any).questionId !== questionId) {
      throw new BadRequestException({ code: 'OPTION_NOT_IN_QUESTION', message: 'Option does not belong to question' });
    }
    const isCorrect = !!option?.isCorrect;

    try {
      // Cevap upsert edilir + audit log atomik transaction'da yazılır
      const [result] = await this.prisma.$transaction([
        this.prisma.attemptAnswer.upsert({
          where: { attemptId_questionId: { attemptId, questionId } } as any,
          update: { selectedOptionId, isCorrect },
          create: { attemptId, questionId, selectedOptionId, isCorrect },
        }),
        // Audit log best-effort: transaction başarısız olursa cevap da kaydedilmez
        this.prisma.auditLog.create({
          data: {
            action: 'SUBMIT_ANSWER' as AuditAction,
            entityType: 'AttemptAnswer',
            entityId: attemptId,
            actorId: actorId ?? null,
            metadata: { questionId },
          },
        }),
      ]);
      return result;
    } catch (e) {
      throw new BadRequestException({ code: 'UPsert_FAILED', message: 'Failed to submit answer' });
    }
  }
}

