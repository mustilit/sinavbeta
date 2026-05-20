// @ts-nocheck
import { IReviewRepository } from '../../../domain/interfaces/IReviewRepository';

/**
 * Bir test için değerlendirme özetini döner: ortalama puan ve değerlendirme sayısı.
 * Ön-hesaplanmış stats tablosunu kullanır (gerçek zamanlı hesaplama yapmaz).
 */
export class GetTestRatingAggregateUseCase {
  constructor(private readonly reviewRepo: IReviewRepository) {}
  async execute(testId: string) {
    return this.reviewRepo.getAggregateForTest(testId);
  }
}

