import { EmailProviderKind, PrismaClient } from '@prisma/client';
import { prisma } from '../../../infrastructure/database/prisma';
import { encryptJson } from '../../services/email/utils/encryption';
import { getProviderRegistry } from '../../services/email/providers/ProviderRegistry';
import { randomBytes } from 'crypto';

export type CreateProviderInput = {
  tenantId: string;
  actorId: string;
  name: string;
  kind: EmailProviderKind;
  priority?: number;
  isActive?: boolean;
  fromEmail: string;
  fromName: string;
  replyToEmail?: string;
  dailyCap?: number;
  generateWebhookSecret?: boolean;
  // BREVO_API
  apiKey?: string;
  // SMTP
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  smtpPass?: string;
};

export type UpdateProviderInput = Partial<CreateProviderInput> & {
  tenantId: string;
  actorId: string;
  id: string;
};

/**
 * EmailProviderConfig CRUD. Secret alanları AES-256-GCM ile şifrelenir;
 * API yanıtlarında plain dönmez (mask'lenir).
 */
export class ManageProviderConfigUseCase {
  constructor(private readonly db: PrismaClient = prisma) {}

  async list(tenantId: string) {
    const rows = await this.db.emailProviderConfig.findMany({
      where: { tenantId },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((r) => this.serialize(r));
  }

  async create(input: CreateProviderInput) {
    if (input.kind === 'CONSOLE' && process.env.NODE_ENV === 'production') {
      throw Object.assign(new Error('CONSOLE provider üretimde yasak'), { status: 400 });
    }
    const encrypted = this.encryptSecrets(input);
    const cfg = await this.db.emailProviderConfig.create({
      data: {
        tenantId: input.tenantId,
        name: input.name,
        kind: input.kind,
        priority: input.priority ?? 100,
        isActive: input.isActive ?? true,
        fromEmail: input.fromEmail,
        fromName: input.fromName,
        replyToEmail: input.replyToEmail ?? null,
        dailyCap: input.dailyCap ?? (input.kind === 'BREVO_API' ? 300 : null),
        encryptedSecrets: encrypted,
        webhookSecret: input.generateWebhookSecret
          ? randomBytes(24).toString('base64url')
          : null,
      },
    });
    await this.audit('EMAIL_PROVIDER_CREATED', cfg.id, input.actorId, { name: cfg.name, kind: cfg.kind });
    return this.serialize(cfg);
  }

  async update(input: UpdateProviderInput) {
    const existing = await this.db.emailProviderConfig.findFirst({
      where: { id: input.id, tenantId: input.tenantId },
    });
    if (!existing) throw Object.assign(new Error('Provider not found'), { status: 404 });

    const data: any = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.priority !== undefined) data.priority = input.priority;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.fromEmail !== undefined) data.fromEmail = input.fromEmail;
    if (input.fromName !== undefined) data.fromName = input.fromName;
    if (input.replyToEmail !== undefined) data.replyToEmail = input.replyToEmail;
    if (input.dailyCap !== undefined) data.dailyCap = input.dailyCap;
    if (input.generateWebhookSecret) data.webhookSecret = randomBytes(24).toString('base64url');
    const hasNewSecrets = this.hasSecretChanges(input);
    if (hasNewSecrets) {
      data.encryptedSecrets = this.encryptSecrets({ ...input, kind: existing.kind } as CreateProviderInput);
    }

    const updated = await this.db.emailProviderConfig.update({ where: { id: input.id }, data });
    getProviderRegistry().invalidate(input.id);
    await this.audit('EMAIL_PROVIDER_UPDATED', input.id, input.actorId, { changes: Object.keys(data) });
    return this.serialize(updated);
  }

  async delete(input: { tenantId: string; actorId: string; id: string }) {
    const existing = await this.db.emailProviderConfig.findFirst({
      where: { id: input.id, tenantId: input.tenantId },
    });
    if (!existing) throw Object.assign(new Error('Provider not found'), { status: 404 });
    await this.db.emailProviderConfig.delete({ where: { id: input.id } });
    getProviderRegistry().invalidate(input.id);
    await this.audit('EMAIL_PROVIDER_DELETED', input.id, input.actorId, { name: existing.name });
    return { ok: true };
  }

  private hasSecretChanges(input: UpdateProviderInput): boolean {
    return !!(input.apiKey || input.smtpHost || input.smtpUser || input.smtpPass);
  }

  private encryptSecrets(input: CreateProviderInput): string {
    if (input.kind === 'BREVO_API') {
      if (!input.apiKey) throw Object.assign(new Error('apiKey gerekli (BREVO_API)'), { status: 400 });
      return encryptJson({ apiKey: input.apiKey });
    }
    if (input.kind === 'SMTP') {
      if (!input.smtpHost || !input.smtpPort || !input.smtpUser || !input.smtpPass) {
        throw Object.assign(new Error('SMTP host/port/user/pass gerekli'), { status: 400 });
      }
      return encryptJson({
        smtpHost: input.smtpHost,
        smtpPort: input.smtpPort,
        smtpSecure: !!input.smtpSecure,
        smtpUser: input.smtpUser,
        smtpPass: input.smtpPass,
      });
    }
    // CONSOLE — boş JSON
    return encryptJson({});
  }

  private serialize(cfg: {
    id: string;
    tenantId: string;
    name: string;
    kind: EmailProviderKind;
    priority: number;
    isActive: boolean;
    fromEmail: string;
    fromName: string;
    replyToEmail: string | null;
    dailyCap: number | null;
    dailySentCount: number;
    dailyResetAt: Date;
    webhookSecret: string | null;
    lastSuccessAt: Date | null;
    lastFailureAt: Date | null;
    lastFailureReason: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: cfg.id,
      name: cfg.name,
      kind: cfg.kind,
      priority: cfg.priority,
      isActive: cfg.isActive,
      fromEmail: cfg.fromEmail,
      fromName: cfg.fromName,
      replyToEmail: cfg.replyToEmail,
      dailyCap: cfg.dailyCap,
      dailySentCount: cfg.dailySentCount,
      dailyResetAt: cfg.dailyResetAt,
      // webhookSecret tam dönülmez — yalnızca admin oluştururken bir kez gösterilir
      webhookSecretSet: !!cfg.webhookSecret,
      webhookSecret: cfg.webhookSecret, // dahili kullanım için
      lastSuccessAt: cfg.lastSuccessAt,
      lastFailureAt: cfg.lastFailureAt,
      lastFailureReason: cfg.lastFailureReason,
      hasSecrets: true,
      createdAt: cfg.createdAt,
      updatedAt: cfg.updatedAt,
    };
  }

  private async audit(
    action: 'EMAIL_PROVIDER_CREATED' | 'EMAIL_PROVIDER_UPDATED' | 'EMAIL_PROVIDER_DELETED',
    id: string,
    actorId: string,
    metadata: Record<string, unknown>,
  ) {
    await this.db.auditLog.create({
      data: { action, entityType: 'EmailProviderConfig', entityId: id, actorId, metadata: metadata as any },
    });
  }
}
