// @ts-nocheck
import { AppError } from '../../errors/AppError';
import type { IRefundRepository, RefundListItem } from '../../../domain/interfaces/IRefundRepository';

/**
 * Eğiticinin kendi testlerine ait iade taleplerini listeler.
 * Dönen kayıtlar PENDING, EDUCATOR_APPROVED ve EDUCATOR_REJECTED statüsünde olabilir.
 */
export class ListEducatorRefundsUseCase {
  constructor(private readonly refundRepo: IRefundRepository) {}

  async execute(educatorId: string | undefined): Promise<RefundListItem[]> {
    if (!educatorId) throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
    return this.refundRepo.findByEducatorId(educatorId);
  }
}
