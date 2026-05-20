import { PrismaClient } from '@prisma/client';
import { prisma } from '../../../infrastructure/database/prisma';

/**
 * Cron: günlük cap sayaçlarını sıfırlar. 00:05 UTC önerilir.
 */
export class ResetProviderDailyCountUseCase {
  constructor(private readonly db: PrismaClient = prisma) {}

  async execute() {
    const result = await this.db.emailProviderConfig.updateMany({
      where: { dailySentCount: { gt: 0 } },
      data: { dailySentCount: 0, dailyResetAt: new Date() },
    });
    return { reset: result.count };
  }
}
