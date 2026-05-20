/**
 * PurchaseUseCase testleri
 *
 * Domain kuralı: Satın alma birimi TestPackage'dır.
 * Aday paketi satın alır → purchase.packageId = paket ID'si.
 * Paket içindeki TÜM testlere erişim bu tek purchase kaydından türetilir.
 * (purchase.testId, Prisma NOT NULL kısıtı için paketteki ilk ExamTest ID'si.)
 *
 * Standalone ExamTest satın alma akışı (legacy) da desteklenmekte,
 * ancak asıl akış paket satın almadır.
 */
// @ts-nocheck

import { BadRequestException, ConflictException } from '@nestjs/common';
import { PurchaseUseCase } from '../../src/application/use-cases/purchase/PurchaseUseCase';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Paket içindeki ExamTest fixture */
function makeExamTest(overrides: Record<string, unknown> = {}) {
  return {
    id: 'exam-1',
    status: 'PUBLISHED',
    priceCents: 0,          // paket fiyatı kullanılır
    currency: 'TRY',
    tenantId: 'dev-tenant',
    educatorId: 'edu-1',
    campaignPriceCents: null,
    campaignValidFrom: null,
    campaignValidUntil: null,
    ...overrides,
  };
}

/**
 * TestPackage fixture.
 * Gerçek pakette birden fazla test olabilir; burada n adet ExamTest içerir.
 */
function makePackage(overrides: Record<string, unknown> = {}, testCount = 1) {
  const tests = Array.from({ length: testCount }, (_, i) =>
    makeExamTest({ id: `exam-${i + 1}`, title: `Test ${i + 1}` })
  );
  return {
    id: 'pkg-1',
    title: 'KPSS 2026 Paketi',
    publishedAt: new Date('2025-01-01'),
    priceCents: 10000,     // paket fiyatı (₺100)
    tests,
    ...overrides,
  };
}

/** Transaction mock */
function makeTx(overrides: Record<string, unknown> = {}) {
  return {
    purchase: {
      create: jest.fn(async (d: any) => ({ id: 'pur-1', ...d.data })),
    },
    testAttempt: {
      create: jest.fn(async (d: any) => ({ id: 'att-1', ...d.data })),
    },
    auditLog: {
      create: jest.fn(async (d: any) => ({ id: 'log-1', ...d.data })),
    },
    discountCode: {
      updateMany: jest.fn(async () => ({ count: 1 })),
      update: jest.fn(async (d: any) => ({ id: d.where.id })),
    },
    ...overrides,
  };
}

/** Paket akışı için tam Prisma mock */
function makePrismaPackage(pkg: any, txOverrides: Record<string, unknown> = {}) {
  const tx = makeTx(txOverrides);
  return {
    adminSettings: { findFirst: jest.fn(async () => ({ id: 1, purchasesEnabled: true })) },
    examTest:     { findUnique: jest.fn(async () => null) },   // paket ID verilince null
    testPackage:  { findUnique: jest.fn(async () => pkg) },
    user:         { findUnique: jest.fn(async () => ({ id: 'cand-1', status: 'ACTIVE' })) },
    discountCode: { findFirst: jest.fn(async () => null) },
    $transaction: jest.fn(async (fn: any) => fn(tx)),
    _tx: tx,
  };
}

/** Standalone ExamTest akışı için Prisma mock (legacy destek testi) */
function makePrismaExamTest(test: any, txOverrides: Record<string, unknown> = {}) {
  const tx = makeTx(txOverrides);
  return {
    adminSettings: { findFirst: jest.fn(async () => ({ id: 1, purchasesEnabled: true })) },
    examTest:     { findUnique: jest.fn(async () => test) },
    user:         { findUnique: jest.fn(async () => ({ id: 'cand-1', status: 'ACTIVE' })) },
    discountCode: { findFirst: jest.fn(async () => null) },
    $transaction: jest.fn(async (fn: any) => fn(tx)),
    _tx: tx,
  };
}

// ---------------------------------------------------------------------------
// Testler
// ---------------------------------------------------------------------------

