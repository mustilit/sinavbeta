/**
 * HandleIyzicoWebhookUseCase — Iyzico webhook event'lerini işler.
 *
 * Iyzico, Stripe'a kıyasla daha kısıtlı bir event şeması sunar. Şu an için
 * payment status değişikliği desteği yeterli — abonelik akışı tamamen Stripe
 * üzerinden, Iyzico tek seferlik satın alma için.
 *
 * Beklenen payload örneği (minimal):
 *   {
 *     "eventType": "payment.success",
 *     "paymentId": "...",         // Iyzico payment ID
 *     "conversationId": "...",    // Purchase.id (bizim kaydımız)
 *     "status": "SUCCESS"
 *   }
 *
 * İmza doğrulama controller'da; bu use case parse edilmiş payload alır.
 *
 * Dedup: webhookEvent tablosunda (provider=iyzico, providerEventId) UNIQUE.
 * providerEventId yoksa paymentId fallback.
 */
// @ts-nocheck

import { Injectable, Logger } from '@nestjs/common';
import { prisma } from '../../../infrastructure/database/prisma';
import { AuditLogger } from '../../../infrastructure/audit/AuditLogger';

interface IyzicoWebhookPayload {
  eventType?: string;
  paymentId?: string;
  iyziEventType?: string;
  iyziReferenceCode?: string;
  conversationId?: string;
  status?: string;
}

@Injectable()
export class HandleIyzicoWebhookUseCase {
  private readonly logger = new Logger(HandleIyzicoWebhookUseCase.name);

  constructor(private readonly audit: AuditLogger) {}

  async execute(payload: IyzicoWebhookPayload): Promise<void> {
    const eventId =
      payload.paymentId ??
      payload.iyziReferenceCode ??
      payload.conversationId ??
      `iyz_${Date.now()}`;

    const fresh = await this.recordEvent(eventId, payload);
    if (!fresh) {
      this.logger.log(`iyzico webhook duplicate skipped: ${eventId}`);
      return;
    }

    try {
      const conversationId = payload.conversationId;
      const status = (payload.status ?? '').toUpperCase();
      const eventType = payload.eventType ?? payload.iyziEventType ?? '';

      if (!conversationId) {
        this.logger.warn(`iyzico webhook conversationId yok — skip`);
        await this.markProcessed(eventId);
        return;
      }

      // SUCCESS / payment.success → purchase'ı PAID'e taşı
      if (status === 'SUCCESS' || eventType.includes('success')) {
        const updated = await (prisma as any).purchase.update({
          where: { id: conversationId },
          data: { paymentStatus: 'PAID' },
        });
        this.audit.logAsync(
          { userId: updated?.candidateId, tenantId: updated?.tenantId },
          {
            action: 'PURCHASE' as any,
            entityType: 'Purchase',
            entityId: conversationId,
            after: { paymentStatus: 'PAID', paymentId: payload.paymentId },
          },
        );
      } else if (status === 'FAILURE' || eventType.includes('fail')) {
        await (prisma as any).purchase.update({
          where: { id: conversationId },
          data: { paymentStatus: 'FAILED' },
        });
      } else {
        this.logger.debug(`iyzico unhandled status=${status} event=${eventType}`);
      }

      await this.markProcessed(eventId);
    } catch (err) {
      await this.markFailed(eventId, err as Error);
      throw err;
    }
  }

  private async recordEvent(eventId: string, payload: unknown): Promise<boolean> {
    try {
      await (prisma as any).webhookEvent.create({
        data: {
          provider: 'iyzico',
          providerEventId: eventId,
          payload: payload as any,
        },
      });
      return true;
    } catch (err: any) {
      if (err?.code === 'P2002') return false;
      throw err;
    }
  }

  private async markProcessed(eventId: string): Promise<void> {
    try {
      await (prisma as any).webhookEvent.update({
        where: { provider_providerEventId: { provider: 'iyzico', providerEventId: eventId } },
        data: { processedAt: new Date(), error: null },
      });
    } catch (err) {
      this.logger.warn(`iyzico markProcessed failed: ${eventId} ${(err as Error).message}`);
    }
  }

  private async markFailed(eventId: string, err: Error): Promise<void> {
    try {
      await (prisma as any).webhookEvent.update({
        where: { provider_providerEventId: { provider: 'iyzico', providerEventId: eventId } },
        data: { error: (err.message ?? String(err)).slice(0, 1000) },
      });
    } catch {
      // best effort
    }
  }
}
