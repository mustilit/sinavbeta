# Wire-up İhtiyaçları

Bu dosya, yeni eklenen modüllerin `AppModule`'a (veya alt modüllere) bağlanması
için gereken provider/controller listesini tutar. Wire-up agent buradan toplu
commit yapar.

## Aşama 3 (Stripe Billing)

### Providers (AppModule veya yeni BillingModule)

Servisler ve repository:

- `StripeBillingService`
  → `apps/backend/src/infrastructure/services/StripeBillingService.ts`
- `PrismaSubscriptionRepository`
  → `apps/backend/src/infrastructure/repositories/PrismaSubscriptionRepository.ts`
  → Provider token: `SUBSCRIPTION_REPOSITORY` (string token, export edildi)

```ts
import { SUBSCRIPTION_REPOSITORY } from './domain/interfaces/SubscriptionRepository';
import { PrismaSubscriptionRepository } from './infrastructure/repositories/PrismaSubscriptionRepository';

// providers içine:
{ provide: SUBSCRIPTION_REPOSITORY, useClass: PrismaSubscriptionRepository },
```

Use case'ler:

- `HandleStripeWebhookUseCase`
  → `apps/backend/src/application/use-cases/billing/HandleStripeWebhookUseCase.ts`
- `HandleIyzicoWebhookUseCase`
  → `apps/backend/src/application/use-cases/billing/HandleIyzicoWebhookUseCase.ts`
- `StartCheckoutUseCase`
  → `apps/backend/src/application/use-cases/billing/StartCheckoutUseCase.ts`
- `CreatePortalLinkUseCase`
  → `apps/backend/src/application/use-cases/billing/CreatePortalLinkUseCase.ts`
- `GetMySubscriptionUseCase`
  → `apps/backend/src/application/use-cases/billing/GetMySubscriptionUseCase.ts`

Guard (zaten kayıtlı olabilir — repo injection güncellendi):

- `TierGuard` artık `SUBSCRIPTION_REPOSITORY` token'ı inject ediyor.
  AppModule provider listesinde `TierGuard` ve `SUBSCRIPTION_REPOSITORY`
  provider'ı birlikte bulunmalı.

### Controllers

- `WebhookController` (`/webhooks/stripe`, `/webhooks/iyzico`)
  → `apps/backend/src/nest/controllers/webhook.controller.ts`
  → `@Public()` ile JWT bypass — imza doğrulama yeterli.
- `BillingController` (`/v1/billing/*`)
  → `apps/backend/src/nest/controllers/v1/billing.controller.ts`
  → Bearer JWT zorunlu.

### Module imports (karar)

Önerilen yapı:

```ts
// apps/backend/src/nest/modules/billing.module.ts (YENİ)
@Module({
  controllers: [BillingController, WebhookController],
  providers: [
    StripeBillingService,
    { provide: SUBSCRIPTION_REPOSITORY, useClass: PrismaSubscriptionRepository },
    HandleStripeWebhookUseCase,
    HandleIyzicoWebhookUseCase,
    StartCheckoutUseCase,
    CreatePortalLinkUseCase,
    GetMySubscriptionUseCase,
    AuditLogger,
    IdempotencyInterceptor, // global modülde de olabilir
  ],
  exports: [SUBSCRIPTION_REPOSITORY], // TierGuard için
})
export class BillingModule {}
```

Sonra `AppModule.imports` listesine `BillingModule` eklenmeli. `TierGuard`
zaten AppModule'a global guard olarak kayıtlı değil — endpoint bazında
`@UseGuards(TierGuard)` ile uygulanıyor; bu yüzden `SUBSCRIPTION_REPOSITORY`
provider'ının `BillingModule.exports`'unda olması ve BillingModule'ün AppModule'a
import edilmesi yeterli.

Alternatif: AppModule provider listesine direkt eklemek de mümkün (basit
projelerde tercih edilebilir).

### main.ts değişikliği (UYGULANDI)

`/webhooks/stripe` ve `/webhooks/iyzico` için `express.raw({ type: 'application/json' })`
middleware'i tenant/requestId middleware'lerinden ÖNCE kayıtlandı. Webhook
imza doğrulama bu byte buffer'a dayanır.

### Env değişkenleri

`docs/proposed-claude/package-additions.md` "Aşama 3" bölümüne bakın.

### Test notları

- `prisma generate` çalıştırılmadığı için Subscription/WebhookEvent Prisma client
  tipleri henüz yok. Repository ve use case'lerde `(prisma as any)` cast'leri
  geçici — generate sonrası temizlenmeli.
- `stripe` paketi yüklenmedikçe `StripeBillingService` import'u TypeScript
  hatası verir. `npm install stripe@^17` zorunlu adım.

## Aşama 4 (Currency + Replica) wire-up

### Providers
- FixedFxService veya TcmbFxService → FX_RATE_SERVICE token (useFactory ile env'e göre seç):
  ```ts
  {
    provide: FX_RATE_SERVICE,
    useClass: process.env.FX_PROVIDER === 'tcmb' ? TcmbFxService : FixedFxService,
  }
  ```
- ReportingTestRepository (yeni — `apps/backend/src/infrastructure/repositories/ReportingTestRepository.ts`)

### Health controller
- `HealthController` artık `ReportingTestRepository`'yi constructor'da default instance ile alıyor (NestJS DI ile de bind edilebilir).
- `@Get('health/replica')` endpoint'i `ReportingTestRepository.replicationLagSeconds()` çağırarak `{ enabled, lagSeconds, ok }` döner.
- Eğer `ReportingTestRepository` AppModule'a provider olarak eklenirse `HealthController` constructor default parametresi yerine NestJS DI ile inject edilir (önerilen, manuel new'i kaldır).

### Use case güncellemeleri (UYGULANDI)
- `ListMarketplaceTestsUseCase`: `fx?: FxRateService` optional constructor inject, `displayCurrency?: FxCurrency` input. Item'lara opsiyonel `converted: { amountCents, currency, rate }` alanı eklenir.
  → Wire-up: AppModule'da `new ListMarketplaceTestsUseCase(examRepo, fxService)` veya provider factory ile FX servisini ikinci argüman olarak ver.
- `PurchaseUseCase`: `fx?: FxRateService` optional, `purchaseCurrency` test'ten alınır, `amountUsdCents` snapshot (FX hatasında null).
  → Wire-up: AppModule'da `new PurchaseUseCase(prisma, fxService)` veya provider factory ile FX servisini ikinci argüman olarak ver.

### Env değişkenleri
- `.env.example` Aşama 4 bölümü eklendi: `DATABASE_REPLICA_URL`, `FX_PROVIDER`, `FX_RATE_*`.
