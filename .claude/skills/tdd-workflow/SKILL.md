---
name: tdd-workflow
description: TDD döngüsü — kırmızı/yeşil/refactor, test piramidi, AAA pattern, mock stratejisi. Test yazarken veya TDD yaklaşımıyla geliştirme yapılırken referans alın.
---

# TDD Workflow

## Döngü

**1. Kırmızı** — başarısız bir test yaz. Minimum, tek davranış.
**2. Yeşil** — testi geçirmek için en az kod değişikliği yap. "Güzel" olmak zorunda değil.
**3. Refactor** — testler yeşilken kodu temizle. Test koşumu kırılmazsa güvendesin.

Bu döngü dakikalar seviyesinde. "Yarım gün sonra test yazıyorum" TDD değil.

## Test Piramidi

```
       e2e (az, yavaş, kritik akışları korur)
      /---\
     /     \
    /integ.\ (orta, service + controller)
   /---------\
  /           \
 /    unit     \ (çok, hızlı, pure logic)
```

Unit her fonksiyonun, integration her endpoint'in, e2e her kritik kullanıcı akışının korumasıdır. Oranlar kabaca 70/20/10.

## AAA Pattern

```ts
it('should reject purchase when exam is not published', async () => {
  // Arrange
  const exam = await factory.exam({ publishedAt: null });
  const user = await factory.user();

  // Act
  const act = () => service.purchase(user.id, exam.id);

  // Assert
  await expect(act).rejects.toThrow('Exam is not published');
});
```

## İsim Kuralı

Test adı **senaryo** anlatsın, kodu değil.

İyi: `returns 403 when user is not the author`
Kötü: `test update function`, `test 2`, `works`

Türkçe varyant: `yayımlanmamış sınav satın alınamaz`.

## Mock Stratejisi

| Durum | Yaklaşım |
|-------|----------|
| Saf fonksiyon | Mock yok, input-output test et |
| Service + Prisma (unit) | Prisma'yı mock'la, service'i test et |
| Controller + Service (integ) | Gerçek service, gerçek Prisma (test DB) |
| Harici servis (ödeme, email) | Interface üzerinden mock provider |
| Zaman | `vi.useFakeTimers()` |
| Network | `vi.mock('@/api/dalClient')` (frontend), jest.mock prisma (backend) |

## Frontend Test (Vitest + Testing Library)

```ts
// apps/frontend/src/components/ExamCard.test.jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExamCard } from './ExamCard';

describe('ExamCard', () => {
  it('kullanıcı Satın Al butonuna tıkladığında onPurchase çağrılır', async () => {
    const onPurchase = vi.fn();
    render(<ExamCard exam={{ id: '1', title: 'TYT', price: 50 }} onPurchase={onPurchase} />);

    await userEvent.click(screen.getByRole('button', { name: /satın al/i }));

    expect(onPurchase).toHaveBeenCalledWith('1');
  });
});
```

## Backend Test (Jest + NestJS)

```ts
// apps/backend/tests/usecases/UpdateExamTestUseCase.test.ts
import { UpdateExamTestUseCase } from '../../src/application/use-cases/test/UpdateExamTestUseCase';

jest.mock('../../src/infrastructure/database/prisma', () => ({
  prisma: {
    examTest: { findUnique: jest.fn(), update: jest.fn() },
  },
}));

describe('UpdateExamTestUseCase', () => {
  it('owner olmayan kullanıcı güncelleyemez', async () => {
    const { prisma } = require('../../src/infrastructure/database/prisma');
    prisma.examTest.findUnique.mockResolvedValue({ id: '1', educatorId: 'other' });
    const uc = new UpdateExamTestUseCase();
    await expect(uc.execute('me', '1', {})).rejects.toThrow(ForbiddenException);
    expect(prisma.examTest.update).not.toHaveBeenCalled();
  });
});
```

## E2E Test (Playwright)

```ts
// apps/frontend/e2e/specs/package-purchase.spec.ts
test.describe('Paket satın alma akışı', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await login(page, 'candidate@test');
  });

  test('aday yayımlanmış paketi satın alabilir', async ({ page }) => {
    await page.getByRole('link', { name: 'TYT Deneme' }).click();
    await page.getByRole('button', { name: 'Satın Al' }).click();
    await expect(page.getByText('Kütüphanenizde')).toBeVisible();
  });
});
```

## Flaky Test Kuralı

