import { EmailLog, EmailQueue, PrismaClient, UserRole } from '@prisma/client';
import { prisma } from '../../../infrastructure/database/prisma';
import { EmailDispatcher, getEmailDispatcher } from './EmailDispatcher';
import { EmailQueueProducer, getEmailQueueProducer } from './EmailQueueProducer';
import { normalizeEmail } from './utils/emailNormalize';
import { evaluateWindow } from './utils/sendWindow';

export type SendEmailInput = {
  tenantId: string;
  templateKey: string;
  to: { userId?: string | null; email: string; role?: UserRole | null };
  data: Record<string, unknown>;
  forceQueue?: EmailQueue;
  relatedEntity?: { type: string; id: string };
  bypassPreferences?: boolean;        // sadece CRITICAL kullanımı
};

/**
 * Public API — diğer Use Case'ler bu sınıfı çağırır.
 * Akış:
 * 1) Aktif şablonu bul, queue belirle.
 * 2) Dispatcher.shouldSend → bloklanan yollar için EmailLog kaydı + erken çıkış.
 * 3) EmailLog QUEUED durumunda kaydı oluştur.
 * 4) Kuyruğa düşür (Redis disabled → log kaydı kalır, worker yok).
 */
export class EmailService {
  constructor(
    private readonly db: PrismaClient = prisma,
    private readonly dispatcher: EmailDispatcher = getEmailDispatcher(),
    private readonly producer: EmailQueueProducer = getEmailQueueProducer(),
  ) {}

  async send(input: SendEmailInput): Promise<EmailLog> {
    const template = await this.db.emailTemplate.findFirst({
      where: {
        tenantId: input.tenantId,
        key: input.templateKey,
        isActive: true,
      },
      orderBy: { version: 'desc' },
    });
    if (!template) {
      // Şablon yoksa silent başarısızlık yerine açıkça FAILED log üret.
      return this.db.emailLog.create({
        data: {
          tenantId: input.tenantId,
          recipientUserId: input.to.userId ?? null,
          recipientEmail: normalizeEmail(input.to.email),
          recipientRole: input.to.role ?? null,
          templateKey: input.templateKey,
          templateVersion: 0,
          queue: input.forceQueue ?? 'NOTIFY',
          status: 'FAILED',
          subject: '(template missing)',
          lastErrorCode: 'template_not_found',
          lastErrorMessage: `Template "${input.templateKey}" not found or inactive`,
          relatedEntityType: input.relatedEntity?.type ?? null,
          relatedEntityId: input.relatedEntity?.id ?? null,
          templateData: input.data as any,
        },
      });
    }

    const queue = input.forceQueue ?? template.defaultQueue;

    const decision = await this.dispatcher.shouldSend({
      tenantId: input.tenantId,
      recipientUserId: input.to.userId ?? null,
      recipientEmail: input.to.email,
      recipientRole: input.to.role ?? null,
      queue,
      templateKey: input.templateKey,
      bypassPreferences: input.bypassPreferences,
    });

    if (decision.status !== 'ALLOWED') {
      const log = await this.db.emailLog.create({
        data: {
          tenantId: input.tenantId,
          recipientUserId: input.to.userId ?? null,
          recipientEmail: normalizeEmail(input.to.email),
          recipientRole: input.to.role ?? null,
          templateKey: input.templateKey,
          templateVersion: template.version,
          queue,
          status: decision.status,
          subject: template.subject,
          templateData: input.data as any,
          lastErrorCode: decision.reason ?? null,
          lastErrorMessage: decision.reason ?? null,
          relatedEntityType: input.relatedEntity?.type ?? null,
          relatedEntityId: input.relatedEntity?.id ?? null,
        },
      });
      await this.db.emailEvent.create({
        data: {
          tenantId: input.tenantId,
          emailLogId: log.id,
          eventType: decision.status === 'SUPPRESSED' ? 'SUPPRESSED' : 'BLOCKED',
          source: 'worker',
          meta: { reason: decision.reason } as any,
        },
      });
      return log;
    }

    // Gönderim saat penceresi — pencere dışıysa job'u geciktir (reddetme).
    const settings = await this.db.adminSettings.findFirst({ where: { id: 1 } });
    const windowDecision =
      settings?.emailSendWindowEnabled &&
      (queue !== 'CRITICAL' || settings.emailSendWindowAppliesToCritical)
        ? evaluateWindow(new Date(), {
            enabled: true,
            startHour: settings.emailSendWindowStartHour,
            endHour: settings.emailSendWindowEndHour,
            timezone: settings.emailSendWindowTimezone,
          })
        : { inWindow: true as const, delayMs: 0 };

    const log = await this.db.emailLog.create({
      data: {
        tenantId: input.tenantId,
        recipientUserId: input.to.userId ?? null,
        recipientEmail: normalizeEmail(input.to.email),
        recipientRole: input.to.role ?? null,
        templateKey: input.templateKey,
        templateVersion: template.version,
        queue,
        status: 'QUEUED',
        subject: template.subject,
        templateData: input.data as any,
        relatedEntityType: input.relatedEntity?.type ?? null,
        relatedEntityId: input.relatedEntity?.id ?? null,
      },
    });

    await this.db.emailEvent.create({
      data: {
        tenantId: input.tenantId,
        emailLogId: log.id,
        eventType: 'QUEUED',
        source: 'worker',
        meta:
          !windowDecision.inWindow && 'nextOpensAt' in windowDecision
            ? ({ scheduledFor: windowDecision.nextOpensAt.toISOString(), reason: 'send_window' } as any)
            : undefined,
      },
    });

    await this.producer.enqueue(
      queue,
      { emailLogId: log.id, tenantId: input.tenantId },
      { delayMs: windowDecision.delayMs },
    );
    return log;
  }
}

let _service: EmailService | null = null;
export function getEmailService(): EmailService {
  if (!_service) _service = new EmailService();
  return _service;
}
