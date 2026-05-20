// @ts-nocheck
import { prisma } from '../../../infrastructure/database/prisma';

/**
 * Seçilen reklam slotlarının gösterimini atomik olarak kaydeder.
 *
 * Her gösterim için:
 *   - AdImpression satırı oluşturulur (tarihsel izleme)
 *   - impressionsRemaining 1 azaltılır
 *   - impressionsDelivered 1 artırılır
 *
 * Race condition'ı önlemek için tüm operasyonlar tek $transaction içinde yapılır.
 * impressionsRemaining 0'ın altına düşmesini önlemek için WHERE koşulu kullanılır.
 */
export class RecordAdImpressionsUseCase {
  /**
   * @param slots        - SelectAdSlotsUseCase'den dönen purchase kayıtları
   * @param viewerUserId - Gösterimi gören kullanıcının ID'si; anonim ziyaretçi için null
   */
  async execute(
    slots: Array<{ id: string; educatorId: string; testId?: string | null }>,
    viewerUserId: string | null,
  ): Promise<void> {
    if (slots.length === 0) return;

    // Sayaç güncellemesi ve impression kaydı aynı interactive transaction içinde —
    // process crash durumunda her iki taraf da rollback alır.
    await prisma.$transaction(async (tx) => {
      // Her slot için atomic sayaç güncellemesi
      await Promise.all(
        slots.map((slot) =>
          // impressionsRemaining > 0 kontrolü ile negatife düşmeyi engelle
          tx.$executeRaw`
            UPDATE ad_purchases
            SET impressions_remaining = impressions_remaining - 1,
                impressions_delivered = impressions_delivered + 1
            WHERE id = ${slot.id}::uuid
              AND impressions_remaining > 0
          `,
        ),
      );

      // AdImpression kayıtlarını aynı transaction içinde toplu oluştur
      await tx.adImpression.createMany({
        data: slots.map((slot) => ({
          purchaseId:   slot.id,
          educatorId:   slot.educatorId,
          testId:       slot.testId ?? null,
          viewerUserId: viewerUserId ?? null,
        })),
      });
    });
  }
}
