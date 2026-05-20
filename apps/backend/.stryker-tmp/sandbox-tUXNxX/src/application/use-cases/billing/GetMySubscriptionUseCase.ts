/**
 * GetMySubscriptionUseCase — kullanıcının aktif aboneliğini döner.
 *
 * Sonuç:
 *   - Aktif sub yoksa { tier: 'FREE', status: null }
 *   - Varsa tier, status, currentPeriodEnd, cancelAtPeriodEnd, trialEndsAt
 *
 * Frontend `/billing` sayfasında tier rozeti + "kartı yönet" linki için kullanılır.
 */
// @ts-nocheck

import { Injectable, Inject } from '@nestjs/common';
import {
  SUBSCRIPTION_REPOSITORY,
  type SubscriptionRepository,
} from '../../../domain/interfaces/SubscriptionRepository';
import type { SubscriberKind } from '@prisma/client';

export interface GetMySubscriptionInput {
  userId: string;
  tenantId: string;
  kind: SubscriberKind;
}

export interface MySubscriptionView {
  tier: string;
  status: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  trialEndsAt: Date | null;
  hasPaymentMethod: boolean;
}

@Injectable()
export class GetMySubscriptionUseCase {
  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subRepo: SubscriptionRepository,
  ) {}

  async execute(input: GetMySubscriptionInput): Promise<MySubscriptionView> {
    const sub = await this.subRepo.findActive({
      kind: input.kind,
      subscriberId: input.userId,
      tenantId: input.tenantId,
    });
    if (!sub) {
      return {
        tier: 'FREE',
        status: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        trialEndsAt: null,
        hasPaymentMethod: false,
      };
    }
    return {
      tier: sub.tier,
      status: sub.status,
      currentPeriodEnd: sub.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: !!sub.cancelAtPeriodEnd,
      trialEndsAt: sub.trialEndsAt ?? null,
      hasPaymentMethod: !!sub.customerRef,
    };
  }
}
