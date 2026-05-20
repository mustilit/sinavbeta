// @ts-nocheck
import { AppError } from '../../errors/AppError';
import type { IPurchaseRepository, PurchaseWithAttemptRecord } from '../../../domain/interfaces/IPurchaseRepository';

/**
 * Giriş yapmış adayın kendi satın almalarını listeler.
 * Her satın alma ilgili deneme (attempt) bilgisiyle birlikte döner.
 */
export class ListMyPurchasesUseCase {
  constructor(private readonly purchaseRepo: IPurchaseRepository) {}

  /**
   * Adayın tüm satın almalarını getirir.
   * @param candidateId - Oturum açmış adayın ID'si; yoksa 401 fırlatır.
   */
  async execute(candidateId: string | undefined): Promise<PurchaseWithAttemptRecord[]> {
    if (!candidateId) throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
    return this.purchaseRepo.findByCandidateId(candidateId);
  }
}
