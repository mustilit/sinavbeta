// @ts-nocheck
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

/**
 * Duraklatılmış bir test denemesini devam ettirir.
 * - Sadece PAUSED statüsündeki denemeler devam ettirilebilir.
 * - Süre dolmuş (EXPIRED) denemeler devam ettirilemez.
 * - lastResumedAt güncellenerek kalan süre hesaplaması sıfırlanır.
 */
export class ResumeTestAttemptUseCase {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Duraklatılmış denemeyi IN_PROGRESS statüsüne geçirir.
   * @param attemptId - Devam ettirilecek denemenin ID'si.
   * @param userId    - İşlemi yapan kullanıcının ID'si (sahiplik kontrolü yapılır).
   */
  async execute(attemptId: string, userId: string) {
    if (!attemptId || !userId) {
      throw new BadRequestException({ code: 'INVALID_INPUT', message: 'Missing attemptId or userId' });
    }

    const attempt = await this.prisma.testAttempt.findUnique({ where: { id: attemptId } });
    if (!attempt) throw new NotFoundException({ code: 'ATTEMPT_NOT_FOUND', message: 'Attempt not found' });

    // Yalnızca denemenin sahibi devam ettirebilir
    if (attempt.candidateId !== userId) {
      throw new ForbiddenException({ code: 'NOT_OWNER', message: 'Attempt does not belong to user' });
    }

    // Süresi dolmuş denemeler artık devam ettirilemez
    if ((attempt as any).status === 'EXPIRED') {
      throw new BadRequestException({ code: 'ALREADY_EXPIRED', message: 'Attempt already expired' });
    }

    if ((attempt as any).status !== 'PAUSED') {
      throw new BadRequestException({ code: 'NOT_PAUSED', message: 'Attempt is not paused' });
    }

    const now = new Date();
    // lastResumedAt güncellenerek bir sonraki süre hesabı için referans nokta ayarlanır
    const updated = await this.prisma.testAttempt.update({
      where: { id: attemptId },
      data: {
        lastResumedAt: now,
        status: 'IN_PROGRESS',
      } as any,
    });

    return {
      status: updated.status,
      remainingSec: (updated as any).remainingSec,
    };
  }
}

