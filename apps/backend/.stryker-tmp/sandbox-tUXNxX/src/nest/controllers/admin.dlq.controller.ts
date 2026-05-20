// @ts-nocheck
import { Controller, Get, Query } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Roles } from '../decorators/roles.decorator';
import { prisma } from '../../infrastructure/database/prisma';

/** FR-Y-04: Hata bilgisi görüntüleme - email hataları ve diğer kritik loglar */
const ERROR_ACTIONS = ['EMAIL_FAILED', 'CSP_VIOLATION', 'SUSPICIOUS_RATE_LIMIT'] as const;

/**
 * Dead Letter Queue (DLQ) izleme — başarısız e-postaları ve kritik hata loglarını listeler.
 * Swagger dökümantasyonundan gizlenmiştir (@ApiExcludeController); sadece ADMIN rolüne açıktır.
 */
@ApiExcludeController()
@Controller('admin/dlq')
export class AdminDlqController {
  @Get('emails')
  @Roles('ADMIN')
  async listEmails(@Query('limit') limit?: string) {
    const l = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const rows = await prisma.auditLog.findMany({
      where: { action: 'EMAIL_FAILED' as any },
      orderBy: { createdAt: 'desc' },
      take: l,
    });
    return { items: rows.map((r) => ({ id: r.id, createdAt: r.createdAt, metadata: r.metadata, actorId: r.actorId })) };
  }

  @Get('errors')
  @Roles('ADMIN')
  async listErrors(@Query('limit') limit?: string, @Query('action') action?: string) {
    const l = Math.min(Math.max(Number(limit) || 100, 1), 200);
    const where: any = action
      ? { action }
      : { action: { in: [...ERROR_ACTIONS] } };
    const rows = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: l,
    });
    return {
      items: rows.map((r) => ({
        id: r.id,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        actorId: r.actorId,
        createdAt: r.createdAt,
        metadata: r.metadata,
      })),
    };
  }
}

