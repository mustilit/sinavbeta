/**
 * HandleStripeWebhookUseCase — Stripe webhook event'lerini işler.
 *
 * İmza doğrulama controller'da yapılır (verifyStripeSignature). Bu use case
 * sadece parse edilmiş event'i alır, dedup eder, repo + audit yan etkilerini
 * yürütür.
 *
 * Desteklenen event'ler:
 *   - checkout.session.completed       → subscription'ı retrieve et + upsert
 *   - customer.subscription.updated    → status + period güncelle
 *   - customer.subscription.deleted    → CANCELED + audit
 *   - invoice.paid                     → audit log (PURCHASE)
 *   - invoice.payment_failed           → PAST_DUE + audit
 *   - customer.subscription.trial_will_end → log only
 *
 * Dedup: webhook_events tablosunda (provider, providerEventId) UNIQUE.
 * Stripe at-least-once teslimat yapar; aynı event.id ikinci kez gelirse no-op.
 *
 * İlgili:
 *   - apps/backend/src/nest/security/verifyWebhookSignature.ts
 *   - apps/backend/src/infrastructure/services/StripeBillingService.ts
 *   - docs/proposed-claude/skills/idempotency/SKILL.md
 */
// @ts-nocheck

import { Injectable, Inject, Logger } from '@nestjs/common';
import type { Stripe } from 'stripe/cjs/stripe.core';
import { prisma } from '../../../infrastructure/database/prisma';
import {
  SUBSCRIPTION_REPOSITORY,
  type SubscriptionRepository,
} from '../../../domain/interfaces/SubscriptionRepository';
import { StripeBillingService } from '../../../infrastructure/services/StripeBillingService';
import { AuditLogger } from '../../../infrastructure/audit/AuditLogger';
import type { SubscriberKind } from '@prisma/client';

