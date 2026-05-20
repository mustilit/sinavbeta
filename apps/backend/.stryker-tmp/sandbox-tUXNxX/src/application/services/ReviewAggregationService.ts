// @ts-nocheck
import { prisma } from '../../infrastructure/database/prisma';

/**
 * Test değerlendirmelerini toplu agregat hesaplayan servis.
 * Stats tablosunda kayıt bulunmayan testler için canlı hesaplama yapar.
 * GetEducatorPageUseCase ve benzeri use-case'ler tarafından kullanılır.
 */
export class ReviewAggregationService {
  /**
   * Birden fazla test için ortalama puan ve değerlendirme sayısını hesaplar.
   * Prisma groupBy ile tek sorguda toplu getirme — N+1 önlenir.
   * @returns testId → { avg, count } eşlemesi
   */
  async getAggregatesForTestIds(testIds: string[]) {
    if (!testIds || testIds.length === 0) return {};
    const rows: any[] = await prisma.review.groupBy({
      by: ['testId'],
      where: { testId: { in: testIds } },
      _avg: { testRating: true },
      _count: { _all: true },
    } as any);
    const map: Record<string, { avg: number | null; count: number }> = {};
    for (const r of rows) {
      map[r.testId] = { avg: r._avg.testRating ?? null, count: r._count._all ?? 0 };
    }
    return map;
  }
}

