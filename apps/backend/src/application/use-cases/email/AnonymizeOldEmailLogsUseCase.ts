import { PrismaClient } from '@prisma/client';
import { prisma } from '../../../infrastructure/database/prisma';

/**
 * Cron: retentionDays öncesi EmailLog'ların body/templateData alanlarını null'lar.
 * Satır kalır (metrikler korunur); sadece içerik silinir.
 */
export class AnonymizeOldEmailLogsUseCase {
  constructor(private readonly db: PrismaClient = prisma) {}

  async execute(input?: { now?: Date }) {
    const now = input?.now ?? new Date();
    const settings = await this.db.adminSettings.findFirst({ where: { id: 1 } });
    const retentionDays = settings?.emailRetentionDays ?? 90;
    const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);

    const result = await this.db.emailLog.updateMany({
      where: {
        queuedAt: { lt: cutoff },
        OR: [{ htmlBody: { not: null } }, { textBody: { not: null } }, { templateData: { not: undefined } }],
      },
      data: {
        htmlBody: null,
        textBody: null,
        templateData: null as any,
      },
    });
    return { anonymized: result.count, cutoff };
  }
}
