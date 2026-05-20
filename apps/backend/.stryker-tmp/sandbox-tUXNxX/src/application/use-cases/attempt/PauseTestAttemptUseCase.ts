// @ts-nocheck
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

/**
 * Devam eden bir test denemesini duraklatır.
 * Geçen süre hesaplanarak kalan süre güncellenir.
 * Kalan süre sıfırsa deneme otomatik olarak EXPIRED durumuna geçirilir.
 */
export class PauseTestAttemptUseCase {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Denemeyi durdurur ve kalan süreyi hesaplayarak kaydeder.
   * @param attemptId - Duraklatılacak denemenin ID'si.
   * @param userId    - İşlemi yapan kullanıcının ID'si (sahiplik kontrolü yapılır).
   */
  async execute(attemptId: string, userId: string) {
    if (!attemptId || !userId) {
      throw new BadRequestException({ code: 'INVALID_INPUT', message: 'Missing attemptId or userId' });
    }

    const attempt = await this.prisma.testAttempt.findUnique({ where: { id: attemptId } });
    if (!attempt) throw new NotFoundException({ code: 'ATTEMPT_NOT_FOUND', message: 'Attempt not found' });

    // Yalnızca denemenin sahibi durdurabilir
    if (attempt.candidateId !== userId) {
      throw new ForbiddenException({ code: 'NOT_OWNER', message: 'Attempt does not belong to user' });
    }

    if ((attempt as any).status !== 'IN_PROGRESS') {
      throw new BadRequestException({ code: 'NOT_IN_PROGRESS', message: 'Attempt is not in progress' });
    }

    const now = new Date();
    // Son devam etme zamanından bu yana geçen saniyeyi hesapla
    const lastResumedAt = (attempt as any).lastResumedAt ?? attempt.startedAt;
    const elapsedSec = Math.max(0, Math.floor((now.getTime() - lastResumedAt.getTime()) / 1000));
    const prevRemaining = (attempt as any).remainingSec ?? 0;
    // Kalan süre sıfırın altına düşmemeli
    const remainingSec = Math.max(0, prevRemaining - elapsedSec);

    // Kalan süre bitti mi? EXPIRED, yoksa PAUSED
    const status = remainingSec <= 0 ? 'EXPIRED' : 'PAUSED';

    const updated = await this.prisma.testAttempt.update({
      where: { id: attemptId },
      data: {
        remainingSec,
        pausedAt: now,
        // Süre dolmuşsa finishedAt set edilir, yoksa mevcut değer korunur
        finishedAt: status === 'EXPIRED' ? now : (attempt as any).finishedAt,
        status,
      } as any,
    });

    return {
      status: updated.status,
      remainingSec: (updated as any).remainingSec ?? remainingSec,
    };
  }
}

