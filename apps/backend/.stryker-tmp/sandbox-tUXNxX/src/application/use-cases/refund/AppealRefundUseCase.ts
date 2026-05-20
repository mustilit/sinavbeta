// @ts-nocheck
import { AppError } from '../../errors/AppError';
import { IRefundRepository } from '../../../domain/interfaces/IRefundRepository';

/**
 * Aday, EDUCATOR_REJECTED durumundaki iade talebi için itiraz başlatır → APPEAL_PENDING.
 * Admin itirazı nihai olarak karara bağlar.
 */
export class AppealRefundUseCase {
  constructor(private readonly refundRepo: IRefundRepository) {}

  /**
   * @param refundId    - İtiraz edilecek iade talebinin ID'si.
   * @param actorId     - İtirazı yapan adayın ID'si; yoksa 401 fırlatır.
   * @param appealReason - İtiraz gerekçesi (zorunlu, min 5 karakter).
   */
  async execute(
    refundId: string,
    actorId: string | undefined,
    appealReason?: string,
  ): Promise<{ id: string; status: string; appealedAt: string }> {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Authentication required', 401);

    const refund = await this.refundRepo.findById(refundId);
    if (!refund) throw new AppError('REFUND_NOT_FOUND', 'Refund request not found', 404);

    if (refund.candidateId !== actorId) {
      throw new AppError('FORBIDDEN_NOT_CANDIDATE', 'Only the refund requester can appeal', 403);
    }

    if (refund.status !== 'EDUCATOR_REJECTED') {
      throw new AppError('REFUND_NOT_REJECTED', 'Only EDUCATOR_REJECTED refunds can be appealed', 409);
    }

    const trimmed = appealReason?.trim();
    if (!trimmed || trimmed.length < 5) {
      throw new AppError('REASON_TOO_SHORT', 'Appeal reason must be at least 5 characters', 400);
    }

    const updated = await this.refundRepo.appeal(refundId, actorId, trimmed);

    return {
      id: updated.id,
      status: updated.status,
      appealedAt: updated.appealedAt ?? new Date().toISOString(),
    };
  }
}
