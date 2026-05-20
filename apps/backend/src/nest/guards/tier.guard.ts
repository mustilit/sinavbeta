/**
 * TierGuard — endpoint'i belirli tier ve üzerine kısıtlar.
 *
 * Kullanım:
 *   @RequireTier('PRO')
 *   @Get('analytics/advanced')
 *   advancedAnalytics() { ... }
 *
 * Akış:
 *   1. JWT'den user/tenant alınır.
 *   2. SubscriptionRepository'den aktif aboneliği bulunur.
 *   3. tier_priority >= required_priority ise geçer, değilse 402 Payment Required.
 *   4. Quota gerekiyorsa ek decorator (@RequireQuota('maxTests')).
 *
 * Domain: docs/proposed-claude/skills/idempotency/SKILL.md → para akışı
 *          apps/backend/src/domain/types/subscription.ts → tier matrix
 */
import {
  Injectable,
  Inject,
  CanActivate,
  ExecutionContext,
  SetMetadata,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  SubscriptionTier,
  TIER_LIMITS,
} from '../../domain/types/subscription';
import {
  SUBSCRIPTION_REPOSITORY,
  type SubscriptionRepository,
} from '../../domain/interfaces/SubscriptionRepository';

const TIER_PRIORITY: Record<SubscriptionTier, number> = {
  FREE: 0,
  PRO: 1,
  BUSINESS: 2,
  ENTERPRISE: 3,
};

const TIER_KEY = 'requiredTier';

/**
 * Decorator: endpoint için minimum tier şartı.
 */
export const RequireTier = (tier: SubscriptionTier) => SetMetadata(TIER_KEY, tier);

@Injectable()
export class TierGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subRepo: SubscriptionRepository,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<SubscriptionTier | undefined>(
      TIER_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!required) return true; // tier şartı yok

    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    const tenant = req.tenant;
    if (!user) throw new ForbiddenException('Auth gerekli');

    const userId = user.id ?? user.sub;
    const tenantId = tenant?.id ?? user.tenantId;

    // Önce kullanıcı (EDUCATOR) seviyesi sub, yoksa tenant seviyesi
    let sub = await this.subRepo.findActive({ subscriberId: userId, tenantId });
    if (!sub && tenantId) {
      sub = await this.subRepo.findActive({ kind: 'TENANT' as any, tenantId });
    }

    if (!sub) {
      throw new HttpException({
        error: 'subscription_required',
        message: `Bu özellik için aktif abonelik gerekiyor: ${required}+`,
        requiredTier: required,
      }, HttpStatus.PAYMENT_REQUIRED);
    }

    // ACTIVE veya TRIALING geçer; PAST_DUE/CANCELED geçmez (grace period yok)
    if (sub.status !== 'ACTIVE' && sub.status !== 'TRIALING') {
      throw new HttpException({
        error: 'subscription_inactive',
        message: `Abonelik aktif değil (mevcut durum: ${sub.status}).`,
        currentStatus: sub.status,
        requiredTier: required,
      }, HttpStatus.PAYMENT_REQUIRED);
    }

    if (TIER_PRIORITY[sub.tier as SubscriptionTier] < TIER_PRIORITY[required]) {
      throw new HttpException({
        error: 'tier_upgrade_required',
        message: `Bu özellik için en az ${required} planı gerekiyor (mevcut: ${sub.tier})`,
        currentTier: sub.tier,
        requiredTier: required,
      }, HttpStatus.PAYMENT_REQUIRED);
    }

    // İsteğe tier'ı ekleyelim ki controller içinde okuyabilelim
    req.subscriptionTier = sub.tier;
    req.tierLimits = TIER_LIMITS[sub.tier as SubscriptionTier];

    return true;
  }
}
