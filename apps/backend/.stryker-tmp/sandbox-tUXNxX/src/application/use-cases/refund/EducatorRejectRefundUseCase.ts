// @ts-nocheck
import { AppError } from '../../errors/AppError';
import { IRefundRepository } from '../../../domain/interfaces/IRefundRepository';

/**
 * Educator kendi testine ait PENDING iade talebini reddeder → EDUCATOR_REJECTED.
 * Aday bu kararı görüp itiraz (appeal) başlatabilir.
 */
export class EducatorRejectRefundUseCase {
  constructor(private readonly refundRepo: IRefundRepository) {}

  /**
   * @param refundId - Reddedilecek iade talebinin ID'si.
   * @param actorId  - İşlemi yapan educator'ın ID'si; yoksa 401 fırlatır.
   * @param reason   - Red gerekçesi (opsiyonel).
   */
  async execute(
    refundId: string,
    actorId: string | undefined,
    reason?: string,
  ): Promise<{ id: string; status: string; educatorDecidedAt: string }> {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Authentication required', 401);

    const refund = await this.refundRepo.findById(refundId);
    if (!refund) throw new AppError('REFUND_NOT_FOUND', 'Refund request not found', 404);

    if (refund.educatorId !== actorId) {
      throw new AppError('FORBIDDEN_NOT_EDUCATOR', 'Only the educator of this test can review this refund', 403);
    }

    if (refund.status !== 'PENDING') {
      throw new AppError('REFUND_NOT_PENDING', 'Only PENDING refunds can be reviewed by educator', 409);
    }

    const updated = await this.refundRepo.educatorReject(refundId, actorId, reason);

    return {
      id: updated.id,
      status: updated.status,
      educatorDecidedAt: updated.educatorDecidedAt ?? new Date().toISOString(),
    };
  }
}
