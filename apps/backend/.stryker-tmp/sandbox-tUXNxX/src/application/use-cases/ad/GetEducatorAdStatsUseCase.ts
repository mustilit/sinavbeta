// @ts-nocheck
import { prisma } from '../../../infrastructure/database/prisma';

/**
 * Eğiticinin reklam istatistiklerini döndürür.
 *
 * Her satın alım için:
 *   - Toplam teslim edilen gösterim sayısı (impressionsDelivered)
 *   - Kalan gösterim hakkı (impressionsRemaining)
 *   - Son 30 günün günlük gösterim dağılımı
 *
 * Eğitici bu verileri kendi dashboard'ında izleyebilir.
 */
export class GetEducatorAdStatsUseCase {
  /**
   * @param educatorId - İstatistikleri sorgulanacak eğiticinin ID'si
   */
  async execute(educatorId: string) {
    // Eğiticinin tüm reklam satın alımlarını paket bilgisiyle getir
    const purchases = await prisma.adPurchase.findMany({
      where: { educatorId },
      orderBy: { createdAt: 'desc' },
      include: {
        adPackage: { select: { name: true, impressions: true, durationDays: true } },
        test:      { select: { id: true, title: true } },
      },
    });

    if (purchases.length === 0) {
      return { purchases: [], totals: { totalDelivered: 0, totalRemaining: 0 } };
    }

    // Son 30 günlük günlük dağılım için impression kayıtları
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const impressions = await prisma.adImpression.findMany({
      where: {
        educatorId,
        createdAt: { gte: since },
      },
      select: { createdAt: true, purchaseId: true },
    });

    // Günlük gösterim sayısını hesapla (YYYY-MM-DD formatında gruplama)
    const dailyMap: Record<string, number> = {};
    for (const imp of impressions) {
      const day = imp.createdAt.toISOString().slice(0, 10);
      dailyMap[day] = (dailyMap[day] ?? 0) + 1;
    }

    // Boş günleri de dahil ederek son 30 günlük seriyi oluştur
    const dailyBreakdown: Array<{ date: string; impressions: number }> = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      dailyBreakdown.push({ date: key, impressions: dailyMap[key] ?? 0 });
    }

    // Satın alım bazlı detay
    const purchaseDetails = purchases.map((p) => ({
      id:                   p.id,
      targetType:           p.targetType,
      packageName:          p.adPackage.name,
      totalImpressions:     p.adPackage.impressions,
      impressionsDelivered: p.impressionsDelivered,
      impressionsRemaining: p.impressionsRemaining,
      validUntil:           p.validUntil,
      createdAt:            p.createdAt,
      isActive:             p.validUntil > new Date() && p.impressionsRemaining > 0,
      // TEST türünde hangi test için alındığı
      test:                 p.test ? { id: p.test.id, title: p.test.title } : null,
    }));

    // Toplam özet
    const totals = {
      totalDelivered:  purchases.reduce((s, p) => s + p.impressionsDelivered, 0),
      totalRemaining:  purchases.reduce((s, p) => s + p.impressionsRemaining, 0),
      activePurchases: purchases.filter((p) => p.validUntil > new Date() && p.impressionsRemaining > 0).length,
    };

    return { purchases: purchaseDetails, dailyBreakdown, totals };
  }
}
