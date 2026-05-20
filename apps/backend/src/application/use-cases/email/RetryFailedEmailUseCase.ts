import { PrismaClient } from '@prisma/client';
import { prisma } from '../../../infrastructure/database/prisma';
import {
  EmailQueueProducer,
  getEmailQueueProducer,
} from '../../services/email/EmailQueueProducer';

/**
 * Admin manuel retry: DEAD_LETTER veya FAILED durumdaki bir maili tekrar kuyruğa düşürür.
 * EmailLog kaydını QUEUED'a alır, attemptCount sıfırlanmaz (geçmiş için tutulur).
 */
export class RetryFailedEmailUseCase {
  constructor(
    private readonly db: PrismaClient = prisma,
    private readonly producer: EmailQueueProducer = getEmailQueueProducer(),
  ) {}

  async execute(input: { tenantId: string; emailLogId: string; actorId: string }) {
    const log = await this.db.emailLog.findFirst({
      where: { id: input.emailLogId, tenantId: input.tenantId },
    });
    if (!log) throw Object.assign(new Error('EmailLog not found'), { status: 404 });
    if (!['FAILED', 'DEAD_LETTER', 'BOUNCED'].includes(log.status)) {
      throw Object.assign(new Error('Sadece başarısız mailler tekrar denenebilir'), { status: 400 });
    }

    const updated = await this.db.emailLog.update({
      where: { id: log.id },
      data: {
        status: 'QUEUED',
        lastErrorCode: null,
        lastErrorMessage: null,
        queuedAt: new Date(),
      },
    });
    await this.db.emailEvent.create({
      data: {
        tenantId: log.tenantId,
        emailLogId: log.id,
        eventType: 'RETRYING',
        source: 'manual',
        meta: { actorId: input.actorId } as any,
      },
    });
    await this.db.auditLog.create({
      data: {
        action: 'EMAIL_RETRY_TRIGGERED',
        entityType: 'EmailLog',
        entityId: log.id,
        actorId: input.actorId,
        metadata: { templateKey: log.templateKey } as any,
      },
    });

    await this.producer.enqueue(log.queue, { emailLogId: log.id, tenantId: log.tenantId });
    return updated;
  }
}
