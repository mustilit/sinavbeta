// @ts-nocheck
import { prisma } from '../../../infrastructure/database/prisma';
import { IEmailProvider } from '../../../domain/interfaces/IEmailProvider';
import { AppError } from '../../errors/AppError';

/**
 * Admin tarafından seçili eğiticilere toplu e-posta gönderir.
 * Tek seferde maksimum 500 alıcı — daha fazlası için sayfalama gerekir.
 * Gönderim hataları sayılır (failed); tek başarısızlık tüm işlemi durdurmaz.
 */
export class SendBulkEducatorEmailUseCase {
  constructor(private readonly emailProvider: IEmailProvider) {}

  async execute(input: {
    educatorIds?: string[];
    subject: string;
    body: string;
  }): Promise<{ sent: number; failed: number }> {
    if (!input.subject?.trim() || !input.body?.trim()) {
      throw new AppError('INVALID_INPUT', 'Konu ve mesaj zorunludur', 400);
    }
    if (!input.educatorIds?.length) {
      throw new AppError('INVALID_INPUT', 'En az bir alıcı seçin', 400);
    }
    // 500 kişilik limit — e-posta sağlayıcısının rate limit sınırını aşmamak için
    if (input.educatorIds.length > 500) {
      throw new AppError('TOO_MANY_RECIPIENTS', 'En fazla 500 alıcıya aynı anda mail gönderilebilir', 400);
    }

    const users = await prisma.user.findMany({
      where: {
        id: { in: input.educatorIds },
        role: 'EDUCATOR',
        deletedAt: null,
      },
      select: { id: true, email: true, username: true },
    });

    let sent = 0;
    let failed = 0;
    for (const user of users) {
      try {
        await this.emailProvider.sendEmail(user.email, input.subject, input.body);
        sent++;
      } catch {
        failed++;
      }
    }
    return { sent, failed };
  }
}
