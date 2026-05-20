---
name: idempotency
description: POST/PUT endpoint'lerinde Idempotency-Key desteği ve ödeme sağlayıcı webhook'larında HMAC imza doğrulama + replay koruması. Ödeme akışı, satın alma, iade, reklam satın alımı, abonelik faturalandırma gibi para ile ilişkili veya tekrarlanması zarar verebilecek endpoint'lerde uygula.
---

# Idempotency & Webhook Signing — Sınav Salonu

Para akışı olan endpoint'lerde "ağ retry ile çift fatura kestik" hatası kabul edilemez. İki ayrı pattern var: client-driven idempotency (`Idempotency-Key` header) ve server-driven webhook authenticity (HMAC imza + replay koruması).

## Ne zaman uygulanır

| Endpoint sınıfı | Idempotency-Key | Webhook signing |
|---|---|---|
| `POST /purchases` (Iyzico/Stripe satın alma başlat) | ✅ | — |
| `POST /webhooks/iyzico` (callback) | — | ✅ |
| `POST /webhooks/stripe` | — | ✅ |
| `POST /refunds` (iade talebi) | ✅ | — |
| `POST /ads/:id/purchase` (reklam paketi alımı) | ✅ | — |
| `POST /attempts/:id/submit` (deneme kapat) | ✅ (önerilen) | — |
| `POST /subscriptions` | ✅ | — |
| `GET *` | — | — |
| `DELETE *` (zaten idempotent doğası gereği) | opsiyonel | — |

## Idempotency-Key Pattern

Client her POST'ta UUID üretir, header ile yollar. Server aynı key 24 saat içinde tekrar gelirse **önceki response'u** aynen döner — yeni iş yapmaz.

### Storage modeli (Redis)

```
key:   idem:<tenantId>:<userId>:<idempotencyKey>
value: {
  status: 'in_progress' | 'completed',
  responseStatus: 201,
  responseBody: '<json>',
  requestHash: '<sha256(method+path+body)>',
  createdAt: '<iso>',
}
TTL:   24 saat (lock fazında 60 saniye)
```

### Interceptor iskeleti (NestJS)

Tam çalışan referans implementasyon `apps/backend/src/nest/interceptors/idempotency.interceptor.ts` dosyasına eklendi. Özet akış:

1. `Idempotency-Key` header okunur ve `^[A-Za-z0-9_-]{16,128}$` regex ile doğrulanır.
2. Redis'te kayıt var mı?
   - **Var, completed:** Aynı body hash'i mi? Evet → cached response. Hayır → 409 Conflict.
   - **Var, in_progress:** 409 (retry-after).
   - **Yok:** `in_progress` lock yaz (60s TTL), use case'i çalıştır.
3. Use case başarılı → `completed` + response body + 24h TTL.
4. Use case fail → lock'u SİL (retry edilebilsin).

### Kullanım (controller)

```ts
@UseInterceptors(IdempotencyInterceptor)
@Post('purchases')
async create(@Body() dto: CreatePurchaseDto, @CurrentUser() user: AuthUser) {
  return this.createPurchaseUseCase.execute(user.id, dto);
}
```

### DTO ile birlikte (OpenAPI)

```ts
@ApiHeader({
  name: 'Idempotency-Key',
  required: true,
  description: 'Client UUID, 24 saat geçerli',
})
```

### Client tarafı (frontend `dalClient.js`)

```js
import { v4 as uuid } from 'uuid';

export async function createPurchase(payload) {
  return apiPost('/purchases', payload, {
    headers: { 'Idempotency-Key': uuid() },
  });
}
```

## Webhook Signing — HMAC + Replay

Iyzico ve Stripe gibi sağlayıcılar webhook'ları imzalar. **İmza doğrulanmadan hiçbir state değişmez.**

### Stripe stili (HMAC-SHA256 + timestamp)

Referans `apps/backend/src/nest/security/verifyStripeSignature.ts`. Özet:

```ts
import { createHmac, timingSafeEqual } from 'crypto';

const TOLERANCE_SECONDS = 300; // 5 dk

export function verifyStripeSignature(payload, header, secret) {
  // header: "t=1700000000,v1=abc123..."
  const parts = parseHeader(header);
  if (Math.abs(Date.now() / 1000 - parts.t) > TOLERANCE_SECONDS) {
    return { valid: false, reason: 'expired' };
  }
  const signed = `${parts.t}.${payload}`;
  const expected = createHmac('sha256', secret).update(signed).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { valid: false, reason: 'signature-mismatch' };
  }
  return { valid: true };
}
```

**Önemli:** `timingSafeEqual` kullan, `===` yerine — timing attack koruması.

### Raw body capture

