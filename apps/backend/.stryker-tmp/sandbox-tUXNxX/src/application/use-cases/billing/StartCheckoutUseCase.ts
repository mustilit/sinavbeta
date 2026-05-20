/**
 * StartCheckoutUseCase — kullanıcıyı Stripe Checkout'a yönlendirecek URL üretir.
 *
 * Akış:
 *   1. Mevcut customer'ı al / yoksa oluştur (Stripe customers.create).
 *   2. Var olan subscription bilgisinden customerRef'i okuyup persist için günceller.
 *   3. tier+period → priceId çöz (env'den).
 *   4. Checkout Session oluştur (subscription mode, idempotency-key).
 *   5. session.url'i döner; frontend redirect yapar.
 *
 * Idempotency-Key controller'daki IdempotencyInterceptor'a delege edilir.
 * Stripe API çağrısı için ek idempotencyKey opts.idempotencyKey ile geçilir.
 */
// @ts-nocheck

import { Injectable, Inject, BadRequestException, NotFoundException } from '@nestjs/common';
import { prisma } from '../../../infrastructure/database/prisma';
import { StripeBillingService } from '../../../infrastructure/services/StripeBillingService';
import {
  SUBSCRIPTION_REPOSITORY,
  type SubscriptionRepository,
} from '../../../domain/interfaces/SubscriptionRepository';
import type { SubscriberKind } from '@prisma/client';

export interface StartCheckoutInput {
  userId: string;
  tenantId: string;
  kind: SubscriberKind;
  tier: 'PRO' | 'BUSINESS' | 'ENTERPRISE';
  period: 'monthly' | 'yearly';
  successUrl?: string;
  cancelUrl?: string;
  idempotencyKey?: string;
}

@Injectable()
export class StartCheckoutUseCase {
  constructor(
    private readonly stripe: StripeBillingService,
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subRepo: SubscriptionRepository,
  ) {}

  async execute(input: StartCheckoutInput): Promise<{ url: string; sessionId: string }> {
    if (!this.stripe.isEnabled()) {
      throw new BadRequestException('Stripe servisi yapılandırılmamış.');
    }

    const priceId = this.stripe.resolvePriceId(input.tier, input.period);
    if (!priceId) {
      throw new BadRequestException(
        `Bu tier+period için Stripe Price ID tanımlı değil: ${input.tier}/${input.period}`,
      );
    }

    // Kullanıcı email — Stripe customer için zorunlu
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { email: true },
    });
    if (!user) throw new NotFoundException('Kullanıcı bulunamadı.');

    // Mevcut customer ref (varsa) — repo'dan çek
    const existing = await this.subRepo.findActive({
      kind: input.kind,
      subscriberId: input.userId,
      tenantId: input.tenantId,
    });
    const existingCustomerRef = existing?.customerRef ?? null;

    const customerRef = await this.stripe.ensureCustomer({
      email: user.email,
      userId: input.userId,
      tenantId: input.tenantId,
      existingCustomerRef,
    });

    const baseUrl = process.env.CLIENT_URL ?? 'http://localhost:5173';
    const session = await this.stripe.createCheckoutSession({
      customerRef,
      priceId,
      successUrl: input.successUrl ?? `${baseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: input.cancelUrl ?? `${baseUrl}/billing/cancel`,
      metadata: {
        userId: input.userId,
        tenantId: input.tenantId,
        kind: input.kind,
        subscriberId: input.userId,
        tier: input.tier,
        period: input.period,
      },
      idempotencyKey: input.idempotencyKey,
    });

    if (!session.url) {
      throw new BadRequestException('Stripe checkout URL üretilemedi.');
    }
    return { url: session.url, sessionId: session.id };
  }
}
