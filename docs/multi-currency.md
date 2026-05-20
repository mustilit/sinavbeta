# Çoklu Para Birimi (Multi-Currency) Roadmap

KALITE-DEGERLENDIRME §1 (İşlevsellik) önerisi. Şu an `priceCents` tek currency varsayıyor (TRY). Uluslararası açılım için altyapı planı.

## Hedef

- Educator fiyatı seçtiği currency'de girer: `TRY`, `USD`, `EUR`.
- Aday görür: kendi locale'ine göre formatlı (LB Group BG).
- Ödeme: educator'ın seçtiği currency'de işlenir; FX dönüşümü provider'ın işi (Stripe, Iyzico).
- Komisyon, payout: educator'ın currency'sinde.
- Cross-currency analytics: USD'ye normalize edilmiş (BI reporting).

## Şema değişikliği (Prisma)

Mevcut alanlar:

```prisma
priceCents       Int        // TRY varsayılıyor
campaignPriceCents Int?
```

Hedef:

```prisma
priceCents             Int
currency               Currency   @default(TRY)   // YENİ
campaignPriceCents     Int?
campaignCurrency       Currency?

enum Currency {
  TRY
  USD
  EUR
  GBP
}
```

İlgili tablolar (currency eklenecek):

- `ExamTest.priceCents` → `+ currency`
- `TestPackage.priceCents` → `+ currency`
- `AdPackage.priceCents` → `+ currency`
- `Purchase.amountCents` → `+ currency` (snapshot, FX'ten bağımsız)
- `Refund.amountCents` → `+ currency`
- `Payout.amountCents` → `+ currency`
- `DiscountCode.percentOff` → currency yok (% bazlı)
- `Subscription.priceCents` → `+ currency`

## Migration stratejisi

```
Stage 1: Currency enum + nullable column ekle (geriye dönük uyumlu).
  ALTER TABLE exam_tests ADD COLUMN currency "Currency";
  UPDATE exam_tests SET currency = 'TRY' WHERE currency IS NULL;
Stage 2: NOT NULL + DEFAULT TRY.
  ALTER TABLE exam_tests ALTER COLUMN currency SET NOT NULL;
  ALTER TABLE exam_tests ALTER COLUMN currency SET DEFAULT 'TRY';
```

Mevcut `db:preflight:stage2` pattern'i ile uyumlu.

## FX servis interface'i

```ts
// apps/backend/src/domain/interfaces/FxRateService.ts
export interface FxRateService {
  /**
   * Iki currency arası dönüşüm oranı.
   * Cache: 1 saat (TCMB veya benzeri API).
   */
  getRate(from: Currency, to: Currency): Promise<number>;

  /**
   * Bir tutarı (cents) hedef currency'ye dönüştür.
   * Yuvarlama: BANKER (ROUND_HALF_TO_EVEN).
   */
  convert(amountCents: number, from: Currency, to: Currency): Promise<number>;
}
```

İmplementasyonlar:

- `infrastructure/services/TcmbFxService.ts` — TCMB günlük kuru
- `infrastructure/services/ExchangeRateApiService.ts` — exchangerate-api.com
- `infrastructure/services/FixedFxService.ts` — test/dev için sabit kur

## Use case değişiklikleri

### Listing endpoint (Explore)

```ts
// Aday US'ten geliyor → fiyatları USD göster
async listMarketplaceTests(ctx, params) {
  const tests = await this.repo.list(params);
  const userCurrency = ctx.user?.preferredCurrency ?? detectFromGeoIP(ctx.ip);
  return Promise.all(tests.map(async (t) => ({
    ...t,
    displayPrice: {
      amountCents: t.priceCents,
      currency: t.currency,
      // Görsel için aday currency'sine dönüştür (yaklaşık)
      converted: userCurrency !== t.currency
        ? {
            amountCents: await this.fx.convert(t.priceCents, t.currency, userCurrency),
            currency: userCurrency,
            rate: await this.fx.getRate(t.currency, userCurrency),
          }
        : null,
    },
  })));
}
```

### Purchase (kritik: snapshot)

```ts
async purchase(ctx, dto) {
  const test = await this.repo.find(dto.testId);
  // Educator'ın orijinal currency'sinde işle — FX dönüşümü provider'da
  const purchase = await this.prisma.purchase.create({
    data: {
      testId: test.id,
      candidateId: ctx.user.id,
      amountCents: test.priceCents,
      currency: test.currency,    // Educator'ın currency'si
      providerRef: stripeIntentId,
      // ...
    },
  });
  // Reporting için USD normalize'i metadata'da snapshot
  const usdSnapshot = await this.fx.convert(
    test.priceCents,
    test.currency,
    'USD' as Currency,
  );
  await this.metricsRepo.recordPurchase({
    purchaseId: purchase.id,
    amountUsdCents: usdSnapshot,
  });
}
```

## Frontend görüntüleme

`formatCurrency(amountCents, currency, locale)` helper (`lib/i18n.js`).

```jsx
<span>{formatCurrency(test.priceCents, test.currency, i18n.language)}</span>
{test.displayPrice?.converted && (
  <span className="text-xs text-gray-500">
    ≈ {formatCurrency(test.displayPrice.converted.amountCents, test.displayPrice.converted.currency)}
  </span>
)}
```

## Yuvarlama disiplini

- Tüm tutarlar `Int cents` — float ASLA.
- FX dönüşüm sonrası **banker rounding** (RoundHalfToEven). Pythonbilim:
  ```ts
  function bankerRound(value: number): number {
    const rounded = Math.round(value);
    if (Math.abs(value - Math.floor(value) - 0.5) < 1e-9) {
      // halfway → en yakın çift
      return Math.floor(value) % 2 === 0 ? Math.floor(value) : Math.ceil(value);
    }
    return rounded;
  }
  ```
- Komisyon hesabı: `Math.floor(amountCents * commission / 100)` (yuvarlama platform'un avantajına).
- Vergi: ülke bazlı (`TaxCalculator` servis).

## Test

```ts
it('TRY → USD dönüşümü 0.5 cent yuvarlanır (banker)', async () => {
  const fx = new FixedFxService({ TRY_USD: 0.031 });
  expect(await fx.convert(10000, 'TRY', 'USD')).toBe(310); // 10000 * 0.031 = 310.00
  expect(await fx.convert(123, 'TRY', 'USD')).toBe(4);     // 123 * 0.031 = 3.813 → 4 (round)
});
```

## Sentry tag

```ts
Sentry.setTag('user_currency', userCurrency);
Sentry.setTag('test_currency', test.currency);
```

## Yol haritası

1. **Hafta 1:** `Currency` enum + Prisma migration (nullable stage).
2. **Hafta 2:** `FxRateService` interface + `FixedFxService` (dev), `TcmbFxService` (prod).
3. **Hafta 3:** Educator UI: test oluştururken currency seçimi.
4. **Hafta 4:** Listing endpoint USD/EUR dönüşüm + frontend `formatCurrency`.
5. **Hafta 5:** Purchase use case → currency snapshot.
6. **Hafta 6:** Reporting normalize (USD baseline).
7. **Hafta 7:** Stripe/Iyzico multi-currency provider tarafında test.
8. **Hafta 8:** NOT NULL + DEFAULT migrate (stage 2).

## İlgili

- KALITE-DEGERLENDIRME §1
- Skill: `payment-domain` (mevcut .claude/skills içinde)
- ADR-XXXX (Multi-currency snapshot policy — yazılacak)
