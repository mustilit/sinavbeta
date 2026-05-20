import { EmailQueue, EmailStatus, PrismaClient, UserRole } from '@prisma/client';
import { prisma } from '../../../infrastructure/database/prisma';

export type ListEmailLogsParams = {
  tenantId: string;
  cursor?: { id: string; queuedAt: string };
  limit?: number;
  filter?: {
    queue?: EmailQueue;
    status?: EmailStatus;
    recipientRole?: UserRole;
    templateKey?: string;
    emailSearch?: string;
    from?: string;
    to?: string;
  };
};

export class ListEmailLogsUseCase {
  constructor(private readonly db: PrismaClient = prisma) {}

  async execute(params: ListEmailLogsParams) {
    const take = Math.min(Math.max(params.limit ?? 50, 1), 100) + 1;
    const where: any = { tenantId: params.tenantId };
    const f = params.filter ?? {};
    if (f.queue) where.queue = f.queue;
    if (f.status) where.status = f.status;
    if (f.recipientRole) where.recipientRole = f.recipientRole;
    if (f.templateKey) where.templateKey = f.templateKey;
    if (f.emailSearch) where.recipientEmail = { contains: f.emailSearch.toLowerCase() };
    if (f.from || f.to) {
      where.queuedAt = {};
      if (f.from) where.queuedAt.gte = new Date(f.from);
      if (f.to) where.queuedAt.lte = new Date(f.to);
    }

    const rows = await this.db.emailLog.findMany({
      where,
      select: {
        id: true,
        recipientEmail: true,
        recipientRole: true,
        templateKey: true,
        queue: true,
        status: true,
        subject: true,
        providerKind: true,
        attemptCount: true,
        lastErrorCode: true,
        queuedAt: true,
        sentAt: true,
        deliveredAt: true,
        bouncedAt: true,
      },
      orderBy: [{ queuedAt: 'desc' }, { id: 'desc' }],
      take,
      ...(params.cursor
        ? { cursor: { id: params.cursor.id }, skip: 1 }
        : {}),
    });

    const hasMore = rows.length > (params.limit ?? 50);
    const items = hasMore ? rows.slice(0, -1) : rows;
    const last = items[items.length - 1];
    return {
      items,
      nextCursor:
        hasMore && last
          ? { id: last.id, queuedAt: last.queuedAt.toISOString() }
          : null,
    };
  }
}
