/**
 * PrismaSubscriptionRepository — Subscription kayıtları için Prisma backed implementasyon.
 *
 * Stripe webhook akışı (HandleStripeWebhookUseCase) ve TierGuard tarafından kullanılır.
 *
 * Not: Prisma client tipleri henüz generate edilmemiş olabilir (`prisma generate`
 * çalışmadı). Bu yüzden `prisma` çağrıları `(prisma as any)` ile cast'lenir;
 * generate sonrası tipler otomatik sıkışır.
 */
import { Injectable } from '@nestjs/common';
import { prisma } from '../database/prisma';
import type { SubscriptionStatus } from '@prisma/client';
import type {
  SubscriptionRepository,
  SubscriptionFindCriteria,
  SubscriptionUpsertInput,
} from '../../domain/interfaces/SubscriptionRepository';

/** Subscription aktif sayılan status kümesi — guard ve sorgu için tek noktada. */
const ACTIVE_STATUSES: SubscriptionStatus[] = ['TRIALING', 'ACTIVE', 'PAST_DUE'] as any;

@Injectable()
export class PrismaSubscriptionRepository implements SubscriptionRepository {
  async findActive(criteria: SubscriptionFindCriteria): Promise<any | null> {
    const where: Record<string, unknown> = {
      status: { in: ACTIVE_STATUSES },
    };
    if (criteria.kind) where.kind = criteria.kind;
    if (criteria.subscriberId) where.subscriberId = criteria.subscriberId;
    if (criteria.tenantId) where.tenantId = criteria.tenantId;
    if (criteria.providerRef) where.providerRef = criteria.providerRef;
    if (criteria.customerRef) where.customerRef = criteria.customerRef;

    return (prisma as any).subscription.findFirst({
      where,
      orderBy: { currentPeriodEnd: 'desc' },
    });
  }

  async findByProviderRef(providerRef: string): Promise<any | null> {
    return (prisma as any).subscription.findUnique({
      where: { providerRef },
    });
  }

  async upsertByProviderRef(input: SubscriptionUpsertInput): Promise<any> {
    if (!input.providerRef) {
      // providerRef olmadan upsert güvenli değil — create yap.
      return (prisma as any).subscription.create({
        data: this.toPrismaData(input, true),
      });
    }
    return (prisma as any).subscription.upsert({
      where: { providerRef: input.providerRef },
      create: this.toPrismaData(input, true),
      update: this.toPrismaData(input, false),
    });
  }

  async updateStatus(
    id: string,
    status: SubscriptionStatus,
    fields?: Partial<SubscriptionUpsertInput>,
  ): Promise<any> {
    const data: Record<string, unknown> = { status };
    if (fields) {
      if (fields.currentPeriodStart !== undefined) data.currentPeriodStart = fields.currentPeriodStart;
      if (fields.currentPeriodEnd !== undefined) data.currentPeriodEnd = fields.currentPeriodEnd;
      if (fields.cancelAtPeriodEnd !== undefined) data.cancelAtPeriodEnd = fields.cancelAtPeriodEnd;
      if (fields.canceledAt !== undefined) data.canceledAt = fields.canceledAt;
      if (fields.trialEndsAt !== undefined) data.trialEndsAt = fields.trialEndsAt;
      if (fields.tier !== undefined) data.tier = fields.tier;
      if (fields.customerRef !== undefined) data.customerRef = fields.customerRef;
    }
    return (prisma as any).subscription.update({ where: { id }, data });
  }

  /**
   * SubscriptionUpsertInput → Prisma `data` payload.
   *
   * `forCreate=true` ise zorunlu alanların hepsi set edilir (`startedAt`, `plan` legacy);
   * `false` ise sadece değişebilen alanlar.
   */
  private toPrismaData(input: SubscriptionUpsertInput, forCreate: boolean): Record<string, unknown> {
    const base: Record<string, unknown> = {
      tier: input.tier,
      status: input.status,
      providerRef: input.providerRef ?? null,
      customerRef: input.customerRef ?? null,
      trialEndsAt: input.trialEndsAt ?? null,
      currentPeriodStart: input.currentPeriodStart ?? null,
      currentPeriodEnd: input.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
      canceledAt: input.canceledAt ?? null,
    };
    if (forCreate) {
      base.tenantId = input.tenantId;
      base.kind = input.kind;
      base.subscriberId = input.subscriberId;
      // Legacy zorunlu alanlar (schema'da default yok) — tier'ı plan olarak da yaz
      base.plan = input.tier;
      base.startedAt = input.currentPeriodStart ?? new Date();
    }
    return base;
  }
}
