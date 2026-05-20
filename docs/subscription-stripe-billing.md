# Stripe Billing + Tier Yapısı Roadmap

KALITE-DEGERLENDIRME §14 (Ekonomik / İş Değeri) önerisi. Freemium → Pro → Business → Enterprise tier yapısı + Stripe Billing entegrasyonu.

## Tier matrisi

Detay: `apps/backend/src/domain/types/subscription.ts` → `TIER_LIMITS`.

| Özellik | FREE | PRO | BUSINESS | ENTERPRISE |
|---|---|---|---|---|
| Max test | 3 | 50 | 500 | sınırsız |
| Max soru/test | 20 | 100 | 200 | 500 |
| Canlı sınav/ay | 0 | 10 | 100 | 1000 |
| Aday/canlı sınav | 0 | 100 | 500 | 5000 |
| Komisyon | %20 | %15 | %10 | %7.5 |
| White-label | ❌ | ❌ | ✅ | ✅ |
| Custom domain | ❌ | ❌ | ✅ | ✅ |
| Priority support | ❌ | ✅ | ✅ | ✅ |
| API erişimi | ❌ | ❌ | ✅ | ✅ |
| SSO | ❌ | ❌ | ❌ | ✅ |
| Audit log retention | 30g | 90g | 365g | 7yıl |

## Mimari

```
Stripe Dashboard
  ├─ Product: "Sınav Salonu Eğitici Aboneliği"
  │   ├─ Price: Pro (monthly $19, yearly $190)
  │   └─ Price: Business (monthly $79, yearly $790)
  └─ Product: "Sınav Salonu Kurumsal"
      └─ Price: Enterprise (custom)

Backend
  ├─ Subscription model (Prisma)
  ├─ StripeBillingService — checkout session, customer portal
  ├─ /v1/billing controller — start checkout, sync subscription
  ├─ /webhooks/stripe controller — invoice.paid, subscription.updated, ...
  └─ TierGuard — endpoint kısıtlama

Frontend
  ├─ /Pricing sayfası — tier karşılaştırması + "Yükselt" CTA
  ├─ /BillingPortal — Stripe Customer Portal'a redirect
  └─ TierUpgradePrompt component — quota aşıldığında modal
```

## Stripe webhook event'leri

| Event | Aksiyon |
|---|---|
| `checkout.session.completed` | Subscription oluştur (DB) |
| `customer.subscription.updated` | Tier / status update |
| `customer.subscription.deleted` | Status: CANCELED |
| `invoice.paid` | Sentry breadcrumb + audit log |
| `invoice.payment_failed` | Email kullanıcıya + status: PAST_DUE |
| `customer.subscription.trial_will_end` | 3 gün önce email |

Webhook handler:

```ts
@Post('webhooks/stripe')
async stripe(@Req() req) {
  const payload = req.body.toString('utf8');
  const sig = req.header('stripe-signature');
  const verdict = verifyStripeSignature(payload, sig, this.cfg.stripeWebhookSecret);
  if (!verdict.valid) {
    this.logger.warn(`stripe webhook reject: ${verdict.reason}`);
    throw new ForbiddenException();
  }
  const event = JSON.parse(payload);

  // Dedup
  await this.handleStripeWebhookUseCase.execute(event);
  return { received: true };
}
```

## Subscription Prisma modeli (yapılacak migration)

