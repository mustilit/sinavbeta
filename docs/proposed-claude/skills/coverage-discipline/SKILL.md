---
name: coverage-discipline
description: Jest ve Vitest coverage threshold yapılandırması, Codecov entegrasyonu, mutation testing (Stryker), contract test (OpenAPI schema), permission matrix coverage. Test coverage düşmesini engellemek, PR'da delta zorunluluğu kurmak, kalite bekçisini sıkmak için kullanın.
---

# Coverage Discipline — Sınav Salonu

KALITE-DEGERLENDIRME §11 "Test Kalitesi 4/10" en zayıf alanı. 149 use-case ve 47 sayfa için sistematik coverage gerek. Bu skill **nasıl ölçülür, threshold nereye konur, hangi katmana ne hedeflenir** sorularını çözer. Test yazma stratejisi `tdd-workflow` skill'inde.

## Hedef matrisi

| Katman | Coverage hedefi | Mutation score | Test türü |
|---|---|---|---|
| `application/use-cases/**` | %85 stmt / %80 branch | %60 | Unit (Jest, Prisma mock) |
| `domain/**` | %95 | %80 | Pure unit |
| `infrastructure/repositories/**` | %70 | — | Integration (testcontainers veya InMemory) |
| `nest/controllers/**` | %80 | %50 | Integration (supertest + AppModule) |
| `nest/guards/**` | %95 | %80 | Unit + integration |
| `frontend/src/pages/**` | %60 | — | Vitest + Testing Library |
| `frontend/src/components/**` | %75 | — | Vitest + Testing Library |
| `frontend/src/api/dalClient.js` | %90 | — | Unit (msw veya fetch mock) |
| `frontend/src/lib/**` | %85 | — | Unit |
| E2E kritik akış | 5 spec (kayıt, satın al, çöz, iade, canlı) | — | Playwright |

**Genel hedef:** Global %60'tan başla, çeyrek sonu %75, yıl sonu %85.

## Jest configuration (apps/backend)

```js
// apps/backend/jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  moduleNameMapper: {
    '^@application/(.*)$': '<rootDir>/src/application/$1',
    '^@domain/(.*)$': '<rootDir>/src/domain/$1',
    '^@infrastructure/(.*)$': '<rootDir>/src/infrastructure/$1',
    '^@presentation/(.*)$': '<rootDir>/src/nest/$1',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.dto.ts',
    '!src/**/*.module.ts',
    '!src/main.ts',
    '!src/instrument.ts',
    '!src/**/index.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'json-summary', 'html'],
  coverageThreshold: {
    global: {
      statements: 60,
      branches: 50,
      functions: 60,
      lines: 60,
    },
    'src/application/use-cases/**/*.ts': {
      statements: 85,
      branches: 80,
      functions: 85,
      lines: 85,
    },
    'src/domain/**/*.ts': {
      statements: 95,
      branches: 90,
      functions: 95,
      lines: 95,
    },
    'src/nest/guards/**/*.ts': {
      statements: 95,
      branches: 90,
      functions: 95,
      lines: 95,
    },
  },
};
```

Threshold'ları **kademeli yükselt** — bugün geçen %60'tan başla, her sprint %3-5 artır.

## Vitest configuration (apps/frontend)

```js
// apps/frontend/vitest.config.js
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary', 'html'],
      include: ['src/**/*.{js,jsx}'],
      exclude: [
        'src/**/*.test.{js,jsx}',
        'src/main.jsx',
        'src/**/*.config.js',
        'src/components/ui/**', // shadcn primitives — kendi testleri yeterli
      ],
      thresholds: {
        statements: 50,
        branches: 40,
        functions: 50,
        lines: 50,
        'src/pages/**/*.{js,jsx}': { statements: 60, branches: 50, functions: 60, lines: 60 },
        'src/api/**/*.{js,jsx}': { statements: 90, branches: 80, functions: 90, lines: 90 },
      },
    },
  },
});
```

## Codecov entegrasyonu

`codecov.yml`:

```yaml
codecov:
  require_ci_to_pass: true
  notify:
    wait_for_ci: true

coverage:
  status:
    project:
      default:
        target: auto
        threshold: 1%   # bir önceki main'e göre düşmesin (1% tolerans)
      backend:
        paths: ['apps/backend/']
        target: 60%
      frontend:
        paths: ['apps/frontend/']
        target: 50%
      use-cases:
        paths: ['apps/backend/src/application/use-cases/']
        target: 85%
    patch:
      default:
        target: 80%   # yeni yazılan kodun %80'i kapsanmalı
        threshold: 0%

comment:
  layout: 'header,diff,flags,components,tree'
  require_changes: true

flags:
  backend:
    paths: ['apps/backend/']
    carryforward: true
  frontend:
    paths: ['apps/frontend/']
    carryforward: true

ignore:
  - '**/*.dto.ts'
  - '**/*.module.ts'
  - 'apps/backend/src/main.ts'
  - 'apps/backend/src/instrument.ts'
```

`.github/workflows/coverage.yml` (mevcut `backend-migrate-and-test.yml` içine entegre edilebilir):

```yaml
- name: Backend coverage
  working-directory: apps/backend
  run: npm test -- --coverage

- name: Frontend coverage
  working-directory: apps/frontend
  run: npm run test:coverage

- name: Upload to Codecov
  uses: codecov/codecov-action@v4
  with:
    token: ${{ secrets.CODECOV_TOKEN }}
    files: ./apps/backend/coverage/lcov.info,./apps/frontend/coverage/lcov.info
    flags: backend,frontend
```

