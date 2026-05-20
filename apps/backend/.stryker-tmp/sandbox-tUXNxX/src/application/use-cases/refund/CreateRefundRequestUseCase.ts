// @ts-nocheck
import { IRefundRepository } from '../../../domain/interfaces/IRefundRepository';
import { IObjectionRepository } from '../../../domain/interfaces/IObjectionRepository';
import { IAuditLogRepository } from '../../../domain/interfaces/IAuditLogRepository';
import { BadRequestException, ConflictException } from '@nestjs/common';

/**
 * Satın alınan test için iade talebi oluşturur.
 *
 * İş kuralı: İade için en az 10 onaylı itiraz gerekmektedir.
 * Aynı satın alma için yalnızca bir aktif iade talebi olabilir.
 *
 * Hata senaryoları:
 *   - REFUND_EXISTS (409): Bu satın alma için zaten bir iade talebi var
 *   - NOT_ELIGIBLE_FOR_REFUND (400): İtiraz sayısı 10'un altında
 *   - PURCHASE_NOT_FOUND (400): Satın alma kaydı bulunamadı
 */
export class CreateRefundRequestUseCase {
  constructor(private readonly refundRepo: IRefundRepository, private readonly objectionRepo: IObjectionRepository, private readonly auditRepo: IAuditLogRepository) {}

  async execute(purchaseId: string, candidateId: string, reason?: string) {
    if (!purchaseId || !candidateId) throw new BadRequestException('INVALID_INPUT');

    // Aynı satın alma için ikinci iade talebi engellenir
    const existing = await this.refundRepo.findByPurchaseId(purchaseId);
    if (existing) throw new ConflictException({ code: 'REFUND_EXISTS', message: 'Refund already requested for this purchase' });

    // İade hakkı: test başına en az 10 itiraz gerekli (haksız iade isteğini engeller)
    const purchaseRefundAllowed = await this.objectionRepo.countByTestAndCandidate((await this.getTestIdFromPurchase(purchaseId)), candidateId);
    if (purchaseRefundAllowed < 10) throw new BadRequestException({ code: 'NOT_ELIGIBLE_FOR_REFUND', message: 'Not enough objections' });

    const testId = await this.getTestIdFromPurchase(purchaseId);
    const created = await this.refundRepo.create({ purchaseId, candidateId, educatorId: '', testId, reason });

    // audit
    try {
      await this.auditRepo.create({ action: 'REFUND_REQUESTED' as any, entityType: 'RefundRequest', entityId: created.id, actorId: candidateId, metadata: { purchaseId, testId } });
    } catch {}

    return created;
  }

  /** Satın alma kaydından test ID'sini çeker — prisma singleton kullanır (inject edilmemiş) */
  private async getTestIdFromPurchase(purchaseId: string) {
    const { prisma } = require('../../../infrastructure/database/prisma');
    const p = await prisma.purchase.findUnique({ where: { id: purchaseId } });
    if (!p) throw new BadRequestException({ code: 'PURCHASE_NOT_FOUND', message: 'Purchase not found' });
    return p.testId;
  }
}