```prisma
model Subscription {
  id                 String              @id @default(uuid())
  tenantId           String
  kind               SubscriberKind      // EDUCATOR | TENANT
  subscriberId       String              // educatorId veya tenantId
  tier               SubscriptionTier    @default(FREE)
  status             SubscriptionStatus  @default(ACTIVE)
  providerRef        String?             @unique  // Stripe Subscription ID
  customerRef        String?                       // Stripe Customer ID
  trialEndsAt        DateTime?
  currentPeriodStart DateTime
  currentPeriodEnd   DateTime
  cancelAtPeriodEnd  Boolean             @default(false)
  canceledAt         DateTime?
  createdAt          DateTime            @default(now())
  updatedAt          DateTime            @updatedAt

  @@index([kind, subscriberId])
  @@index([status, currentPeriodEnd])  // expired olanları cron temizlesin
  @@index([tenantId])
}

enum SubscriberKind {
  EDUCATOR
  TENANT
}

enum SubscriptionTier {
  FREE
  PRO
  BUSINESS
  ENTERPRISE
}

enum SubscriptionStatus {
  TRIALING
  ACTIVE
  PAST_DUE
  CANCELED
  INCOMPLETE
  INCOMPLETE_EXPIRED
}
```

> Mevcut `Subscription` modeli `apps/backend/prisma/schema.prisma`'da var (Tenant ile ilişkili). Yukarıdaki şema **genişletme** önerisi. Migration: `docs/migrations/audit-2fa-extension.md` pattern'i ile.

## Frontend: tier gate UX

Quota aşımı yakalandığında (`PaymentRequiredException`):

```jsx
// dalClient.js interceptor:
if (err.response?.status === 402) {
  const { requiredTier } = err.response.data;
  showUpgradeModal({ requiredTier, currentTier: user.tier });
}
```

`TierUpgradePrompt.jsx`:

```jsx
<Dialog>
  <DialogTitle>{requiredTier} planına yükselt</DialogTitle>
  <DialogDescription>
    Bu özellik için aktif {requiredTier} aboneliği gerekiyor.
    Şu an {currentTier} planındasın.
  </DialogDescription>
  <ul>
    {TIER_FEATURES[requiredTier].map(f => <li key={f}>✓ {f}</li>)}
  </ul>
  <Button onClick={startCheckout}>Yükselt — ₺{price}/ay</Button>
</Dialog>
```

## Yol haritası

1. **Hafta 1:** Subscription Prisma modeli + migration + `SubscriptionRepository`.
2. **Hafta 2:** `StripeBillingService` — Customer + Checkout Session + Portal Link.
3. **Hafta 3:** Webhook handler + idempotent event processing (`WebhookEvent` dedup tablosu).
4. **Hafta 4:** Frontend `/Pricing` + `/BillingPortal` + TierUpgradePrompt component.
5. **Hafta 5:** TierGuard'ı endpoint'lere uygula (kademeli — önce read-only feature'lar).
6. **Hafta 6:** Quota usage tracking (`maxLiveSessionsPerMonth` → counter table).
7. **Hafta 7:** Trial period + email reminder.
8. **Hafta 8:** Reporting dashboard (MRR, churn, LTV, ARPU).

## KDV / Fatura

Türkiye için KDV %20. Stripe Tax modülü TR destekler:

```js
stripe.subscriptions.create({
  customer: cust,
  items: [...],
  automatic_tax: { enabled: true },
  // Müşteri tax_id'si VKN ise B2B (KDV exempted veya farklı oran)
});
```

E-fatura entegrasyonu (Logo / Mikro) ayrı çalışma; Stripe sadece kart işlemi + invoice PDF üretir, e-fatura entegrasyonu için yerel mevzuat zorunlu.

## Test

```ts
// Stripe webhook test events (CLI):
stripe trigger checkout.session.completed
stripe trigger invoice.payment_failed
stripe trigger customer.subscription.deleted

// Idempotency:
// Aynı event ID'yi 2x gönder → DB'de tek subscription olmalı
```

## Sentry / observability

```ts
Sentry.setTag('subscription_tier', user.subscriptionTier);
Sentry.setUser({ id: user.id, segment: `tier:${user.subscriptionTier}` });
```

→ Sentry dashboard'da "tier başına hata oranı" filtreleme.

## İlgili

- KALITE-DEGERLENDIRME §14
- Skill: `idempotency` (Stripe webhook signing)
- Skill: `release-engineering` (Stripe price ID env management)
- ADR-0007 (API versioning — `/v1/billing/...`)
