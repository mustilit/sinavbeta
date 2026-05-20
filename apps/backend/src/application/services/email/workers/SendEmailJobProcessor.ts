import { EmailLog, EmailQueue, PrismaClient } from '@prisma/client';
import { prisma } from '../../../../infrastructure/database/prisma';
import { EmailRenderer, getEmailRenderer } from '../EmailRenderer';
import { generateUnsubscribeToken } from '../utils/unsubscribeToken';
import { EmailEnvelope, TransportResult } from '../providers/IEmailTransport';
import { getProviderRegistry, ProviderRegistry, ResolvedProvider } from '../providers/ProviderRegistry';

export type ProcessorResult = {
  emailLogId: string;
  status: 'SENT' | 'FAILED' | 'DEAD_LETTER';
  providerKind?: string;
  messageId?: string;
  errorCode?: string;
  errorMessage?: string;
};

/**
 * Worker job handler — bir EmailLog kaydı için aktif sağlayıcılarla gönderim dener.
 * Birinci sağlayıcı retryable hata verirse fallback'e geçer.
 * Tüm sağlayıcılar başarısızsa BullMQ tarafından retry edilir; son denemede DEAD_LETTER.
 */
export class SendEmailJobProcessor {
  constructor(
    private readonly db: PrismaClient = prisma,
    private readonly registry: ProviderRegistry = getProviderRegistry(),
    private readonly renderer: EmailRenderer = getEmailRenderer(),
  ) {}

  async process(input: {
    emailLogId: string;
    tenantId: string;
    isFinalAttempt?: boolean;
  }): Promise<ProcessorResult> {
    const log = await this.db.emailLog.findUnique({
      where: { id: input.emailLogId },
      include: { recipient: true },
    });
    if (!log) {
      return {
        emailLogId: input.emailLogId,
        status: 'FAILED',
        errorCode: 'log_not_found',
        errorMessage: 'EmailLog kaydı bulunamadı',
      };
    }
    if (log.status === 'SENT' || log.status === 'DELIVERED') {
      // idempotent
      return {
        emailLogId: log.id,
        status: 'SENT',
        messageId: log.providerMessageId ?? undefined,
        providerKind: log.providerKind ?? undefined,
      };
    }

    await this.db.emailLog.update({
      where: { id: log.id },
      data: { status: 'SENDING', attemptCount: { increment: 1 } },
    });
    await this.db.emailEvent.create({
      data: {
        tenantId: log.tenantId,
        emailLogId: log.id,
        eventType: 'SENDING',
        source: 'worker',
      },
    });

    // Şablonu render et
    const template = await this.db.emailTemplate.findFirst({
      where: {
        tenantId: log.tenantId,
        key: log.templateKey,
        version: log.templateVersion,
      },
    });
    if (!template) {
      return this.markFailed(log.id, log.tenantId, 'template_missing', 'Template kaydı silinmiş', input.isFinalAttempt);
    }

    // unsubscribe token enjeksiyonu (NOTIFY/BULK için)
    let unsubscribeUrl: string | undefined;
    if (log.queue !== 'CRITICAL' && log.recipient) {
      unsubscribeUrl = await this.ensureUnsubscribeUrl(log.recipient.id);
    }

    let rendered: { subject: string; html: string; text?: string };
    try {
      const data = (log.templateData ?? {}) as Record<string, unknown>;
      rendered = await this.renderer.render({
        subject: template.subject,
        htmlPath: template.htmlPath,
        textPath: template.textPath ?? undefined,
        data: {
          ...data,
          recipient: { email: log.recipientEmail, name: log.recipient?.username },
          unsubscribeUrl,
        },
      });
    } catch (err: any) {
      return this.markFailed(
        log.id,
        log.tenantId,
        'render_error',
        err?.message || 'Template render failed',
        input.isFinalAttempt,
      );
    }

    // Aktif sağlayıcıları al
    const providers = await this.registry.listActive(log.tenantId);
    if (providers.length === 0) {
      return this.markFailed(
        log.id,
        log.tenantId,
        'no_active_provider',
        'Aktif mail sağlayıcısı tanımlı değil',
        input.isFinalAttempt,
      );
    }

    let lastErrorCode = 'unknown';
    let lastErrorMessage = '';
    for (const p of providers) {
      const envelope = this.buildEnvelope(log, p, rendered, unsubscribeUrl);
      const result = await p.transport.send(envelope);
      if (result.ok) {
        await this.markSent(log, p, result);
        return {
          emailLogId: log.id,
          status: 'SENT',
          messageId: result.messageId,
          providerKind: result.providerKind,
        };
      }
      lastErrorCode = result.errorCode;
      lastErrorMessage = result.errorMessage;
      await this.updateProviderHealth(p, result);
      if (!result.retryable) {
        // permanent failure — fallback'e geç
        continue;
      }
      // retryable → fallback'e geç (aynı denemede), tümü retryable ise BullMQ retry tetikler
    }

    return this.markFailed(log.id, log.tenantId, lastErrorCode, lastErrorMessage, input.isFinalAttempt);
  }

