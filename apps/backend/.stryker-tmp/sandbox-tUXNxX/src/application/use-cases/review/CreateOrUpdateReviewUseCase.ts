// @ts-nocheck
import { IReviewRepository } from '../../../domain/interfaces/IReviewRepository';
import { IPurchaseRepository } from '../../../domain/interfaces/IPurchaseRepository';
import { IAttemptRepository } from '../../../domain/interfaces/IAttemptRepository';
import { IAuditLogRepository } from '../../../domain/interfaces/IAuditLogRepository';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

/**
 * Test ve eğitici değerlendirmesi oluşturur veya günceller (upsert).
 *
 * İş kuralları:
 *   - Değerlendirme yapabilmek için test satın alınmış VE en az bir tamamlanmış deneme olmalı
 *   - Puan 1-5 aralığında olmalı
 *   - Aynı test için ikinci değerlendirme mevcut kaydı günceller
 */
export class CreateOrUpdateReviewUseCase {
  constructor(private readonly reviewRepo: IReviewRepository, private readonly purchaseRepo: IPurchaseRepository, private readonly attemptRepo: IAttemptRepository, private readonly auditRepo: IAuditLogRepository) {}

  async execute(testId: string, candidateId: string, payload: { testRating?: number; educatorRating?: number; comment?: string }) {
    const { testRating, educatorRating, comment } = payload;
    if (!testId || !candidateId) throw new BadRequestException('INVALID_INPUT');
    if (testRating === undefined && educatorRating === undefined) throw new BadRequestException('RATING_INVALID');
    // Puan 1–5 sınırı — yıldız sisteminin sınırları
    if (testRating !== undefined && (testRating < 1 || testRating > 5)) throw new BadRequestException('RATING_INVALID');
    if (educatorRating !== undefined && (educatorRating < 1 || educatorRating > 5)) throw new BadRequestException('RATING_INVALID');

    // Satın alma ve tamamlanmış deneme zorunlu — aksi hâlde değerlendirme anlamsız
    const hasPurchase = await this.purchaseRepo.hasPurchase(testId, candidateId);
    if (!hasPurchase) throw new BadRequestException({ code: 'NO_PURCHASE', message: 'Candidate has not purchased this test' });
    const hasSubmitted = await this.attemptRepo.hasSubmittedAttempt(testId, candidateId);
    if (!hasSubmitted) throw new BadRequestException({ code: 'NO_SUBMITTED_ATTEMPT', message: 'Candidate has not submitted attempt for this test' });

    // Eğitici ID'sini testten al; değerlendirme hem test hem eğiticiye bağlı olmalı
    const { prisma } = require('../../../infrastructure/database/prisma');
    const test = await prisma.examTest.findUnique({ where: { id: testId } });
    if (!test) throw new BadRequestException('TEST_NOT_FOUND');
    const educatorId = (test as any).educatorId ?? null;

    const created = await this.reviewRepo.upsertReview({ testId, educatorId, candidateId, testRating, educatorRating, comment });

    try {
      await this.auditRepo.create({
        action: 'REVIEW_UPSERTED' as any,
        entityType: 'Review',
        entityId: created.id,
        actorId: candidateId,
        metadata: { testRating, educatorRating },
      } as any);
    } catch {}

    // Değerlendirme sonrası test istatistiklerini (ortalama puan vb.) güncelle — best-effort
    try {
      const { QueueService } = require('../../../infrastructure/queue/queue.service');
      const qs = new QueueService();
      await qs.enqueueJob('stats-queue', 'refresh', { testId });
    } catch (e) {
      // Kuyruk hatası işlemi engellemez
    }

    return created;
  }
}

