import { Controller, Get, Query } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Roles } from '../decorators/roles.decorator';
import { prisma } from '../../infrastructure/database/prisma';

/** FR-Y-04: Hata bilgisi görüntüleme - email hataları ve diğer kritik loglar */
const ERROR_ACTIONS = [
  'EMAIL_FAILED',
  'CSP_VIOLATION',
  'SUSPICIOUS_RATE_LIMIT',
  'DEVICE_QUOTA_EXCEEDED',
] as const;

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
    // İki kaynak birleştirilir:
    // 1) EmailLog: FAILED + DEAD_LETTER — gönderim akışının canonical kaynağı.
    // 2) AuditLog: EMAIL_FAILED — eski/legacy hataların tutulduğu yer.
    // Frontend tek liste alır; source alanından ayırır.
    const [emailRows, auditRows] = await Promise.all([
      prisma.emailLog.findMany({
        where: { status: { in: ['FAILED', 'DEAD_LETTER'] } },
        orderBy: { queuedAt: 'desc' },
        take: l,
        select: {
          id: true,
          status: true,
          templateKey: true,
          recipientEmail: true,
          recipientRole: true,
          providerKind: true,
          queue: true,
          attemptCount: true,
          lastErrorCode: true,
          lastErrorMessage: true,
          queuedAt: true,
        },
      }),
      prisma.auditLog.findMany({
        where: { action: 'EMAIL_FAILED' as any },
        orderBy: { createdAt: 'desc' },
        take: l,
        select: { id: true, createdAt: true, metadata: true, actorId: true },
      }),
    ]);

    const emailItems = emailRows.map((r) => ({
      source: 'EMAIL' as const,
      id: r.id,
      status: r.status,
      templateKey: r.templateKey,
      recipientEmail: r.recipientEmail,
      recipientRole: r.recipientRole,
      providerKind: r.providerKind,
      queue: r.queue,
      attemptCount: r.attemptCount,
      errorCode: r.lastErrorCode,
      errorMessage: r.lastErrorMessage,
      createdAt: r.queuedAt,
    }));

    const auditItems = auditRows.map((r) => ({
      source: 'AUDIT' as const,
      id: r.id,
      createdAt: r.createdAt,
      metadata: r.metadata,
      actorId: r.actorId,
    }));

    // En yeni → en eski; iki kaynağı birlikte sırala, sonra limit'e kırp.
    const merged = [...emailItems, ...auditItems].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    return { items: merged.slice(0, l) };
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

