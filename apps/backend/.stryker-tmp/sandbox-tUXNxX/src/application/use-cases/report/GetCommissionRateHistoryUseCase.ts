// @ts-nocheck
import { prisma } from '../../../infrastructure/database/prisma';

export interface CommissionRateHistoryEntry {
  id: string;
  commissionPercent: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  note: string | null;
  createdAt: Date;
}

/**
 * Komisyon oranı geçmişini döndürür.
 * effectiveTo: sonraki kaydın effectiveFrom değeridir; en güncel kayıt için null.
 * Kayıtlar effectiveFrom azalan sırada döndürülür (en yeni önce).
 */
export class GetCommissionRateHistoryUseCase {
  async execute(): Promise<CommissionRateHistoryEntry[]> {
    const history = await prisma.commissionRateHistory.findMany({
      orderBy: { effectiveFrom: 'desc' },
    });

    // idx === 0 → en yeni kayıt, effectiveTo = null (hâlâ geçerli)
    // idx > 0  → bir önceki (daha yeni) kaydın effectiveFrom değeri kapanış zamanıdır
    return history.map((entry, idx) => ({
      ...entry,
      effectiveTo: idx === 0 ? null : history[idx - 1].effectiveFrom,
    }));
  }
}
