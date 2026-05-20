# Önerilen paket eklemeleri

Bu dosya, kod tabanına eklenen yeni özellikler için gereken npm bağımlılıklarını
listeler. `package.json` doğrudan değiştirilmez — wire-up agent toplu commit eder.

## Aşama 2 (2FA) backend deps

`apps/backend/package.json` dependencies:

- `otplib@^12` — TOTP secret üretme + doğrulama (RFC 6238)
- `qrcode@^1.5` — Authenticator QR PNG (data URL) üretimi

`apps/backend/package.json` devDependencies:

- `@types/qrcode@^1.5` — TypeScript tipleri

Zaten yüklü:

- `bcryptjs` (+ `@types/bcryptjs`) — recovery code hash/compare için
- `jsonwebtoken` — pending setup/MFA token'ları için (LoginUseCase, SetupTwoFactorUseCase, VerifyTwoFactorLoginUseCase)

Kurulum komutu (wire-up aşamasında):

```bash
cd apps/backend
npm install otplib@^12 qrcode@^1.5
npm install --save-dev @types/qrcode@^1.5
```

Notlar:

- `otplib` saf TypeScript; ek build flag gerekmez.
- `authenticator.options.window = 1` ile ±30s clock skew toleransı uygulanır
  (`apps/backend/src/infrastructure/security/TwoFactorService.ts`).
- `APP_ENCRYPTION_KEY` env değişkeni production'da set EDİLMELİDİR (32-byte hex
  veya base64). 2FA secret'ı AES-256-GCM ile şifrelenmeden DB'ye yazılmaz.

## Aşama 3 (Stripe Billing) backend deps

`apps/backend/package.json` dependencies:

- `stripe@^17` — Stripe Node SDK (apiVersion `2024-11-20.acacia`).
  Kullanıldığı yer: `apps/backend/src/infrastructure/services/StripeBillingService.ts`.

Kurulum komutu (wire-up aşamasında):

```bash
cd apps/backend
npm install stripe@^17
```

Gerekli env değişkenleri (`.env` veya secret manager):

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Tier+period → Price ID eşlemesi (Stripe Dashboard'dan üretilir):
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_PRO_YEARLY=price_...
STRIPE_PRICE_BUSINESS_MONTHLY=price_...
STRIPE_PRICE_BUSINESS_YEARLY=price_...
STRIPE_PRICE_ENTERPRISE_MONTHLY=price_...
STRIPE_PRICE_ENTERPRISE_YEARLY=price_...

# Iyzico webhook (tek seferlik satın alma için):
IYZICO_API_KEY=...
IYZICO_SECRET=...

# Frontend redirect base URL
CLIENT_URL=http://localhost:5173
```

Notlar:

- `STRIPE_SECRET_KEY` yoksa `StripeBillingService.isEnabled()` false döner;
  uygulama yine ayağa kalkar (graceful degrade).
- Stripe Dashboard'da her Price'a `lookup_key` set EDİLMELİDİR:
  `pro_monthly`, `pro_yearly`, `business_monthly`, ... — webhook'ta tier resolve
  bu key üzerinden yapılır (fallback: `product.metadata.tier`).
- Webhook endpoint URL'leri: `POST /webhooks/stripe`, `POST /webhooks/iyzico`.
  `main.ts`'te `express.raw()` ile body Buffer olarak alınır (imza için zorunlu).
- `prisma generate` çalıştırıldıktan sonra Subscription/WebhookEvent tipleri
  Prisma client'ta belirir; repository'deki `(prisma as any)` cast'leri
  kaldırılabilir.

## Aşama 4 (Currency + Replica) backend deps
- Yeni paket yok (fetch global, Prisma client mevcut). TCMB XML parse için ek paket eklemiyoruz (regex yeterli).
- Opsiyonel: `fast-xml-parser` daha sağlam parsing isteniyorsa.

## Aşama 4 env değişkenleri (ekle .env.example'a)
- DATABASE_REPLICA_URL (opsiyonel; yoksa primary'e fallback)
- FX_RATE_TRY_USD, FX_RATE_USD_TRY, FX_RATE_TRY_EUR, FX_RATE_EUR_TRY, FX_RATE_TRY_GBP, FX_RATE_GBP_TRY, FX_RATE_USD_EUR, FX_RATE_EUR_USD, FX_RATE_USD_GBP, FX_RATE_GBP_USD, FX_RATE_EUR_GBP, FX_RATE_GBP_EUR (FixedFxService için override, opsiyonel)
- FX_PROVIDER=fixed|tcmb (default: fixed; prod'da tcmb)