Bir test iki ardışık koşuda farklı sonuç veriyorsa **hemen** incele:
- Zaman bağımlılığı mı? (`Date.now`, `setTimeout`)
- Sıralama bağımlılığı mı? (global state, test order)
- Network varyansı mı? (gerçek network, mock et)

Flaky test'i "yeniden çalıştır" ile geçiştirmek → testlerin güvenini çöktürür.

## Kapsam Hedefi

- Domain/business logic: %90+
- Controller: %70+ (kritik akışlar e2e'de)
- UI component: "render + ana interaction" yeter
- Util: %100

Kapsam metrik değil, rehber. %100 kapsam anlamsız test'lerle elde edilebilir — kaliteye bak.

## Sık Karşılaşılan Tuzaklar (18 May 2026 — test koşumu raporundan)

### 1. Use case constructor'ında default Prisma repository

Eğer use case constructor opsiyonel parametre olarak Prisma repository alıp default olarak yeni instance üretiyorsa, test edilen senaryoda fake repo geçilse bile **module import** sırasında gerçek Prisma yüklenir. Bu durumda jest.mock ile prisma modülünü mock'la veya parametreyi her zaman explicit ver.

```ts
// ❌ KÖTÜ — test gerçek Prisma'yı yükler (engine binary yoksa patlar)
constructor(
  private repo: any,
  private prefsRepo = new PrismaUserPreferenceRepository(), // default → real prisma
) {}

// ✅ İYİ — test mock geçer, ama yine de prisma modülünü mock et:
jest.mock('../../src/infrastructure/database/prisma', () => ({
  prisma: { userPreference: { findUnique: jest.fn(async () => null) } },
}));
```

### 2. Dinamik `require('prisma')` çağrıları

Use case içinde `const { prisma } = require(...)` yapan kod, jest.mock'sız test'lerde gerçek Prisma'ya bağlanmaya çalışır. Bu satırlar:

- `PublishTestUseCase` — `adminSettings.findFirst` kill-switch
- `ListMarketplaceTestsUseCase` — `testStats.findMany` cache lookup

Bu tip use case'leri test ederken dosyanın en üstünde mock şart:

```ts
jest.mock('../../src/infrastructure/database/prisma', () => ({
  prisma: {
    adminSettings: { findFirst: jest.fn(async () => ({ testPublishingEnabled: true })) },
    testStats: { findMany: jest.fn(async () => []) },
  },
}));
```

### 3. Redis / Queue bağımlılıkları

`REDIS_DISABLED=1` env ile testlerin BullMQ/Redis bağlantısı denemesi engellenebilir. Ek olarak `QueueService` ve `RedisCache` modüllerini jest.mock'la — test ortamında 20sn timeout'a düşmeye karşı garanti.

```ts
jest.mock('../../src/infrastructure/queue/queue.service', () => ({
  QueueService: jest.fn().mockImplementation(() => ({
    enqueueJob: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../src/infrastructure/cache/RedisCache', () => ({
  RedisCache: jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    delByPrefix: jest.fn().mockResolvedValue(undefined),
  })),
}));
```

### 4. Worker modülleri (cron, queue) prisma import eder

`stats.worker.ts` gibi modüller top-level'da `import { prisma } from '../database/prisma'` yapar. Test bu modülü import ettiğinde gerçek PrismaClient başlatılır. `prisma.ts` ise `$on('error')` handler register eder; engine binary yokken bu handler tetiklenir ve process exit code 1 olur. Çözüm: bu tür modüller için test başında prisma mock.

```ts
// tests/cron/stats-worker.test.ts
jest.mock('../../src/infrastructure/database/prisma', () => ({ prisma: {} }));
const { makeStatsJobHandler } = require('../../src/infrastructure/queue/stats.worker');
```

### 5. Prisma binary cross-platform

Windows'ta `prisma generate` çalıştırılmışsa engine `query_engine-windows.dll.node` olur. Aynı `node_modules` Linux container'a mount edilirse engine bulunmaz. Çözümler:
- `prisma/schema.prisma`'ya `binaryTargets = ["native", "debian-openssl-3.0.x"]` ekle
- CI'da `prisma generate` build adımının öncesinde çalıştır
- Test environment'ında prisma'yı tamamen mock'la (yukarıdaki örnekler)

### 6. Çekirdek kural

Bir use case test'i CI'da yeşil ama lokalde sürekli timeout/hang yaşıyorsa, %90 ihtimal eksik mock vardır. `--detectOpenHandles` aç ve neyin asılı kaldığını öğren:

```bash
jest --runInBand --detectOpenHandles tests/usecases/<test>.test.ts
```
