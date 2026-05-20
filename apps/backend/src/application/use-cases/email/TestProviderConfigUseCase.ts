import { PrismaClient } from '@prisma/client';
import { prisma } from '../../../infrastructure/database/prisma';
import {
  ProviderRegistry,
  getProviderRegistry,
} from '../../services/email/providers/ProviderRegistry';
import { EmailRenderer, getEmailRenderer } from '../../services/email/EmailRenderer';

export type TestProviderInput = {
  tenantId: string;
  actorId: string;
  providerConfigId: string;
  toEmail: string;
  subject?: string;
  data?: Record<string, unknown>;
};

/**
 * Admin "test maili gönder" — gerçek sağlayıcıyla tek bir mail gönderir.
 * test-template.hbs şablonu kullanılır (basit içerik).
 */
export class TestProviderConfigUseCase {
  constructor(
    private readonly db: PrismaClient = prisma,
    private readonly registry: ProviderRegistry = getProviderRegistry(),
    private readonly renderer: EmailRenderer = getEmailRenderer(),
  ) {}

  async execute(input: TestProviderInput) {
    const resolved = await this.registry.resolveById(input.providerConfigId);
    if (!resolved || resolved.config.tenantId !== input.tenantId) {
      throw Object.assign(new Error('Provider not found'), { status: 404 });
    }
    const rendered = await this.renderer.render({
      subject: input.subject ?? 'Test E-posta — Sınav Salonu',
      htmlPath: 'test-template.hbs',
      textPath: 'test-template.txt',
      data: input.data ?? { sentAt: new Date().toISOString() },
    });
    const result = await resolved.transport.send({
      to: { email: input.toEmail },
      from: { email: resolved.config.fromEmail, name: resolved.config.fromName },
      replyTo: resolved.config.replyToEmail
        ? { email: resolved.config.replyToEmail }
        : undefined,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
    await this.db.auditLog.create({
      data: {
        action: 'EMAIL_PROVIDER_TESTED',
        entityType: 'EmailProviderConfig',
        entityId: resolved.config.id,
        actorId: input.actorId,
        metadata: { to: input.toEmail, ok: result.ok } as any,
      },
    });
    if (result.ok) {
      await this.db.emailProviderConfig.update({
        where: { id: resolved.config.id },
        data: { lastSuccessAt: new Date() },
      });
      return { ok: true, messageId: result.messageId, providerKind: result.providerKind };
    }
    await this.db.emailProviderConfig.update({
      where: { id: resolved.config.id },
      data: {
        lastFailureAt: new Date(),
        lastFailureReason: `${result.errorCode}: ${result.errorMessage.slice(0, 200)}`,
      },
    });
    return {
      ok: false,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
      providerKind: result.providerKind,
    };
  }
}
