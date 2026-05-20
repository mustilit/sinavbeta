// @ts-nocheck
import { Injectable } from '@nestjs/common';
import { prisma } from '../../../infrastructure/database/prisma';

/**
 * Konuyu siler. Alt konular silinmez — parentId null olur (yetim kalır).
 */
@Injectable()
export class DeleteTopicUseCase {
  async execute(id: string, actorId?: string) {
    const existing = await prisma.topic.findUnique({ where: { id } });
    if (!existing) { const e: any = new Error('Konu bulunamadı'); e.status = 404; throw e; }

    // Alt konuları yetim bırak (parentId = null)
    await (prisma.topic as any).updateMany({ where: { parentId: id }, data: { parentId: null } });
    await prisma.topic.delete({ where: { id } });

    try {
      await (prisma as any).auditLog.create({
        data: { action: 'TOPIC_DELETED', entityType: 'TOPIC', entityId: id, actorId: actorId ?? null, metadata: {} },
      });
    } catch { /* swallow */ }

    return { deleted: true };
  }
}