@Injectable()
export class HandleStripeWebhookUseCase {
  private readonly logger = new Logger(HandleStripeWebhookUseCase.name);

  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subRepo: SubscriptionRepository,
    private readonly stripe: StripeBillingService,
    private readonly audit: AuditLogger,
  ) {}

  async execute(event: Stripe.Event): Promise<void> {
    // 1) Dedup: aynı event.id daha önce geldiyse no-op.
    const isFresh = await this.recordEvent(event);
    if (!isFresh) {
      this.logger.log(`webhook duplicate skipped: ${event.id} (${event.type})`);
      return;
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await this.onCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
          break;
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          await this.onSubscriptionUpdated(event.data.object as Stripe.Subscription);
          break;
        case 'customer.subscription.deleted':
          await this.onSubscriptionDeleted(event.data.object as Stripe.Subscription);
          break;
        case 'invoice.paid':
          await this.onInvoicePaid(event.data.object as Stripe.Invoice);
          break;
        case 'invoice.payment_failed':
          await this.onInvoicePaymentFailed(event.data.object as Stripe.Invoice);
          break;
        case 'customer.subscription.trial_will_end':
          this.logger.log(
            `trial_will_end: sub=${(event.data.object as Stripe.Subscription).id}`,
          );
          break;
        default:
          this.logger.debug(`unhandled stripe event: ${event.type}`);
      }
      await this.markProcessed(event.id);
    } catch (err) {
      await this.markFailed(event.id, err as Error);
      throw err;
    }
  }

  // ── Event handler'lar ──────────────────────────────────────────────────

  private async onCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    if (session.mode !== 'subscription' || !session.subscription) {
      this.logger.debug(`checkout.session.completed mode=${session.mode} — skip`);
      return;
    }
    const subscriptionId =
      typeof session.subscription === 'string' ? session.subscription : session.subscription.id;

    const metadata = session.metadata ?? {};
    const tenantId = metadata.tenantId;
    const kind = (metadata.kind as SubscriberKind) ?? ('EDUCATOR' as any);
    const subscriberId = metadata.subscriberId ?? metadata.userId;

    if (!tenantId || !subscriberId) {
      this.logger.warn(
        `checkout.session.completed metadata eksik (tenantId/subscriberId) — sub=${subscriptionId}`,
      );
      return;
    }

    const stripeSub = await this.stripe.retrieveSubscription(subscriptionId);
    const input = this.stripe.mapStripeSubscription(stripeSub, tenantId, kind, subscriberId);
    const saved = await this.subRepo.upsertByProviderRef(input);

    this.audit.logAsync(
      { userId: subscriberId, tenantId },
      {
        action: 'SUBSCRIPTION_CREATED' as any,
        entityType: 'Subscription',
        entityId: saved.id ?? subscriptionId,
        after: { tier: input.tier, status: input.status, providerRef: input.providerRef },
      },
    );
  }

  private async onSubscriptionUpdated(stripeSub: Stripe.Subscription): Promise<void> {
    const existing = await this.subRepo.findByProviderRef(stripeSub.id);
    if (!existing) {
      // Henüz görmediğimiz subscription — metadata'dan upsert dene.
      const metadata = stripeSub.metadata ?? {};
      const tenantId = metadata.tenantId;
      const kind = (metadata.kind as SubscriberKind) ?? ('EDUCATOR' as any);
      const subscriberId = metadata.subscriberId ?? metadata.userId;
      if (!tenantId || !subscriberId) {
        this.logger.warn(
          `subscription.updated metadata eksik — sub=${stripeSub.id}, upsert atlandı`,
        );
        return;
      }
      const input = this.stripe.mapStripeSubscription(stripeSub, tenantId, kind, subscriberId);
      await this.subRepo.upsertByProviderRef(input);
      return;
    }

    const status = this.stripe.mapStatus(stripeSub.status);
    // current_period_start/end moved to SubscriptionItem in Stripe API v22; cast until migrated.
    const subAny = stripeSub as any;
    await this.subRepo.updateStatus(existing.id, status, {
      currentPeriodStart: subAny.current_period_start
        ? new Date(subAny.current_period_start * 1000)
        : null,
      currentPeriodEnd: subAny.current_period_end
        ? new Date(subAny.current_period_end * 1000)
        : null,
      cancelAtPeriodEnd: !!stripeSub.cancel_at_period_end,
      canceledAt: stripeSub.canceled_at ? new Date(stripeSub.canceled_at * 1000) : null,
    });

    this.audit.logAsync(
      { userId: existing.subscriberId, tenantId: existing.tenantId },
      {
        action: 'SUBSCRIPTION_UPDATED' as any,
        entityType: 'Subscription',
        entityId: existing.id,
        after: { status, cancelAtPeriodEnd: !!stripeSub.cancel_at_period_end },
      },
    );
  }

  private async onSubscriptionDeleted(stripeSub: Stripe.Subscription): Promise<void> {
    const existing = await this.subRepo.findByProviderRef(stripeSub.id);
    if (!existing) {
      this.logger.warn(`subscription.deleted için kayıt yok — sub=${stripeSub.id}`);
      return;
    }
    await this.subRepo.updateStatus(existing.id, 'CANCELED' as any, {
      canceledAt: new Date(),
      cancelAtPeriodEnd: false,
    });
    this.audit.logAsync(
      { userId: existing.subscriberId, tenantId: existing.tenantId },
      {
        action: 'SUBSCRIPTION_CANCELED' as any,
        entityType: 'Subscription',
        entityId: existing.id,
        after: { status: 'CANCELED' },
      },
    );
  }

  private async onInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
    // invoice.subscription removed in Stripe API v22 (now at invoice.parent.subscription_details); cast until migrated.
    const invAny = invoice as any;
    const subId =
      typeof invAny.subscription === 'string'
        ? invAny.subscription
        : invAny.subscription?.id;
    if (!subId) return;
    const existing = await this.subRepo.findByProviderRef(subId);
    if (!existing) return;

    // ACTIVE'e geri çek (PAST_DUE'den toparlanma)
    if (existing.status !== 'ACTIVE') {
      await this.subRepo.updateStatus(existing.id, 'ACTIVE' as any);
    }
    this.audit.logAsync(
      { userId: existing.subscriberId, tenantId: existing.tenantId },
      {
        action: 'PURCHASE' as any,
        entityType: 'Invoice',
        entityId: invoice.id,
        metadata: {
          amountPaid: invoice.amount_paid,
          currency: invoice.currency,
          subscriptionId: subId,
        },
      },
    );
  }

  private async onInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const invAny = invoice as any;
    const subId =
      typeof invAny.subscription === 'string'
        ? invAny.subscription
        : invAny.subscription?.id;
    if (!subId) return;
    const existing = await this.subRepo.findByProviderRef(subId);
    if (!existing) return;

    await this.subRepo.updateStatus(existing.id, 'PAST_DUE' as any);
    this.audit.logAsync(
      { userId: existing.subscriberId, tenantId: existing.tenantId },
      {
        action: 'SUBSCRIPTION_UPDATED' as any,
        entityType: 'Subscription',
        entityId: existing.id,
        metadata: {
          reason: 'invoice.payment_failed',
          invoiceId: invoice.id,
          amountDue: invoice.amount_due,
        },
      },
    );
  }

  // ── Dedup + processing tracking ────────────────────────────────────────

  /**
   * webhook_events tablosuna kaydı dener.
   *   true → ilk kez görüldü, işlenmeli
   *   false → daha önce kayıtlı, idempotent skip
   *
   * P2002 (unique violation) duplicate sinyali olarak kullanılır.
   */
  private async recordEvent(event: Stripe.Event): Promise<boolean> {
    try {
      await (prisma as any).webhookEvent.create({
        data: {
          provider: 'stripe',
          providerEventId: event.id,
          payload: event as any,
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
        where: { provider_providerEventId: { provider: 'stripe', providerEventId: eventId } },
        data: { processedAt: new Date(), error: null },
      });
    } catch (err) {
      this.logger.warn(`webhook markProcessed failed: ${eventId} ${(err as Error).message}`);
    }
  }

  private async markFailed(eventId: string, err: Error): Promise<void> {
    try {
      await (prisma as any).webhookEvent.update({
        where: { provider_providerEventId: { provider: 'stripe', providerEventId: eventId } },
        data: { error: (err.message ?? String(err)).slice(0, 1000) },
      });
    } catch {
      // best effort
    }
  }
}
