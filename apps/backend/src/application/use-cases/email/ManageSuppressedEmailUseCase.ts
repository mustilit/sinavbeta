import { PrismaClient, SuppressionReason } from '@prisma/client';
import { prisma } from '../../../infrastructure/database/prisma';
import { normalizeEmail } from '../../services/email/utils/emailNormalize';

export class ManageSuppressedEmailUseCase {
  constructor(private readonly db: PrismaClient = prisma) {}

  async list(input: { tenantId: string; cursor?: { id: string }; limit?: number; search?: string }) {
    const take = Math.min(Math.max(input.limit ?? 50, 1), 100) + 1;
    const where: any = { tenantId: input.tenantId };
    if (input.search) {
      where.email = { contains: input.search.toLowerCase() };
    }
    const rows = await this.db.suppressedEmail.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      ...(input.cursor ? { cursor: { id: input.cursor.id }, skip: 1 } : {}),
    });
    const hasMore = rows.length > (input.limit ?? 50);
    const items = hasMore ? rows.slice(0, -1) : rows;
    return {
      items,
      nextCursor: hasMore ? { id: items[items.length - 1].id } : null,
    };
  }

  async add(input: {
    tenantId: string;
    actorId: string;
    email: string;
    reason: SuppressionReason;
    note?: string;
    expiresAt?: string;
  }) {
    const email = normalizeEmail(input.email);
    const row = await this.db.suppressedEmail.upsert({
      where: { tenantId_email: { tenantId: input.tenantId, email } },
      create: {
        tenantId: input.tenantId,
        email,
        reason: input.reason,
        source: 'manual',
        note: input.note ?? null,
        createdBy: input.actorId,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      },
      update: {
        reason: input.reason,
        source: 'manual',
        note: input.note ?? null,
        createdBy: input.actorId,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      },
    });
    await this.db.auditLog.create({
      data: {
        action: 'EMAIL_SUPPRESSION_ADDED',
        entityType: 'SuppressedEmail',
        entityId: row.id,
        actorId: input.actorId,
        metadata: { email, reason: input.reason } as any,
      },
    });
    return row;
  }

  async remove(input: { tenantId: string; actorId: string; id: string }) {
    const row = await this.db.suppressedEmail.findFirst({
      where: { id: input.id, tenantId: input.tenantId },
    });
    if (!row) throw Object.assign(new Error('Suppression not found'), { status: 404 });
    await this.db.suppressedEmail.delete({ where: { id: row.id } });
    await this.db.auditLog.create({
      data: {
        action: 'EMAIL_SUPPRESSION_REMOVED',
        entityType: 'SuppressedEmail',
        entityId: row.id,
        actorId: input.actorId,
        metadata: { email: row.email } as any,
      },
    });
    return { ok: true };
  }
}
