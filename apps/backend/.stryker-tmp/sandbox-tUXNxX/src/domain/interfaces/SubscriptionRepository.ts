/**
 * SubscriptionRepository — Subscription modelini soyutlayan domain arayüzü.
 *
 * Aşama 3 (Stripe Billing) altyapısı:
 *   - TierGuard → findActive (subscriberId + tenantId)
 *   - Webhook handler → findByProviderRef + upsertByProviderRef
 *   - StatusUpdate → updateStatus
 *
 * Implementasyon: apps/backend/src/infrastructure/repositories/PrismaSubscriptionRepository.ts
 *
 * Not: Prisma `subscription` modeli ve enum'lar üretildikten sonra dönüş tipleri
 * sıkılaştırılacak. Şimdilik `any` ile geriye dönük uyumlu.
 */
// @ts-nocheck

import type { SubscriberKind, SubscriptionTier, SubscriptionStatus } from '@prisma/client';

export interface SubscriptionFindCriteria {
  kind?: SubscriberKind;
  subscriberId?: string;
  tenantId?: string;
  providerRef?: string;
  customerRef?: string;
}

export interface SubscriptionUpsertInput {
  tenantId: string;
  kind: SubscriberKind;
  subscriberId: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  providerRef?: string | null;
  customerRef?: string | null;
  trialEndsAt?: Date | null;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
  canceledAt?: Date | null;
}

export interface SubscriptionRepository {
  /**
   * Aktif (TRIALING, ACTIVE veya PAST_DUE) aboneliği bulur.
   * Tier guard içinde abone seviyesini saptamak için kullanılır.
   */
  findActive(criteria: SubscriptionFindCriteria): Promise<any | null>;

  /**
   * Stripe `providerRef` (subscription ID) ile tek kayıt bul.
   * Webhook idempotency'si için kritik — UNIQUE constraint var.
   */
  findByProviderRef(providerRef: string): Promise<any | null>;

  /**
   * Stripe webhook callback'inde subscription'ı oluştur veya güncelle.
   * providerRef UNIQUE → upsert güvenli.
   */
  upsertByProviderRef(input: SubscriptionUpsertInput): Promise<any>;

  /**
   * Status değişikliği (PAST_DUE, CANCELED vs) için kısa güncelleme.
   * Opsiyonel ek alanlar (currentPeriodEnd, canceledAt) aynı çağrıda set edilir.
   */
  updateStatus(
    id: string,
    status: SubscriptionStatus,
    fields?: Partial<SubscriptionUpsertInput>,
  ): Promise<any>;
}

/** DI token — string-based çünkü interface runtime'da yok. */
export const SUBSCRIPTION_REPOSITORY = 'SubscriptionRepository';
