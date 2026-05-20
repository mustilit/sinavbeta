import { prisma } from '../../../infrastructure/database/prisma';
import { BadRequestException } from '@nestjs/common';
import { Currency } from '@prisma/client';

/**
 * FR-Y-09: Admin tarafından yeni bir reklam paketi oluşturur.
 *
 * Reklam paketleri; süre (gün), gösterim sayısı ve fiyat bilgilerini içerir.
 * Eğiticiler bu paketleri satın alarak testlerini öne çıkarabilir.
 */
export class CreateAdPackageUseCase {
  /**
   * Yeni reklam paketini veritabanına kaydeder.
   *
   * @param input.name         - Paketin görünen adı
   * @param input.durationDays - Paketin geçerli olacağı gün sayısı (en az 1)
   * @param input.impressions  - Toplam gösterim hakkı (en az 1)
   * @param input.priceCents   - Fiyat (kuruş cinsinden, 0 veya üzeri)
   * @param input.currency     - Para birimi kodu (varsayılan: TRY)
   * @param input.active       - Paketin aktif olup olmadığı (varsayılan: true)
   */
  async execute(input: {
    name: string;
    durationDays: number;
    impressions: number;
    priceCents: number;
    currency?: string;
    active?: boolean;
  }) {
    // Temel doğrulama: süre ve gösterim en az 1, fiyat negatif olamaz
    if (input.durationDays < 1 || input.impressions < 1 || input.priceCents < 0) {
      throw new BadRequestException({ code: 'INVALID_INPUT', message: 'durationDays, impressions must be >= 1, priceCents >= 0' });
    }
    return prisma.adPackage.create({
      data: {
        name: input.name,
        durationDays: input.durationDays,
        impressions: input.impressions,
        priceCents: input.priceCents,
        currency: (input.currency ?? 'TRY') as Currency,
        active: input.active ?? true,
      },
    });
  }
}
