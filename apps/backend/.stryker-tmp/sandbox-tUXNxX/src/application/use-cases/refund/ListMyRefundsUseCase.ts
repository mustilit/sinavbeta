// @ts-nocheck
import { AppError } from '../../errors/AppError';
import type { RefundListItem } from '../../../domain/interfaces/IRefundRepository';
import type { IRefundRepository } from '../../../domain/interfaces/IRefundRepository';

/**
 * Giriş yapmış adayın kendi iade taleplerini listeler.
 * Kimlik doğrulaması zorunludur.
 */
export class ListMyRefundsUseCase {
  constructor(private readonly refundRepo: IRefundRepository) {}

  /**
   * Adayın tüm iade taleplerini getirir.
   * @param actorId - Oturum açmış kullanıcının ID'si; yoksa 401 fırlatır.
   */
  async execute(actorId: string | undefined): Promise<RefundListItem[]> {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
    return this.refundRepo.findByCandidateId(actorId);
  }
}
