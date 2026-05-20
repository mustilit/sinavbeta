/**
 * StripeBillingService — Stripe REST API üzerinden subscription akışı.
 *
 * Sorumluluklar:
 *   - Customer kaydı (idempotent, metadata: userId + tenantId)
 *   - Checkout Session (subscription mode)
 *   - Billing Portal session (kart güncelleme, iptal)
 *   - Subscription retrieve / cancel
 *   - Price → Tier eşlemesi (env veya lookup_key)
 *
 * STRIPE_SECRET_KEY yoksa servis "disabled" modda kalır; isEnabled() = false döner.
 * Bu sayede dev/test ortamında Stripe key olmadan da uygulama ayağa kalkar.
 *
 * Webhook → HandleStripeWebhookUseCase üzerinden tetiklenir; bu servis sadece
 * outbound HTTP çağrılarından sorumlu.
 *
 * İlgili dosyalar:
 *   - apps/backend/src/application/use-cases/billing/*
 *   - apps/backend/src/nest/controllers/v1/billing.controller.ts
 *   - apps/backend/src/nest/security/verifyWebhookSignature.ts
 */
// @ts-nocheck

import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import Stripe from 'stripe';
import type { Stripe as StripeType } from 'stripe/cjs/stripe.core';
import type {
  SubscriptionUpsertInput,
} from '../../domain/interfaces/SubscriptionRepository';
import type {
  SubscriptionStatus,
  SubscriptionTier,
  SubscriberKind,
} from '@prisma/client';

/** Stripe → domain status haritası. */
const STRIPE_STATUS_MAP: Record<string, SubscriptionStatus> = {
  trialing: 'TRIALING' as any,
  active: 'ACTIVE' as any,
  past_due: 'PAST_DUE' as any,
  unpaid: 'PAST_DUE' as any,
  canceled: 'CANCELED' as any,
  incomplete: 'INCOMPLETE' as any,
  incomplete_expired: 'INCOMPLETE_EXPIRED' as any,
  paused: 'PAST_DUE' as any,
};

/** Lookup_key → tier eşlemesi. Stripe Dashboard'da Price'lara bu key set edilmeli. */
const LOOKUP_KEY_TIER: Record<string, SubscriptionTier> = {
  pro_monthly: 'PRO' as any,
  pro_yearly: 'PRO' as any,
  business_monthly: 'BUSINESS' as any,
  business_yearly: 'BUSINESS' as any,
  enterprise_monthly: 'ENTERPRISE' as any,
  enterprise_yearly: 'ENTERPRISE' as any,
};

@Injectable()
export class StripeBillingService {
  private readonly logger = new Logger(StripeBillingService.name);
  private readonly client?: StripeType;

