/**
 * AuditLogger — admin & güvenlik işlemleri için merkezi loglama.
 *
 * Kullanım (use case içinde):
 *   constructor(private readonly audit: AuditLogger) {}
 *   async execute(ctx, dto) {
 *     const before = await repo.find(dto.id);
 *     const after = await repo.update(dto);
 *     await this.audit.log(ctx, {
 *       action: 'ADMIN_SETTINGS_UPDATED',
 *       entityType: 'AdminSettings',
 *       entityId: dto.id,
 *       before,
 *       after,
 *     });
 *   }
 *
 * Not: AuditLog Prisma modeli mevcut. Yeni alanlar (tenantId, actorEmail, before/after,
 * ip, userAgent) `docs/migrations/audit-2fa-extension.md` migrasyonu sonra aktif olur.
 * Bu helper o alanlara doğrudan yazmak için hazır; migrasyon öncesi alan adları henüz
 * şemada yoksa `metadata` JSON içinde tutulur (best-effort).
 */
import { Injectable, Logger } from '@nestjs/common';
import { prisma } from '../database/prisma';
import { AuditAction } from '@prisma/client';

export interface AuditContext {
  userId?: string;
  email?: string;
  role?: string;
  tenantId?: string;
  ip?: string;
  userAgent?: string;
}

export interface AuditEntry {
  action: AuditAction | string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditLogger {
  private readonly logger = new Logger(AuditLogger.name);

  /**
   * Audit log kaydı yazar. Async ama best-effort: hata gönderilmez, loglanır.
   * Use case akışını bloklamamak için `await` etmek opsiyonel.
   */
  async log(ctx: AuditContext, entry: AuditEntry): Promise<void> {
    try {
      const meta: Record<string, unknown> = {
        ...(entry.metadata ?? {}),
      };
      // Migrasyon öncesi geriye dönük: yeni alanlar henüz şemada yoksa metadata'ya at
      if (ctx.email) meta.actorEmail = ctx.email;
      if (ctx.role) meta.actorRole = ctx.role;
      if (ctx.tenantId) meta.tenantId = ctx.tenantId;
      if (ctx.ip) meta.ip = ctx.ip;
      if (ctx.userAgent) meta.userAgent = ctx.userAgent;
      if (entry.before !== undefined) meta.before = entry.before;
      if (entry.after !== undefined) meta.after = entry.after;

      await prisma.auditLog.create({
        data: {
          action: entry.action as AuditAction,
          entityType: entry.entityType,
          entityId: entry.entityId,
          actorId: ctx.userId ?? null,
          metadata: meta as object,
        },
      });
    } catch (err) {
      // Audit log fail use case'i etkilememeli — sadece warn.
      this.logger.warn(
        `audit log failed: ${entry.entityType}/${entry.entityId} ${entry.action} — ${
          (err as Error).message
        }`,
      );
    }
  }

  /** Use case'i blok etmemek için fire-and-forget yardımcı. */
  logAsync(ctx: AuditContext, entry: AuditEntry): void {
    this.log(ctx, entry).catch(() => undefined);
  }
}

/**
 * Request'ten AuditContext üreten helper.
 * Express/Nest request'inde `req.user`, `req.tenant`, `req.ip`, `req.headers` olmalı.
 */
export function auditContextFromRequest(req: any): AuditContext {
  return {
    userId: req?.user?.id,
    email: req?.user?.email,
    role: req?.user?.role,
    tenantId: req?.tenant?.id ?? req?.user?.tenantId,
    ip: req?.ip ?? req?.headers?.['x-forwarded-for'],
    userAgent: req?.headers?.['user-agent'],
  };
}
