import { PrismaClient } from '@prisma/client';
import { prisma } from '../../../infrastructure/database/prisma';

/**
 * Cron: süresi dolan SuppressedEmail kayıtlarını siler.
 */
export class ExpireSuppressionsUseCase {
  constructor(private readonly db: PrismaClient = prisma) {}

  async execute(input?: { now?: Date }) {
    const now = input?.now ?? new Date();
    const result = await this.db.suppressedEmail.deleteMany({
      where: { expiresAt: { not: null, lt: now } },
    });
    return { expired: result.count };
  }
}