describe('PurchaseUseCase — paket satın alma (ana akış)', () => {
  // -------------------------------------------------------------------------
  // Temel başarı
  // -------------------------------------------------------------------------
  describe('başarılı paket satın alma', () => {
    it('purchase kaydında packageId doğru set edilir', async () => {
      const pkg = makePackage();
      const prisma = makePrismaPackage(pkg);
      const uc = new PurchaseUseCase(prisma as any);

      await uc.execute('pkg-1', 'cand-1');

      const data = prisma._tx.purchase.create.mock.calls[0][0].data;
      expect(data.packageId).toBe('pkg-1');          // paket ID'si zorunlu
      expect(data.candidateId).toBe('cand-1');
    });

    it('purchase.testId paket içindeki ilk ExamTest ID si (NOT NULL workaround)', async () => {
      // 3 testli paket — ilk testin ID'si kullanılmalı
      const pkg = makePackage({}, 3);
      const prisma = makePrismaPackage(pkg);
      const uc = new PurchaseUseCase(prisma as any);

      await uc.execute('pkg-1', 'cand-1');

      const data = prisma._tx.purchase.create.mock.calls[0][0].data;
      expect(data.testId).toBe('exam-1');            // her zaman paketteki ilk test
      expect(data.packageId).toBe('pkg-1');
    });

    it('paket fiyatı purchase.amountCents e yansır', async () => {
      const pkg = makePackage({ priceCents: 15000 });
      const prisma = makePrismaPackage(pkg);
      const uc = new PurchaseUseCase(prisma as any);

      await uc.execute('pkg-1', 'cand-1');

      const data = prisma._tx.purchase.create.mock.calls[0][0].data;
      expect(data.amountCents).toBe(15000);
    });

    it('paymentProvider (iyzico / google_pay / amazon_pay) kaydedilir', async () => {
      for (const provider of ['iyzico', 'google_pay', 'amazon_pay']) {
        const prisma = makePrismaPackage(makePackage());
        const uc = new PurchaseUseCase(prisma as any);
        await uc.execute('pkg-1', 'cand-1', undefined, provider);

        const data = prisma._tx.purchase.create.mock.calls[0][0].data;
        expect(data.paymentProvider).toBe(provider);
        jest.clearAllMocks();
      }
    });

    it('attempt + auditLog da oluşturulur', async () => {
      const prisma = makePrismaPackage(makePackage());
      const uc = new PurchaseUseCase(prisma as any);

      await uc.execute('pkg-1', 'cand-1');

      expect(prisma._tx.testAttempt.create).toHaveBeenCalledTimes(1);
      expect(prisma._tx.auditLog.create).toHaveBeenCalledTimes(1);
    });

    it('currency TRY varsayılan olarak kaydedilir', async () => {
      const pkg = makePackage();
      const prisma = makePrismaPackage(pkg);
      const uc = new PurchaseUseCase(prisma as any);

      await uc.execute('pkg-1', 'cand-1');

      const data = prisma._tx.purchase.create.mock.calls[0][0].data;
      expect(data.currency).toBe('TRY');
    });
  });

  // -------------------------------------------------------------------------
  // Paket fiyat kuralları
  // -------------------------------------------------------------------------
  describe('fiyat hesaplama', () => {
    it('ExamTest priceCents null olsa bile paketin fiyatını kullanır', async () => {
      // Paketteki test fiyatsız → paket fiyatı baz alınmalı
      const pkg = makePackage({ priceCents: 8000 }, 1);
      pkg.tests[0].priceCents = null;
      const prisma = makePrismaPackage(pkg);
      const uc = new PurchaseUseCase(prisma as any);

      await uc.execute('pkg-1', 'cand-1');

      const data = prisma._tx.purchase.create.mock.calls[0][0].data;
      expect(data.amountCents).toBe(8000);
    });

    it('geçerli kampanya fiyatı paket fiyatının önüne geçer', async () => {
      const past = new Date(Date.now() - 86_400_000);
      const future = new Date(Date.now() + 86_400_000);
      const pkg = makePackage({ priceCents: 10000 }, 1);
      // Kampanya testi ExamTest'e uygulanır; burada paket seviyesinde bir test
      pkg.tests[0].priceCents = 10000;
      pkg.tests[0].campaignPriceCents = 5000;
      pkg.tests[0].campaignValidFrom  = past;
      pkg.tests[0].campaignValidUntil = future;
      const prisma = makePrismaPackage(pkg);
      const uc = new PurchaseUseCase(prisma as any);

      await uc.execute('pkg-1', 'cand-1');

      const data = prisma._tx.purchase.create.mock.calls[0][0].data;
      expect(data.amountCents).toBe(5000);
    });

    it('süresi geçmiş kampanya kullanılmaz', async () => {
      const pkg = makePackage({ priceCents: 10000 }, 1);
      pkg.tests[0].priceCents = 10000;
      pkg.tests[0].campaignPriceCents = 5000;
      pkg.tests[0].campaignValidFrom  = new Date(Date.now() - 172_800_000);
      pkg.tests[0].campaignValidUntil = new Date(Date.now() - 86_400_000);
      const prisma = makePrismaPackage(pkg);
      const uc = new PurchaseUseCase(prisma as any);

      await uc.execute('pkg-1', 'cand-1');

      const data = prisma._tx.purchase.create.mock.calls[0][0].data;
      expect(data.amountCents).toBe(10000);
    });
  });

  // -------------------------------------------------------------------------
  // İndirim kodu
  // -------------------------------------------------------------------------
  describe('indirim kodu', () => {
    it('%50 indirim uygulanır, purchase.discountCodeId set edilir', async () => {
      const disc = {
        id: 'disc-1', code: 'HALF50', percentOff: 50,
        usedCount: 0, maxUses: null, validFrom: null, validUntil: null,
      };
      const prisma: any = {
        ...makePrismaPackage(makePackage({ priceCents: 10000 })),
        discountCode: { findFirst: jest.fn(async () => disc) },
      };
      const tx = makeTx();
      prisma.$transaction = jest.fn(async (fn: any) => fn(tx));
      prisma._tx = tx;

      const uc = new PurchaseUseCase(prisma);
      await uc.execute('pkg-1', 'cand-1', 'HALF50');

      const data = tx.purchase.create.mock.calls[0][0].data;
      expect(data.amountCents).toBe(5000);
      expect(data.discountCodeId).toBe('disc-1');
    });

    it('%50 üzeri indirim reddedilir (güvenlik kuralı)', async () => {
      const disc = {
        id: 'disc-bad', code: 'BIG60', percentOff: 60,
        usedCount: 0, maxUses: null, validFrom: null, validUntil: null,
      };
      const prisma: any = {
        ...makePrismaPackage(makePackage()),
        discountCode: { findFirst: jest.fn(async () => disc) },
      };
      const uc = new PurchaseUseCase(prisma);

      await expect(uc.execute('pkg-1', 'cand-1', 'BIG60')).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'DISCOUNT_TOO_HIGH' }),
      });
    });

    it('süresi dolmuş indirim kodu reddedilir', async () => {
      const disc = {
        id: 'disc-exp', code: 'OLD', percentOff: 10,
        usedCount: 0, maxUses: null,
        validFrom: null,
        validUntil: new Date('2020-01-01'),
      };
      const prisma: any = {
        ...makePrismaPackage(makePackage()),
        discountCode: { findFirst: jest.fn(async () => disc) },
      };
      const uc = new PurchaseUseCase(prisma);
      await expect(uc.execute('pkg-1', 'cand-1', 'OLD')).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'DISCOUNT_EXPIRED' }),
      });
    });

    it('maxUses dolunca reddedilir', async () => {
      const disc = {
        id: 'disc-max', code: 'MAXED', percentOff: 10,
        usedCount: 5, maxUses: 5, validFrom: null, validUntil: null,
      };
      const prisma: any = {
        ...makePrismaPackage(makePackage()),
        discountCode: { findFirst: jest.fn(async () => disc) },
      };
      const uc = new PurchaseUseCase(prisma);
      await expect(uc.execute('pkg-1', 'cand-1', 'MAXED')).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'DISCOUNT_MAXED_OUT' }),
      });
    });

    it('race condition: updateMany 0 kayıt → DISCOUNT_MAXED_OUT', async () => {
      const disc = {
        id: 'disc-race', code: 'RACE', percentOff: 10,
        usedCount: 4, maxUses: 5, validFrom: null, validUntil: null,
      };
      const prisma: any = {
        ...makePrismaPackage(makePackage()),
        discountCode: { findFirst: jest.fn(async () => disc) },
      };
      const tx = makeTx({
        discountCode: {
          updateMany: jest.fn(async () => ({ count: 0 })),
          update: jest.fn(),
        },
      });
      prisma.$transaction = jest.fn(async (fn: any) => fn(tx));

      const uc = new PurchaseUseCase(prisma);
      await expect(uc.execute('pkg-1', 'cand-1', 'RACE')).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'DISCOUNT_MAXED_OUT' }),
      });
    });
  });

  // -------------------------------------------------------------------------
  // Validation hataları
  // -------------------------------------------------------------------------
  describe('hata senaryoları', () => {
    it('FR-Y-05: purchasesEnabled=false → PURCHASES_DISABLED', async () => {
      const prisma: any = {
        adminSettings: { findFirst: jest.fn(async () => ({ id: 1, purchasesEnabled: false })) },
      };
      const uc = new PurchaseUseCase(prisma);
      await expect(uc.execute('pkg-1', 'cand-1')).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'PURCHASES_DISABLED' }),
      });
    });

    it('packageId veya candidateId boşsa INVALID_INPUT', async () => {
      const prisma: any = { adminSettings: { findFirst: jest.fn(async () => null) } };
      const uc = new PurchaseUseCase(prisma);
      await expect(uc.execute('', 'cand-1')).rejects.toBeInstanceOf(BadRequestException);
      await expect(uc.execute('pkg-1', '')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('paket yayınlanmamışsa TEST_NOT_PUBLISHED', async () => {
      const pkg = makePackage({ publishedAt: null });
      const prisma = makePrismaPackage(pkg);
      const uc = new PurchaseUseCase(prisma as any);
      await expect(uc.execute('pkg-1', 'cand-1')).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'TEST_NOT_PUBLISHED' }),
      });
    });

    it('paket içi boşsa PACKAGE_EMPTY', async () => {
      const pkg = makePackage({ tests: [] });
      const prisma = makePrismaPackage(pkg);
      const uc = new PurchaseUseCase(prisma as any);
      await expect(uc.execute('pkg-1', 'cand-1')).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'PACKAGE_EMPTY' }),
      });
    });

    it('paket bulunamazsa TEST_NOT_FOUND', async () => {
      const prisma: any = {
        adminSettings: { findFirst: jest.fn(async () => ({ id: 1, purchasesEnabled: true })) },
        examTest:    { findUnique: jest.fn(async () => null) },
        testPackage: { findUnique: jest.fn(async () => null) },
      };
      const uc = new PurchaseUseCase(prisma);
      await expect(uc.execute('nonexistent', 'cand-1')).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'TEST_NOT_FOUND' }),
      });
    });

    it('aday SUSPENDED durumdaysa CANDIDATE_NOT_ACTIVE', async () => {
      const prisma: any = {
        ...makePrismaPackage(makePackage()),
        user: { findUnique: jest.fn(async () => ({ id: 'cand-1', status: 'SUSPENDED' })) },
      };
      const uc = new PurchaseUseCase(prisma);
      await expect(uc.execute('pkg-1', 'cand-1')).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'CANDIDATE_NOT_ACTIVE' }),
      });
    });

    it('aynı paketi ikinci kez alırsa ALREADY_PURCHASED (P2002 → 409)', async () => {
      const tx = makeTx({
        purchase: {
          create: jest.fn(async () => {
            const e: any = new Error('unique constraint');
            e.code = 'P2002';
            throw e;
          }),
        },
      });
      const prisma: any = {
        ...makePrismaPackage(makePackage()),
        $transaction: jest.fn(async (fn: any) => fn(tx)),
      };
      const uc = new PurchaseUseCase(prisma);
      await expect(uc.execute('pkg-1', 'cand-1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('paket içindeki ExamTest DRAFT olsa bile yayınlı paketten satın alınabilir', async () => {
      // Paket yayında ama içindeki ExamTest DRAFT — bu geçerli bir durum
      const pkg = makePackage({}, 1);
      pkg.tests[0].status = 'DRAFT';
      const prisma = makePrismaPackage(pkg);
      const uc = new PurchaseUseCase(prisma as any);
      // Hata fırlatmamalı
      await expect(uc.execute('pkg-1', 'cand-1')).resolves.toBeDefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Legacy: standalone ExamTest satın alma (paket dışı)
// ---------------------------------------------------------------------------
describe('PurchaseUseCase — standalone ExamTest satın alma (legacy)', () => {
  it('PUBLISHED ExamTest satın alınabilir, packageId set edilmez', async () => {
    const test = makeExamTest({ id: 'solo-1', priceCents: 500, status: 'PUBLISHED' });
    const prisma = makePrismaExamTest(test);
    const uc = new PurchaseUseCase(prisma as any);

    await uc.execute('solo-1', 'cand-1');

    const data = prisma._tx.purchase.create.mock.calls[0][0].data;
    expect(data.testId).toBe('solo-1');
    expect(data.packageId).toBeUndefined();  // standalone: paket yok
  });

  it('DRAFT ExamTest standalone satın alınamaz', async () => {
    const test = makeExamTest({ id: 'solo-draft', status: 'DRAFT' });
    const prisma = makePrismaExamTest(test);
    const uc = new PurchaseUseCase(prisma as any);
    await expect(uc.execute('solo-draft', 'cand-1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'TEST_NOT_PUBLISHED' }),
    });
  });
});