NestJS varsayılan olarak `application/json`'u parse ediyor; webhook'ta **ham gövdeye** ihtiyacımız var. Stripe rotası için:

```ts
// apps/backend/src/main.ts
import { NestFactory } from '@nestjs/core';
import { json, raw } from 'express';

const app = await NestFactory.create(AppModule);

app.use('/webhooks/stripe', raw({ type: 'application/json' }));
app.use(json()); // diğer route'lar normal parse
```

Controller'da:

```ts
@Post('webhooks/stripe')
async stripe(@Req() req: any) {
  const payload = req.body.toString('utf8');
  const signature = req.header('stripe-signature');
  const verdict = verifyStripeSignature(payload, signature, this.cfg.stripeWebhookSecret);
  if (!verdict.valid) {
    this.logger.warn(`stripe webhook reject: ${verdict.reason}`);
    throw new ForbiddenException('Invalid signature');
  }
  const event = JSON.parse(payload);
  await this.handleStripeWebhookUseCase.execute(event);
  return { received: true };
}
```

### Replay koruması — WebhookEvent dedup tablosu

İmza geçerli olsa bile attacker eski bir webhook'u tekrar gönderebilir. Koruma:

1. **Timestamp tolerance** (yukarıda 5 dk).
2. **Event ID dedup:** `WebhookEvent` tablosunda `providerEventId` UNIQUE.

```prisma
model WebhookEvent {
  id              String   @id @default(cuid())
  provider        String   // 'stripe' | 'iyzico'
  providerEventId String
  payload         Json
  receivedAt      DateTime @default(now())

  @@unique([provider, providerEventId])
}
```

```ts
try {
  await prisma.webhookEvent.create({
    data: { provider: 'stripe', providerEventId: event.id, payload: event },
  });
} catch (e) {
  if (e.code === 'P2002') return; // Duplicate — sessizce yut
  throw e;
}
```

### Iyzico farkı

Iyzico kendi imza şemasını kullanır (`hash = base64(sha1(apiKey + payload + secret))`). Framework aynı, hash fonksiyonu farklı:

```ts
export function verifyIyzicoSignature(payload, headerHash, apiKey, secret) {
  const expected = createHash('sha1').update(apiKey + payload + secret).digest('base64');
  return timingSafeEqual(Buffer.from(expected), Buffer.from(headerHash));
}
```

## Test stratejisi

```ts
// apps/backend/tests/nest/idempotency.interceptor.test.ts
describe('IdempotencyInterceptor', () => {
  it('aynı key + aynı payload → cached response döner, use case 1 kez çalışır', async () => {});
  it('aynı key + farklı payload → 409 Conflict', async () => {});
  it('in_progress lock varken → 409 Conflict (geçici)', async () => {});
  it('use case throw → lock silinir, retry edilebilir', async () => {});
});

// apps/backend/tests/nest/verifyStripeSignature.test.ts
it('gerçek HMAC doğrulanır', () => {});
it('5 dk üzeri timestamp → expired', () => {});
it('signature tek karakter farkı → mismatch', () => {});
```

## Yapmayacakların

- **Idempotency lock'unu use case BAŞLAMADAN almazsan** double-write yiyebilirsin. Lock önce, work sonra.
- **In-progress entry'yi expire etmek için sadece TTL'e güvenme** — controller hata fırlatınca lock'u DELETE et.
- **GET'lerde Idempotency-Key kabul etme** — anlam yok, cache cost.
- **Webhook imza fail'inde 200 dönüp "received: true" deme** — attacker zorla iş yaptırır. 403 fırlat.
- **Webhook'tan gelen veriye direkt güven** — provider'dan `paymentIntentId` ile `retrieve` çağrısı yapıp asıl kaydı doğrula.
- **WebhookEvent tablosu olmadan event işle** — duplicate event ile çifte para iadesi yedirebilir.

## Checklist (her yeni para endpoint'i)

- [ ] `IdempotencyInterceptor` decorator ile eklendi mi?
- [ ] DTO'da `@ApiHeader('Idempotency-Key')` dokümante edildi mi?
- [ ] Frontend `dalClient.js` çağrısı UUID üretiyor mu?
- [ ] Use case başarılı + başarısız test edildi mi (lock cleanup dahil)?
- [ ] Webhook ise `verify*Signature` ile imza doğrulandı mı?
- [ ] Webhook ise `WebhookEvent` dedup tablosuna yazılıyor mu?
- [ ] Raw body capture `main.ts`'te aktif mi?
- [ ] Timing attack için `timingSafeEqual` kullanıldı mı?

İlgili skill'ler: `payment-domain`, `purchase-flow`, `security-hardening`.