  private async markSent(
    log: EmailLog,
    p: ResolvedProvider,
    result: Extract<TransportResult, { ok: true }>,
  ): Promise<void> {
    await this.db.$transaction([
      this.db.emailLog.update({
        where: { id: log.id },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          providerConfigId: p.config.id,
          providerKind: result.providerKind,
          providerMessageId: result.messageId,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      }),
      this.db.emailEvent.create({
        data: {
          tenantId: log.tenantId,
          emailLogId: log.id,
          eventType: 'SENT',
          source: 'worker',
          meta: { provider: result.providerKind, messageId: result.messageId } as any,
        },
      }),
      this.db.emailProviderConfig.update({
        where: { id: p.config.id },
        data: {
          lastSuccessAt: new Date(),
          dailySentCount: { increment: 1 },
        },
      }),
    ]);
  }

  private async markFailed(
    logId: string,
    tenantId: string,
    code: string,
    message: string,
    isFinalAttempt?: boolean,
  ): Promise<ProcessorResult> {
    const status = isFinalAttempt ? 'DEAD_LETTER' : 'FAILED';
    await this.db.emailLog.update({
      where: { id: logId },
      data: { status, lastErrorCode: code, lastErrorMessage: message },
    });
    await this.db.emailEvent.create({
      data: {
        tenantId,
        emailLogId: logId,
        eventType: isFinalAttempt ? 'FAILED' : 'RETRYING',
        source: 'worker',
        meta: { code, message } as any,
      },
    });
    return { emailLogId: logId, status, errorCode: code, errorMessage: message };
  }

  private async updateProviderHealth(p: ResolvedProvider, result: Extract<TransportResult, { ok: false }>): Promise<void> {
    await this.db.emailProviderConfig.update({
      where: { id: p.config.id },
      data: {
        lastFailureAt: new Date(),
        lastFailureReason: `${result.errorCode}: ${result.errorMessage.slice(0, 200)}`,
      },
    });
  }

  private buildEnvelope(
    log: EmailLog & { recipient: { username: string } | null },
    p: ResolvedProvider,
    rendered: { subject: string; html: string; text?: string },
    unsubscribeUrl?: string,
  ): EmailEnvelope {
    const headers: Record<string, string> = {};
    if (unsubscribeUrl) {
      headers['List-Unsubscribe'] = `<${unsubscribeUrl}>`;
      headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
    }
    return {
      to: { email: log.recipientEmail, name: log.recipient?.username },
      from: { email: p.config.fromEmail, name: p.config.fromName },
      replyTo: p.config.replyToEmail
        ? { email: p.config.replyToEmail }
        : undefined,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      headers,
    };
  }

  private async ensureUnsubscribeUrl(userId: string): Promise<string | undefined> {
    const u = await this.db.user.findUnique({
      where: { id: userId },
      select: { emailUnsubscribeToken: true },
    });
    let token = u?.emailUnsubscribeToken;
    if (!token) {
      token = generateUnsubscribeToken();
      await this.db.user.update({
        where: { id: userId },
        data: { emailUnsubscribeToken: token },
      });
    }
    const frontend = process.env.FRONTEND_URL || 'http://localhost:5173';
    return `${frontend}/unsubscribe?token=${encodeURIComponent(token)}`;
  }
}
