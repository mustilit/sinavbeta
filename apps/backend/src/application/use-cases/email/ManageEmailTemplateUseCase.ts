import { EmailQueue, PrismaClient } from '@prisma/client';
import { prisma } from '../../../infrastructure/database/prisma';

export type UpdateTemplateInput = {
  tenantId: string;
  actorId: string;
  id: string;
  isActive?: boolean;
  subject?: string;
  description?: string;
  defaultQueue?: EmailQueue;
};

/**
 * Şablon kayıtları seed ile dosya bazlı tanımlanır; admin sadece subject/active/description
 * gibi meta alanları günceller. Yeni şablon dosyası eklemek geliştirici işidir.
 */
export class ManageEmailTemplateUseCase {
  constructor(private readonly db: PrismaClient = prisma) {}

  async list(tenantId: string) {
    return this.db.emailTemplate.findMany({
      where: { tenantId },
      orderBy: [{ key: 'asc' }, { version: 'desc' }],
    });
  }

  async update(input: UpdateTemplateInput) {
    const existing = await this.db.emailTemplate.findFirst({
      where: { id: input.id, tenantId: input.tenantId },
    });
    if (!existing) throw Object.assign(new Error('Template not found'), { status: 404 });

    const data: any = {};
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.subject !== undefined) data.subject = input.subject;
    if (input.description !== undefined) data.description = input.description;
    if (input.defaultQueue !== undefined) data.defaultQueue = input.defaultQueue;
    if (Object.keys(data).length === 0) return existing;

    const updated = await this.db.emailTemplate.update({
      where: { id: input.id },
      data,
    });
    await this.db.auditLog.create({
      data: {
        action: 'EMAIL_TEMPLATE_UPDATED',
        entityType: 'EmailTemplate',
        entityId: existing.id,
        actorId: input.actorId,
        metadata: { key: existing.key, changes: Object.keys(data) } as any,
      },
    });
    return updated;
  }
}
