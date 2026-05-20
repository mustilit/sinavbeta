// @ts-nocheck
import { prisma } from '../../../infrastructure/database/prisma';
import { IEmailProvider } from '../../../domain/interfaces/IEmailProvider';
import { AppError } from '../../errors/AppError';

export class SendBulkCandidateEmailUseCase {
  constructor(private readonly emailProvider: IEmailProvider) {}

  async execute(input: {
    candidateIds?: string[];
    subject: string;
    body: string;
  }): Promise<{ sent: number; failed: number }> {
    if (!input.subject?.trim() || !input.body?.trim()) {
      throw new AppError('INVALID_INPUT', 'Konu ve mesaj zorunludur', 400);
    }
    if (!input.candidateIds?.length) {
      throw new AppError('INVALID_INPUT', 'En az bir alıcı seçin', 400);
    }
    if (input.candidateIds.length > 500) {
      throw new AppError('TOO_MANY_RECIPIENTS', 'En fazla 500 alıcıya aynı anda mail gönderilebilir', 400);
    }

    // Fetch emails for given IDs (only CANDIDATE role, ACTIVE status)
    const users = await prisma.user.findMany({
      where: {
        id: { in: input.candidateIds },
        role: 'CANDIDATE',
        status: 'ACTIVE',
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