## Mutation Testing — Stryker

Coverage %85 olsa bile testler "isim verince geçer" tipi olabilir. Mutation testing: kodda bilinçli bug üretip test'in yakalayıp yakalamadığını ölçer.

```bash
cd apps/backend
npm i -D @stryker-mutator/core @stryker-mutator/jest-runner @stryker-mutator/typescript-checker
```

`apps/backend/stryker.conf.json`:

```json
{
  "$schema": "https://unpkg.com/@stryker-mutator/core/schema/stryker-schema.json",
  "packageManager": "npm",
  "testRunner": "jest",
  "reporters": ["progress", "clear-text", "html", "json"],
  "coverageAnalysis": "perTest",
  "checkers": ["typescript"],
  "tsconfigFile": "tsconfig.json",
  "mutate": [
    "src/application/use-cases/**/*.ts",
    "!src/**/*.dto.ts"
  ],
  "thresholds": {
    "high": 80,
    "low": 60,
    "break": 50
  },
  "incremental": true
}
```

CI'da haftalık (`workflow_dispatch` veya `cron`):

```yaml
# .github/workflows/mutation.yml
on:
  schedule:
    - cron: '0 6 * * 1'  # Pazartesi 06:00
  workflow_dispatch:

jobs:
  mutation:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci --prefix apps/backend
      - run: npx stryker run --prefix apps/backend
      - uses: actions/upload-artifact@v4
        with:
          name: mutation-report
          path: apps/backend/reports/mutation/
```

## Contract Test (OpenAPI)

Frontend ↔ Backend uyumsuzluğu (eksik alan, tipi değişmiş response) production'da `undefined.someField` olarak patlamasın.

```bash
cd apps/backend && npm run openapi:export   # openapi.json üretir
```

`apps/backend/tests/contract/openapi-schema.test.ts`:

```ts
import OpenAPIResponseValidator from 'openapi-response-validator';
import openApiSpec from '../../openapi.json';

describe('OpenAPI contract', () => {
  it('GET /tests response schema matches spec', async () => {
    const res = await request(app.getHttpServer()).get('/tests?limit=10');
    const validator = new OpenAPIResponseValidator({
      responses: openApiSpec.paths['/tests'].get.responses,
      components: openApiSpec.components,
    });
    const errors = validator.validateResponse(200, res.body);
    expect(errors).toBeNull();
  });
});
```

Frontend için (msw + spec'ten otomatik):

```bash
cd apps/frontend
npm i -D msw openapi-typescript
npx openapi-typescript ../backend/openapi.json -o src/api/openapi-types.ts
```

## Coverage delta PR commentı

GitHub Action ile:

```yaml
- uses: jgillick/jest-coverage-comment@v3
  with:
    title: "Backend Coverage"
    coverage-summary-path: ./apps/backend/coverage/coverage-summary.json
    junitxml-path: ./apps/backend/junit.xml
```

veya Codecov'un PR comment'i (yukarıdaki codecov.yml `comment.layout` ile).

## Negatif yol testleri zorunlu

Her use case için en az 2 hata yolu test edilmeli:

```ts
describe('PurchaseTestUseCase', () => {
  it('test yayımlı değilse 400 fırlatır', async () => {});
  it('zaten satın alınmışsa 409 Conflict', async () => {});
  it('indirim kodu geçersizse 400', async () => {});
  it('ödeme sağlayıcı reject ederse rollback', async () => {});
  // mutlu yol(lar)
  it('başarılı satın alma kayıt oluşturur', async () => {});
});
```

## Hangi testi YAZMAYACAĞIM

- **Mock'un mock'ladığını test etme:** `mock.method.mockReturnValue(x); expect(mock.method()).toBe(x)` — anlam yok.
- **3rd party'i test etme:** Prisma'nın `findFirst`'ünü test etmek senin işin değil.
- **UI snapshot karmaşası:** Karmaşık component'lerde snapshot diff gürültü olur — davranış testi tercih.
- **Implementation detail:** "method `_compute` 3 kere çağrıldı" değil, "doğru sonucu döndü".

## Sıralı yol haritası (8 hafta)

| Hafta | İş | Hedef |
|---|---|---|
| 1 | Jest threshold %60 ekle, mevcut testleri kategorize et | Baseline ölç |
| 2 | Her domain klasöründen kritik 5 use case için unit test | Backend coverage %50 |
| 3 | Permission matrix testi 45 controller × 4 rol | Yetki bug'ları çıkar |
| 4 | Vitest + a11y spec'i çalıştır (axe-core) | Frontend coverage %40 |
| 5 | E2E Playwright: 5 kritik akış | Smoke test ağı |
| 6 | Stryker baseline çalıştır, %50 break threshold | Mutation visibility |
| 7 | Contract test (OpenAPI schema) | API regression koruması |
| 8 | Threshold'ları %5 artır, Codecov PR comment | Disiplin oturtuldu |

## Checklist (her yeni use case)

- [ ] Mutlu yol unit test mi?
- [ ] En az 2 negatif yol (validation, business rule) testi mi?
- [ ] Permission matrix'e endpoint eklendi mi?
- [ ] Database write varsa transaction rollback test edildi mi?
- [ ] Coverage threshold geçti mi?

İlgili skill'ler: `tdd-workflow` (test yazımı pattern), agent: `test-writer`, `e2e-writer`.
