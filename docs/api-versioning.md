# API Versiyonlama

KALITE-DEGERLENDIRME §8 (Uyumluluk) önerisi. Frontend ve harici entegratörlerin (gelecek SDK, Iyzico/Stripe webhook, mobil app) breaking change'lerden bağımsız kalması için.

## Strateji — URI prefix + version-neutral migration

NestJS `enableVersioning({ type: URI, prefix: 'v' })` ile aktif. Üç sürüm sınıfı var:

| Controller | URL formatı | Anlamı |
|---|---|---|
| `@Controller('foo')` | `/foo` | **Legacy** (mevcut endpoint'ler). VERSION_NEUTRAL altında. |
| `@Controller({ path: 'foo', version: '1' })` | `/v1/foo` | Stabil v1 (yeni endpoint'ler). |
| `@Controller({ path: 'foo', version: '2' })` | `/v2/foo` | v2 (breaking change içerir). |
| `@Controller({ path: 'foo', version: ['1', '2'] })` | `/v1/foo`, `/v2/foo` | Aynı handler, geçiş döneminde. |

Var olan 45 controller bilinçli olarak değişmedi → frontend kırılmaz. Yeni controller'lar `v1` ile başlar.

## Yeni endpoint nasıl yazılır

```ts
// apps/backend/src/nest/controllers/v1/billing.controller.ts
import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('billing')
@ApiBearerAuth('bearer')
@Controller({ path: 'billing/subscriptions', version: '1' })
export class BillingV1Controller {
  // ...
  @Get()
  list() {
    return [];
  }
}
```

→ `GET /v1/billing/subscriptions`

Module kaydı `AppModule` veya domain modülünde — controller listesine eklenir, başka bir şey gerekmez.

## Mevcut endpoint'i v1'e taşıma (breaking change varsa)

Senaryo: `GET /tests` response şeması değişti (yeni alan zorunlu hale geldi).

1. Eski controller dosyasını **dokunma** — `/tests` çalışmaya devam ediyor.
2. Yeni controller `v1/tests.controller.ts` aç, `version: '1'`.
3. Yeni handler'da yeni şemayla cevap dön.
4. `Sunset` header ekle eski controller'a:
   ```ts
   @Get()
   list(@Res({ passthrough: true }) res: any) {
     res.setHeader('Sunset', 'Sat, 31 Dec 2026 23:59:59 GMT');
     res.setHeader('Deprecation', 'true');
     res.setHeader('Link', '</v1/tests>; rel="successor-version"');
     // ...
   }
   ```
5. Frontend `/v1/tests`'e geç.
6. 6 ay sonra eski controller'ı sil.

## OpenAPI / Swagger

- `/docs` URL'inde tek bir Swagger UI; v1 ve legacy birlikte görünür (tag'ler ile ayrılır).
- `npm run openapi:export` → `openapi.json` üretir.
- SDK üretimi (gelecek):
  ```bash
  npx @openapitools/openapi-generator-cli generate \
    -i apps/backend/openapi.json \
    -g typescript-fetch \
    -o packages/sdk-ts \
    --additional-properties=npmName=@sinavsalonu/sdk
  ```

## Webhook standardı — CloudEvents

Outbound webhook'larda (3. parti entegratörlere) **CloudEvents v1.0** önerilir. Inbound webhook (Stripe/Iyzico → bize) provider formatında kalır.

CloudEvents örnek:

```json
{
  "specversion": "1.0",
  "id": "evt_01HZ...",
  "source": "https://api.sinavsalonu.example/educators/edu-1",
  "type": "com.sinavsalonu.test.published.v1",
  "subject": "test/test-42",
  "time": "2026-05-17T10:00:00Z",
  "datacontenttype": "application/json",
  "data": { "testId": "test-42", "title": "..." }
}
```

`type` alanı versiyonlu — `.v1`, `.v2`. Eski subscriber'lar yeni `type`'ı görmezse hata vermez (forward-compat).

## Versiyon sunset policy

| Aşama | Süre | Aksiyon |
|---|---|---|
| Active | n/a | Yeni endpoint'ler v1'e eklenir |
| Deprecated | 6 ay | `Sunset` + `Deprecation` header döner, dokümantasyonda `~~strikethrough~~` |
| Sunset | tarih + 24h | 410 Gone döner; release notes'ta duyurulur |
| Removed | sunset + 30 gün | Kod silinir |

Public API'ya çıkıldıktan sonra major version bump için bu takvim zorunlu.

## Test stratejisi

```ts
// apps/backend/tests/contract/v1-billing.test.ts
it('GET /v1/billing/subscriptions → 200 + valid schema', async () => {
  const res = await request(app.getHttpServer())
    .get('/v1/billing/subscriptions')
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  // OpenAPI schema validator (skill: coverage-discipline → Contract test)
});
```

## Checklist (yeni v1 endpoint)

- [ ] Controller `version: '1'` mi?
- [ ] Path `v1/` prefix oluşturuyor mu (`/v1/foo`)?
- [ ] `@ApiTags(...)` ile Swagger gruplaması yapıldı mı?
- [ ] DTO + validator zorunlu mu?
- [ ] OpenAPI export'a girdi mi (`npm run openapi:export`)?
- [ ] Permission matrix testi v1 yolunu da kapsıyor mu?
- [ ] Breaking change ise: eski endpoint'e Sunset header eklendi mi?

İlgili skill: `release-engineering` (sürüm yönetimi), `idempotency` (yeni para endpoint'leri için).
