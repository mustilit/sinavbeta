// @ts-nocheck
import { IReviewRepository } from '../../../domain/interfaces/IReviewRepository';

/**
 * Belirli bir teste ait yorumları (review) sayfalayarak listeler.
 * İmleç tabanlı (cursor-based) sayfalama kullanılır.
 */
export class ListTestReviewsUseCase {
  constructor(private readonly reviewRepo: IReviewRepository) {}

  /**
   * Teste ait yorumları cursor tabanlı sayfalama ile getirir.
   * @param testId - Yorumları getirilecek testin ID'si.
   * @param limit  - Sayfa başına maksimum kayıt sayısı. Varsayılan: 20.
   * @param cursor - Sayfalama için önceki sayfanın son elemanının imleci (opsiyonel).
   */
  async execute(testId: string, limit = 20, cursor?: string) {
    return this.reviewRepo.listReviewsForTest(testId, limit, cursor);
  }
}

