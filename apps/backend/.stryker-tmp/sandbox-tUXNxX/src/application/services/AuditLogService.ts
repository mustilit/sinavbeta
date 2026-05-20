// @ts-nocheck
import { ExtendedAuditAction } from '../../domain/types';
import { IAuditLogRepository } from '../../domain/interfaces/IAuditLogRepository';

/**
 * AuditLogService - Kritik işlemler loglanır
 *
 * Zorunlu loglanacak işlemler:
 * - PURCHASE (Satın alma)
 * - REFUND (İade)
 * - PRICE_CHANGE (Fiyat değişimi)
 * - PUBLISH
 * - UNPUBLISH
 */
export class AuditLogService {
  constructor(private readonly auditLogRepository: IAuditLogRepository) {}

  async log(
    action: ExtendedAuditAction,
    entityType: string,
    entityId: string,
    options?: { actorId?: string | null; metadata?: Record<string, unknown> }
  ): Promise<void> {
    await this.auditLogRepository.create({
      action,
      entityType,
      entityId,
      actorId: options?.actorId ?? null,
      metadata: options?.metadata ?? {},
    });
  }

  async logPurchase(
    entityType: string,
    entityId: string,
    metadata: { orderId?: string; amount?: number; [key: string]: unknown },
    actorId?: string | null
  ): Promise<void> {
    await this.log('PURCHASE', entityType, entityId, { actorId, metadata });
  }

  async logRefund(
    entityType: string,
    entityId: string,
    metadata: { orderId?: string; amount?: number; reason?: string; [key: string]: unknown },
    actorId?: string | null
  ): Promise<void> {
    await this.log('REFUND', entityType, entityId, { actorId, metadata });
  }

  async logPriceChange(
    entityType: string,
    entityId: string,
    metadata: { oldPrice: number; newPrice: number; [key: string]: unknown },
    actorId?: string | null
  ): Promise<void> {
    await this.log('PRICE_CHANGE', entityType, entityId, { actorId, metadata });
  }

  async logPublish(entityType: string, entityId: string, actorId?: string | null): Promise<void> {
    await this.log('PUBLISH', entityType, entityId, { actorId });
  }

  async logUnpublish(entityType: string, entityId: string, actorId?: string | null): Promise<void> {
    await this.log('UNPUBLISH', entityType, entityId, { actorId });
  }
}
