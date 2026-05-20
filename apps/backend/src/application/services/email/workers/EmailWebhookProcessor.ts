import { EmailEventType, PrismaClient, SuppressionReason } from '@prisma/client';
import { prisma } from '../../../../infrastructure/database/prisma';
import { normalizeEmail } from '../utils/emailNormalize';

export type BrevoWebhookEvent = {
  event: string;                 // "delivered" | "hard_bounce" | "soft_bounce" | "spam" | "opened" | "clicked" | "blocked" | "unsubscribed"
  email: string;
  'message-id'?: string;
  messageId?: string;
  reason?: string;
  date?: string;
  ts?: number;
};

const BREVO_EVENT_MAP: Record<string, EmailEventType> = {
  delivered: 'DELIVERED',
  hard_bounce: 'HARD_BOUNCED',
  hardBounce: 'HARD_BOUNCED',
  soft_bounce: 'SOFT_BOUNCED',
  softBounce: 'SOFT_BOUNCED',
  spam: 'COMPLAINED',
  blocked: 'BOUNCED',
  opened: 'OPENED',
  unique_opened: 'OPENED',
  click: 'CLICKED',
  clicks: 'CLICKED',
  unsubscribed: 'BLOCKED',
};

/**
 * Brevo webhook payload → EmailEvent + (gerekirse) SuppressedEmail.
 * URL: POST /webhooks/email/brevo?secret=<webhookSecret>
 */
export class EmailWebhookProcessor {
  constructor(private readonly db: PrismaClient = prisma) {}

  async handleBrevo(input: { tenantId: string; secret: string; payload: BrevoWebhookEvent | BrevoWebhookEvent[] }) {
    // Secret doğrulaması — bu tenant için aktif config'lerden biriyle eşleşmeli
    const configs = await this.db.emailProviderConfig.findMany({
      where: { tenantId: input.tenantId, kind: 'BREVO_API', isActive: true },
      select: { id: true, webhookSecret: true },
    });
    const validSecret = configs.some((c) => c.webhookSecret && c.webhookSecret === input.secret);
    if (!validSecret) {
      throw Object.assign(new Error('Invalid webhook secret'), { status: 401 });
    }

    const events = Array.isArray(input.payload) ? input.payload : [input.payload];
    const processed: Array<{ logId: string | null; eventType: EmailEventType }> = [];

    for (const ev of events) {
      const messageId = ev.messageId || ev['message-id'];
      const eventType = BREVO_EVENT_MAP[ev.event];
      if (!eventType) continue;
      let logId: string | null = null;
      if (messageId) {
        const log = await this.db.emailLog.findFirst({
          where: { tenantId: input.tenantId, providerMessageId: messageId },
          select: { id: true },
        });
        logId = log?.id ?? null;
      }
      if (logId) {
        await this.db.emailEvent.create({
          data: {
            tenantId: input.tenantId,
            emailLogId: logId,
            eventType,
            source: 'provider_webhook',
            meta: ev as any,
          },
        });
        await this.maybeUpdateLogStatus(logId, eventType);
      }
      if (this.shouldSuppress(eventType)) {
        await this.upsertSuppression({
          tenantId: input.tenantId,
          email: ev.email,
          eventType,
          reason: ev.reason,
        });
      }
      processed.push({ logId, eventType });
    }
    return { processed: processed.length };
  }

  private async maybeUpdateLogStatus(logId: string, eventType: EmailEventType): Promise<void> {
    const updates: Record<string, any> = {};
    if (eventType === 'DELIVERED') {
      updates.status = 'DELIVERED';
      updates.deliveredAt = new Date();
    } else if (eventType === 'HARD_BOUNCED' || eventType === 'BOUNCED') {
      updates.status = 'BOUNCED';
      updates.bouncedAt = new Date();
    } else if (eventType === 'COMPLAINED') {
      updates.status = 'COMPLAINED';
    }
    if (Object.keys(updates).length > 0) {
      await this.db.emailLog.update({ where: { id: logId }, data: updates });
    }
  }

  private shouldSuppress(eventType: EmailEventType): boolean {
    return eventType === 'HARD_BOUNCED' || eventType === 'COMPLAINED' || eventType === 'BOUNCED';
  }

  private async upsertSuppression(input: {
    tenantId: string;
    email: string;
    eventType: EmailEventType;
    reason?: string;
  }) {
    const reason: SuppressionReason =
      input.eventType === 'COMPLAINED'
        ? 'SPAM_COMPLAINT'
        : input.eventType === 'HARD_BOUNCED'
          ? 'HARD_BOUNCE'
          : 'INVALID_ADDRESS';
    const email = normalizeEmail(input.email);
    await this.db.suppressedEmail.upsert({
      where: { tenantId_email: { tenantId: input.tenantId, email } },
      create: {
        tenantId: input.tenantId,
        email,
        reason,
        source: 'webhook',
        note: input.reason ?? null,
      },
      update: {
        reason,
        source: 'webhook',
        note: input.reason ?? null,
      },
    });
  }
}

let _processor: EmailWebhookProcessor | null = null;
export function getEmailWebhookProcessor(): EmailWebhookProcessor {
  if (!_processor) _processor = new EmailWebhookProcessor();
  return _processor;
}
