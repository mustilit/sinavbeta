import { PrismaClient } from '@prisma/client';
import { prisma } from '../../../infrastructure/database/prisma';

export class GetEmailLogDetailUseCase {
  constructor(private readonly db: PrismaClient = prisma) {}

  async execute(input: { tenantId: string; id: string }) {
    const log = await this.db.emailLog.findFirst({
      where: { id: input.id, tenantId: input.tenantId },
      include: {
        recipient: { select: { id: true, username: true, email: true, role: true } },
        providerConfig: { select: { id: true, name: true, kind: true, fromEmail: true } },
        events: { orderBy: { occurredAt: 'asc' } },
      },
    });
    if (!log) throw Object.assign(new Error('EmailLog not found'), { status: 404 });
    return log;
  }
}
