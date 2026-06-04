import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaPurchaseRepository } from '../../../infrastructure/repositories/PrismaPurchaseRepository';
import { logger } from '../../../infrastructure/logger/logger';
import type { ModerateTextContentUseCase } from '../moderation/ModerateTextContentUseCase';

/**
 * Aday bir eğiticiyi puanlar (1-5) — `Review.educatorRating`.
 *
 * Kurallar:
 *   - Aday, eğiticinin EN AZ BİR paketinden/testinden satın almış olmalı.
 *   - Eğitici puanı test puanından (testRating) BAĞIMSIZDIR; testlerden türetilmez.
 *   - Aday × eğitici için TEK oy:
 *       • Mevcut review satırı varsa (testRating veya educatorRating'li) o güncellenir.
 *       • Hiç review yoksa, satın alınan bir pakete educator-only satır oluşturulur
 *         (testRating = null — sahte test puanı üretilmez).
 */
export class RateEducatorUseCase {
  // Opsiyonel — verilirse yorum metni moderasyondan geçer (sert blok). Test'lerde verilmez.
  constructor(private readonly moderate?: ModerateTextContentUseCase) {}

  async execute(
    educatorId: string,
    candidateId: string,
    payload: { rating: number; comment?: string },
  ): Promise<{ id: string; rating: number | null; comment: string | null }> {
    const { rating } = payload;
    const comment = payload.comment;
    if (!educatorId || !candidateId) throw new BadRequestException('INVALID_INPUT');
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new BadRequestException('RATING_INVALID');
    }

    const { prisma } = require('../../../infrastructure/database/prisma');

    const educator = await prisma.user.findUnique({
      where: { id: educatorId },
      select: { id: true, role: true },
    });
    if (!educator || educator.role !== 'EDUCATOR') throw new NotFoundException('EDUCATOR_NOT_FOUND');

    // İçerik moderasyonu — uygunsuz yorum SERT BLOK. moderate verilmemişse atlanır.
    if (this.moderate && comment && comment.trim()) {
      const c = await prisma.user.findUnique({ where: { id: candidateId }, select: { tenantId: true } });
      const verdict = await this.moderate.execute({
        entityType: 'Review',
        entityId: `educator:${educatorId}:${candidateId}`,
        userId: candidateId,
        tenantId: c?.tenantId ?? '',
        text: comment,
        isEducatorContent: false,
      });
      if (!verdict.allowed) {
        throw new BadRequestException({
          code: 'COMMENT_REJECTED',
          message: verdict.message ?? 'Yorumunuz uygunsuz içerik nedeniyle reddedildi.',
        });
      }
    }

    // Tek oy: önce educatorRating dolu satır, yoksa adayın bu eğitici için herhangi review'u
    let target = await (prisma as any).review.findFirst({
      where: { educatorId, candidateId, educatorRating: { not: null } },
      select: { id: true },
    });
    if (!target) {
      target = await (prisma as any).review.findFirst({
        where: { educatorId, candidateId },
        orderBy: { updatedAt: 'desc' },
        select: { id: true },
      });
    }

    let row: any;
    if (target) {
      row = await (prisma as any).review.update({
        where: { id: target.id },
        data: {
          educatorRating: rating,
          ...(comment !== undefined && { comment }),
          educatorId,
          updatedAt: new Date(),
        },
        select: { id: true, educatorRating: true, comment: true },
      });
    } else {
      // Review yok — satın alma doğrula, sonra educator-only satır oluştur
      const purchaseRepo = new PrismaPurchaseRepository();
      const pkgs = await prisma.testPackage.findMany({
        where: { educatorId },
        select: { id: true, tests: { where: { deletedAt: null }, select: { id: true } } },
      });
      let targetPackageId: string | null = null;
      for (const pkg of pkgs) {
        for (const t of pkg.tests) {
          if (await purchaseRepo.hasPurchase(t.id, candidateId)) {
            targetPackageId = pkg.id;
            break;
          }
        }
        if (targetPackageId) break;
      }
      if (!targetPackageId) {
        throw new ForbiddenException({ code: 'NO_PURCHASE', message: 'Bu eğiticiden test satın almadınız' });
      }
      // testRating null create — generate edilmiş Prisma client (testRating'i hâlâ zorunlu
      // sayan eski sürüm olabilir) input validation'ında null'ı reddedebilir. Kolon DB'de
      // nullable olduğundan educator-only satırı parametreli raw INSERT ile yazıyoruz.
      const newId: string = require('crypto').randomUUID();
      await prisma.$executeRaw`
        INSERT INTO reviews (id, "packageId", "educatorId", "candidateId", "testRating", "educatorRating", comment, "createdAt", "updatedAt")
        VALUES (${newId}, ${targetPackageId}, ${educatorId}, ${candidateId}, NULL, ${rating}, ${comment ?? null}, NOW(), NOW())
      `;
      row = { id: newId, educatorRating: rating, comment: comment ?? null };
    }

    // Audit — best-effort, akışı bloke etmez
    try {
      await (prisma as any).auditLog.create({
        data: {
          action: 'REVIEW_UPSERTED' as any,
          entityType: 'Review',
          entityId: row.id,
          actorId: candidateId,
          metadata: { educatorId, educatorRating: rating } as any,
        },
      });
    } catch (err: any) {
      // Audit best-effort — akışı bloke etmez, ama başarısız yazımı görünür kıl.
      logger.warn('review.educator_rating.audit_failed', {
        error: err?.message,
        reviewId: row.id,
        candidateId,
        educatorId,
      });
    }

    return { id: row.id, rating: row.educatorRating ?? null, comment: row.comment ?? null };
  }
}
