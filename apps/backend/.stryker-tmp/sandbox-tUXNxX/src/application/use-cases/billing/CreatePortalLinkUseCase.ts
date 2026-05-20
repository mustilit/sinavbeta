/**
 * CreatePortalLinkUseCase — Stripe Billing Portal URL üretir.
 *
 * Kullanıcı bu URL'de kart bilgilerini günceller, abonelik iptal eder, fatura
 * geçmişine bakar. Tüm değişiklikler webhook üzerinden geri yansır.
 *
 * Akış:
 *   1. repo.findActive → customerRef
 *   2. yoksa 404
 *   3. billingPortal.sessions.create
 */
// @ts-nocheck

import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { StripeBillingService } from '../../../infrastructure/services/StripeBillingService';
import {
  SUBSCRIPTION_REPOSITORY,
  type SubscriptionRepository,
} from '../../../domain/interfaces/SubscriptionRepository';
import type { SubscriberKind } from '@prisma/client';

export interface CreatePortalLinkInput {
  userId: string;
  tenantId: string;
  kind: SubscriberKind;
  returnUrl?: string;
}

@Injectable()
export class CreatePortalLinkUseCase {
  constructor(
    private readonly stripe: StripeBillingService,
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subRepo: SubscriptionRepository,
  ) {}

  async execute(input: CreatePortalLinkInput): Promise<{ url: string }> {
    if (!this.stripe.isEnabled()) {
      throw new BadRequestException('Stripe servisi yapılandırılmamış.');
    }

    const sub = await this.subRepo.findActive({
      kind: input.kind,
      subscriberId: input.userId,
      tenantId: input.tenantId,
    });
    if (!sub || !sub.customerRef) {
      throw new NotFoundException('Aktif abonelik veya Stripe customer kaydı bulunamadı.');
    }

    const baseUrl = process.env.CLIENT_URL ?? 'http://localhost:5173';
    return this.stripe.createPortalLink({
      customerRef: sub.customerRef,
      returnUrl: input.returnUrl ?? `${baseUrl}/billing`,
    });
  }
}
