// @ts-nocheck
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { prismaRetry } from '../../../infrastructure/prisma/prisma-retry';

export class StartTestAttemptUseCase {
  constructor(private readonly prisma: PrismaClient) {}

  async execute(testId: string, userId: string, tenantId?: string | null) {
    if (!testId || !userId) {
      throw new BadRequestException({ code: 'INVALID_INPUT', message: 'Missing testId or userId' });
    }

    // Kill-switch: new test attempts disabled
    const killSettings = await this.prisma.adminSettings.findFirst({ where: { id: 1 } });
    if (killSettings && killSettings.testAttemptsEnabled === false) {
      throw new BadRequestException({ code: 'TEST_ATTEMPTS_DISABLED', message: 'Test başlatma geçici olarak durdurulmuştur' });
    }

    const test = await prismaRetry(() => this.prisma.examTest.findUnique({ where: { id: testId } }));
    if (!test) {
      throw new NotFoundException({ code: 'TEST_NOT_FOUND', message: 'Test not found' });
    }

    if (tenantId && (test as any).tenantId && (test as any).tenantId !== tenantId) {
      throw new ForbiddenException({ code: 'TENANT_MISMATCH', message: 'Test does not belong to tenant' });
    }

    // Satın alma kontrolü: doğrudan testId bazlı VEYA paket (packageId) bazlı
    const directPurchase = await prismaRetry(() =>
      this.prisma.purchase.findFirst({
        where: { testId, candidateId: userId, status: 'ACTIVE' } as any,
      }),
    );

    let hasAccess = !!directPurchase;

    if (!hasAccess) {
      // Test bir paketin parçasıysa o pakete ait tamamlanmış satın alma var mı?
      const packageId = (test as any).packageId ?? null;
      if (packageId) {
        const packagePurchase = await prismaRetry(() =>
          (this.prisma.purchase as any).findFirst({
            where: { packageId, candidateId: userId },
          }),
        );
        hasAccess = !!packagePurchase;
      }
    }

    if (!hasAccess) {
      throw new ForbiddenException({ code: 'NO_PURCHASE', message: 'User has no purchase for this test' });
    }

    const existing = await prismaRetry(() =>
      this.prisma.testAttempt.findFirst({
        where: { testId, candidateId: userId },
      }),
    );

    const isTimed = (test as any).isTimed ?? false;
    // Zamansız testler için 24 saat varsayılan; zamanlı testlerde duration zorunlu
    const durationSec =
      (test as any).durationSec ??
      ((test as any).duration ? Number((test as any).duration) * 60 : null) ??
      (!isTimed ? 86400 : null);

    if (isTimed && (!durationSec || durationSec <= 0)) {
      throw new BadRequestException({
        code: 'INVALID_DURATION',
        message: 'Test duration is not configured',
      });
    }

    // 0 sorulu teste attempt başlatılamaz
    const questionCount = await this.prisma.examQuestion.count({ where: { testId } });
    if (questionCount === 0) {
      throw new BadRequestException({
        code: 'NO_QUESTIONS',
        message: 'Test has no questions',
      });
    }

    const now = new Date();

    if (!existing) {
      // Soru snapshot'ını al — eğitici sonradan güncellese bile bu attempt orijinal versiyonu görecek
      const snapshotQuestions = await this.prisma.examQuestion.findMany({
        where: { testId },
        orderBy: { order: 'asc' },
        select: {
          id: true,
          content: true,
          mediaUrl: true,
          order: true,
          options: {
            select: { id: true, content: true, mediaUrl: true, isCorrect: true },
          },
        },
      });

      const created = await this.prisma.testAttempt.create({
        data: {
          testId,
          candidateId: userId,
          status: 'IN_PROGRESS',
          startedAt: now,
          lastResumedAt: now,
          remainingSec: durationSec,
          questionsSnapshot: snapshotQuestions as any,
        } as any,
      });

      return {
        attemptId: created.id,
        remainingSec: (created as any).remainingSec ?? durationSec,
      };
    }

    if ((existing as any).status === 'PAUSED') {
      const updated = await this.prisma.testAttempt.update({
        where: { id: existing.id },
        data: {
          status: 'IN_PROGRESS',
          lastResumedAt: now,
        } as any,
      });

      return {
        attemptId: updated.id,
        remainingSec: (updated as any).remainingSec ?? durationSec,
      };
    }

    // Eğer zaten IN_PROGRESS ise kalan süreyi döndür
    if ((existing as any).status === 'IN_PROGRESS') {
      return {
        attemptId: existing.id,
        remainingSec: (existing as any).remainingSec ?? durationSec,
      };
    }

    throw new BadRequestException({
      code: 'ATTEMPT_ALREADY_FINISHED',
      message: 'Attempt already finished or expired',
    });
  }
}