  constructor() {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      this.logger.warn('STRIPE_SECRET_KEY tanımsız, Stripe servisi devre dışı.');
      return;
    }
    this.client = new Stripe(key, {
      apiVersion: '2024-11-20.acacia' as any,
      typescript: true,
    });
  }

  isEnabled(): boolean {
    return !!this.client;
  }

  /** Sentinel — kullanıcı görür hata olarak fırlatılır. */
  private ensureClient(): StripeType {
    if (!this.client) {
      throw new InternalServerErrorException(
        'Stripe servisi yapılandırılmamış — STRIPE_SECRET_KEY eksik.',
      );
    }
    return this.client;
  }

  /**
   * Var olan customer'ı al; yoksa yeni oluştur.
   * metadata'ya userId + tenantId yazılır → webhook'larda geri eşleştirme.
   */
  async ensureCustomer(opts: {
    email: string;
    userId: string;
    tenantId: string;
    existingCustomerRef?: string | null;
  }): Promise<string> {
    const stripe = this.ensureClient();

    if (opts.existingCustomerRef) {
      try {
        const existing = await stripe.customers.retrieve(opts.existingCustomerRef);
        if (existing && !(existing as any).deleted) {
          return opts.existingCustomerRef;
        }
      } catch (err: any) {
        // 404 — kayıt artık yok, yeniden oluştur. Diğer hataları logla.
        if (err?.statusCode !== 404) {
          this.logger.warn(`Customer retrieve failed: ${err?.message ?? err}`);
        }
      }
    }

    const customer = await stripe.customers.create({
      email: opts.email,
      metadata: {
        userId: opts.userId,
        tenantId: opts.tenantId,
      },
    });
    return customer.id;
  }

  /**
   * Stripe Checkout Session — subscription mode.
   * Idempotency-Key ile çift checkout'a karşı korunur.
   */
  async createCheckoutSession(opts: {
    customerRef: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    metadata: Record<string, string>;
    idempotencyKey?: string;
    trialPeriodDays?: number;
  }): Promise<{ id: string; url: string | null }> {
    const stripe = this.ensureClient();
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        customer: opts.customerRef,
        line_items: [{ price: opts.priceId, quantity: 1 }],
        success_url: opts.successUrl,
        cancel_url: opts.cancelUrl,
        metadata: opts.metadata,
        subscription_data: {
          metadata: opts.metadata,
          ...(opts.trialPeriodDays ? { trial_period_days: opts.trialPeriodDays } : {}),
        },
        allow_promotion_codes: true,
      },
      opts.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : undefined,
    );
    return { id: session.id, url: session.url };
  }

  /**
   * Billing Portal — kart güncelleme, abonelik iptali, fatura listesi.
   */
  async createPortalLink(opts: {
    customerRef: string;
    returnUrl: string;
  }): Promise<{ url: string }> {
    const stripe = this.ensureClient();
    const session = await stripe.billingPortal.sessions.create({
      customer: opts.customerRef,
      return_url: opts.returnUrl,
    });
    return { url: session.url };
  }

  /** Subscription objesini default_payment_method expand edilerek getirir. */
  async retrieveSubscription(subscriptionId: string): Promise<StripeType.Subscription> {
    const stripe = this.ensureClient();
    return stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['default_payment_method', 'items.data.price'],
    });
  }

  /**
   * Abonelik iptali.
   *   atPeriodEnd = true  → update({ cancel_at_period_end: true }) — kullanıcı kalan süreyi alır.
   *   atPeriodEnd = false → del() — anında iptal.
   */
  async cancelSubscription(
    subscriptionId: string,
    atPeriodEnd: boolean,
  ): Promise<StripeType.Subscription> {
    const stripe = this.ensureClient();
    if (atPeriodEnd) {
      return stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });
    }
    return stripe.subscriptions.cancel(subscriptionId);
  }

  /**
   * env'den tier+period'a göre Stripe Price ID çöz.
   * Ör: STRIPE_PRICE_PRO_MONTHLY=price_xxx
   */
  resolvePriceId(
    tier: 'PRO' | 'BUSINESS' | 'ENTERPRISE',
    period: 'monthly' | 'yearly',
  ): string | null {
    const key = `STRIPE_PRICE_${tier}_${period.toUpperCase()}`;
    return process.env[key] ?? null;
  }

  /**
   * Stripe Subscription objesinden domain `SubscriptionUpsertInput` üret.
   *
   * tier önce metadata.tier'dan, sonra ilk item.price.lookup_key'den çıkarılır.
   * Bulunamazsa FREE varsayılır (defensive — webhook'u düşürmemek için).
   */
  mapStripeSubscription(
    stripeSub: StripeType.Subscription,
    tenantId: string,
    kind: SubscriberKind,
    subscriberId: string,
  ): SubscriptionUpsertInput {
    const firstItem = stripeSub.items?.data?.[0];
    const price = firstItem?.price as StripeType.Price | undefined;
    const tier: SubscriptionTier =
      (stripeSub.metadata?.tier as SubscriptionTier | undefined) ??
      (price ? this.tierFromStripePrice(price) : ('FREE' as any));

    const status = STRIPE_STATUS_MAP[stripeSub.status] ?? ('INCOMPLETE' as any);
    // current_period_start/end moved to SubscriptionItem in Stripe API v22; cast until migrated.
    const subAny = stripeSub as any;

    return {
      tenantId,
      kind,
      subscriberId,
      tier,
      status,
      providerRef: stripeSub.id,
      customerRef:
        typeof stripeSub.customer === 'string'
          ? stripeSub.customer
          : stripeSub.customer?.id ?? null,
      trialEndsAt: stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000) : null,
      currentPeriodStart: subAny.current_period_start
        ? new Date(subAny.current_period_start * 1000)
        : null,
      currentPeriodEnd: subAny.current_period_end
        ? new Date(subAny.current_period_end * 1000)
        : null,
      cancelAtPeriodEnd: !!stripeSub.cancel_at_period_end,
      canceledAt: stripeSub.canceled_at ? new Date(stripeSub.canceled_at * 1000) : null,
    };
  }

  /**
   * Stripe Price'tan tier'ı çıkar.
   * Öncelik: price.lookup_key > product.metadata.tier > 'FREE'.
   */
  tierFromStripePrice(price: StripeType.Price): SubscriptionTier {
    if (price.lookup_key && LOOKUP_KEY_TIER[price.lookup_key]) {
      return LOOKUP_KEY_TIER[price.lookup_key];
    }
    const product = price.product;
    if (product && typeof product !== 'string') {
      const metaTier = (product as StripeType.Product).metadata?.tier;
      if (metaTier && ['FREE', 'PRO', 'BUSINESS', 'ENTERPRISE'].includes(metaTier)) {
        return metaTier as SubscriptionTier;
      }
    }
    return 'FREE' as any;
  }

  /**
   * Stripe status string'ini domain enum'a çevir.
   * Bilinmeyen status'lar INCOMPLETE'a düşer.
   */
  mapStatus(stripeStatus: string): SubscriptionStatus {
    return STRIPE_STATUS_MAP[stripeStatus] ?? ('INCOMPLETE' as any);
  }
}
