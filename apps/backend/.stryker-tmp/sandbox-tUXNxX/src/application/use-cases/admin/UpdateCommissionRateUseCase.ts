// @ts-nocheck
import { prisma } from '../../../infrastructure/database/prisma';

interface Input {
  commissionPercent: number;
  effectiveFrom?: Date;
  note?: string;
}

/**
 * Komisyon oranını günceller ve geçmişe kaydeder.
 * - CommissionRateHistory tablosuna yeni bir kayıt ekler.
 * - AdminSettings.commissionPercent alanını geriye dönük uyumluluk için günceller.
 */
export class UpdateCommissionRateUseCase {
  async execute(input: Input) {
    const effectiveFrom = input.effectiveFrom ?? new Date();

    const [history] = await prisma.$transaction([
      prisma.commissionRateHistory.create({
        data: {
          commissionPercent: input.commissionPercent,
          effectiveFrom,
          note: input.note ?? null,
        },
      }),
      prisma.adminSettings.upsert({
        where: { id: 1 },
        update: { commissionPercent: input.commissionPercent },
        create: { id: 1, commissionPercent: input.commissionPercent },
      }),
    ]);

    return history;
  }
}
