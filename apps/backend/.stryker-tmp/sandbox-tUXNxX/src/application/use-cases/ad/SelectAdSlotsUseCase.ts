// @ts-nocheck
import { prisma } from '../../../infrastructure/database/prisma';

/**
 * Aktif reklam satın alımlarından ana sayfa slotlarına yerleştirilecek
 * reklamları seçer. Toplam öne çıkarmaların %10'u reklam bazlıdır.
 *
 * Seçim kriteri:
 *   - validUntil > now (süresi dolmamış)
 *   - impressionsRemaining > 0 (gösterim hakkı kalmış)
 * Birden fazla aktif reklam varsa rastgele karıştırılarak seçilir.
 */
export class SelectAdSlotsUseCase {
  /**
   * @param adCount    - Doldurulacak reklam slot sayısı (genellikle Math.floor(limit * 0.1))
   * @param excludeIds - Zaten organik listede yer alan test ID'leri (duplikasyon önleme)
   * @returns Seçilen reklam satın alım kayıtları (test ve eğitici bilgileriyle)
   */
  async execute(adCount: number, excludeIds: string[] = []) {
    if (adCount <= 0) return [];

    const now = new Date();

    // Aktif reklam satın alımlarını getir
    const activePurchases = await prisma.adPurchase.findMany({
      where: {
        validUntil: { gt: now },
        impressionsRemaining: { gt: 0 },
      },
      include: {
        test: {
          select: {
            id: true,
            title: true,
            educatorId: true,
            examTypeId: true,
            priceCents: true,
            currency: true,
            isTimed: true,
            questionCount: true,
            status: true,
          },
        },
        educator: {
          select: { id: true, username: true, metadata: true },
        },
      },
    });

    if (activePurchases.length === 0) return [];

    // TEST türü reklamlar: testId olan ve test yayında olan + organik listede olmayan
    const testAds = activePurchases.filter(
      (p) =>
        p.targetType === 'TEST' &&
        p.test !== null &&
        (p.test as any).status === 'PUBLISHED' &&
        !excludeIds.includes(p.testId ?? ''),
    );

    // EDUCATOR türü reklamlar: eğiticinin kendisini öne çıkardığı
    const educatorAds = activePurchases.filter((p) => p.targetType === 'EDUCATOR');

    // Tüm adayları birleştirip rastgele karıştır (weighted fairness)
    const candidates = [...testAds, ...educatorAds];
    const shuffled = candidates.sort(() => Math.random() - 0.5);

    // İstenen slot sayısı kadar seç (veya mevcut kadar)
    return shuffled.slice(0, adCount);
  }
}
