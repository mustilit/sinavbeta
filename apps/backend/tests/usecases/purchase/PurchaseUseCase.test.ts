/**
 * PurchaseUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - testId/candidateId eksik → INVALID_INPUT
 * - purchases kill-switch → PURCHASES_DISABLED
 * - Test bulunamazsa (ne examTest ne package) → TEST_NOT_FOUND
 * - Test yayınlanmamışsa → TEST_NOT_PUBLISHED
 * - Aday aktif değilse → CANDIDATE_NOT_ACTIVE
 * - Discount kodu bulunamazsa → DISCOUNT_NOT_FOUND
 * - Discount süresi başlamamış → DISCOUNT_NOT_STARTED
 * - Discount süresi dolmuş → DISCOUNT_EXPIRED
 * - Discount maxUses dolmuş → DISCOUNT_MAXED_OUT
 * - Discount %50 üzeri → DISCOUNT_TOO_HIGH
 * - Kampanya fiyatı geçerliyse uygulanır
 * - Başarı: purchase kaydı oluşturulur, audit log yazılır
 * - Duplicate purchase → ALREADY_PURCHASED ConflictException
 */

process.env.REDIS_DISABLED = '1';

const mockAdminSettingsFindFirst = jest.fn();
const mockExamTestFindUnique = jest.fn();
const mockTestPackageFindUnique = jest.fn();
const mockUserFindUnique = jest.fn();
const mockDiscountCodeFindFirst = jest.fn();
const mockPurchaseCreate = jest.fn();
const mockDiscountCodeUpdateMany = jest.fn();
const mockDiscountCodeUpdate = jest.fn();
const mockAuditLogCreate = jest.fn();
const mockTransaction = jest.fn();
const mockExamTestFindMany = jest.fn();

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    adminSettings: { findFirst: (...args: any[]) => mockAdminSettingsFindFirst(...args) },
    examTest: {
      findUnique: (...args: any[]) => mockExamTestFindUnique(...args),
      findMany: (...args: any[]) => mockExamTestFindMany(...args),
    },
    testPackage: { findUnique: (...args: any[]) => mockTestPackageFindUnique(...args) },
    user: { findUnique: (...args: any[]) => mockUserFindUnique(...args) },
    discountCode: {
      findFirst: (...args: any[]) => mockDiscountCodeFindFirst(...args),
      updateMany: (...args: any[]) => mockDiscountCodeUpdateMany(...args),
      update: (...args: any[]) => mockDiscountCodeUpdate(...args),
    },
    purchase: { create: (...args: any[]) => mockPurchaseCreate(...args) },
    auditLog: { create: (...args: any[]) => mockAuditLogCreate(...args) },
    $transaction: (...args: any[]) => mockTransaction(...args),
  },
}));

jest.mock('../../../src/infrastructure/prisma/prisma-retry', () => ({
  prismaRetry: (fn: () => Promise<any>) => fn(),
}));

jest.mock('../../../src/infrastructure/cache/RedisCache', () => ({
  RedisCache: jest.fn().mockImplementation(() => ({ delByPrefix: jest.fn().mockResolvedValue(undefined) })),
}));

jest.mock('../../../src/infrastructure/queue/queue.service', () => ({
  QueueService: jest.fn().mockImplementation(() => ({ enqueueJob: jest.fn() })),
}));

import { BadRequestException, ConflictException } from '@nestjs/common';
import { PurchaseUseCase } from '../../../src/application/use-cases/purchase/PurchaseUseCase';

function makeTest(overrides: Record<string, any> = {}) {
  return {
    id: 'test-1',
    tenantId: 't1',
    status: 'PUBLISHED',
    priceCents: 4900,
    campaignPriceCents: null,
    campaignValidFrom: null,
    campaignValidUntil: null,
    educatorId: 'edu-1',
    currency: 'TRY',
    questions: [],
    ...overrides,
  };
}

function makeUser(overrides: Record<string, any> = {}) {
  return { id: 'cand-1', status: 'ACTIVE', ...overrides };
}

// Transaction executor: tx sahte satın alma kaydı döner
const setupTransaction = () => {
  mockTransaction.mockImplementation(async (fn: any) => {
    const tx = {
      examTest: {
        findMany: mockExamTestFindMany,
      },
      purchase: { create: mockPurchaseCreate },
      auditLog: { create: mockAuditLogCreate },
      discountCode: {
        updateMany: mockDiscountCodeUpdateMany,
        update: mockDiscountCodeUpdate,
      },
    };
    return fn(tx);
  });
  mockPurchaseCreate.mockResolvedValue({ id: 'pur-1', candidateId: 'cand-1', testId: 'test-1', amountCents: 4900 });
  mockAuditLogCreate.mockResolvedValue({});
  mockExamTestFindMany.mockResolvedValue([]);
};

describe('PurchaseUseCase', () => {
  let prismaClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const { prisma } = require('../../../src/infrastructure/database/prisma');
    prismaClient = prisma;
    mockAdminSettingsFindFirst.mockResolvedValue({ id: 1, purchasesEnabled: true });
    mockExamTestFindUnique.mockResolvedValue(makeTest());
    mockUserFindUnique.mockResolvedValue(makeUser());
    mockDiscountCodeFindFirst.mockResolvedValue(null);
    setupTransaction();
  });

  it('testId eksik ise BadRequestException fırlatır', async () => {
    const uc = new PurchaseUseCase(prismaClient);
    await expect(uc.execute('', 'cand-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('candidateId eksik ise BadRequestException fırlatır', async () => {
    const uc = new PurchaseUseCase(prismaClient);
    await expect(uc.execute('test-1', '')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('purchasesEnabled=false ise PURCHASES_DISABLED fırlatır', async () => {
    mockAdminSettingsFindFirst.mockResolvedValue({ id: 1, purchasesEnabled: false });
    const uc = new PurchaseUseCase(prismaClient);
    await expect(uc.execute('test-1', 'cand-1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PURCHASES_DISABLED' }),
    });
  });

  it('test bulunamazsa TEST_NOT_FOUND fırlatır', async () => {
    mockExamTestFindUnique.mockResolvedValue(null);
    // TestPackage da yok
    mockTestPackageFindUnique.mockResolvedValue(null);
    const uc = new PurchaseUseCase(prismaClient);
    await expect(uc.execute('test-missing', 'cand-1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'TEST_NOT_FOUND' }),
    });
  });

  it('test PUBLISHED değilse TEST_NOT_PUBLISHED fırlatır', async () => {
    mockExamTestFindUnique.mockResolvedValue(makeTest({ status: 'DRAFT' }));
    const uc = new PurchaseUseCase(prismaClient);
    await expect(uc.execute('test-1', 'cand-1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'TEST_NOT_PUBLISHED' }),
    });
  });

  it('aday SUSPENDED ise CANDIDATE_NOT_ACTIVE fırlatır', async () => {
    mockUserFindUnique.mockResolvedValue(makeUser({ status: 'SUSPENDED' }));
    const uc = new PurchaseUseCase(prismaClient);
    await expect(uc.execute('test-1', 'cand-1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CANDIDATE_NOT_ACTIVE' }),
    });
  });

  it('discount kodu bulunamazsa DISCOUNT_NOT_FOUND fırlatır', async () => {
    mockDiscountCodeFindFirst.mockResolvedValue(null);
    const uc = new PurchaseUseCase(prismaClient);
    await expect(uc.execute('test-1', 'cand-1', 'INVALID_CODE')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'DISCOUNT_NOT_FOUND' }),
    });
  });

  it('discount validFrom gelecekte ise DISCOUNT_NOT_STARTED fırlatır', async () => {
    mockDiscountCodeFindFirst.mockResolvedValue({
      id: 'disc-1',
      code: 'SAVE10',
      percentOff: 10,
      validFrom: new Date(Date.now() + 86_400_000),
      validUntil: null,
      maxUses: null,
      usedCount: 0,
    });
    const uc = new PurchaseUseCase(prismaClient);
    await expect(uc.execute('test-1', 'cand-1', 'SAVE10')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'DISCOUNT_NOT_STARTED' }),
    });
  });

  it('discount süresi dolmuşsa DISCOUNT_EXPIRED fırlatır', async () => {
    mockDiscountCodeFindFirst.mockResolvedValue({
      id: 'disc-1',
      code: 'OLD10',
      percentOff: 10,
      validFrom: null,
      validUntil: new Date(Date.now() - 86_400_000),
      maxUses: null,
      usedCount: 0,
    });
    const uc = new PurchaseUseCase(prismaClient);
    await expect(uc.execute('test-1', 'cand-1', 'OLD10')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'DISCOUNT_EXPIRED' }),
    });
  });

  it('discount maxUses dolmuşsa DISCOUNT_MAXED_OUT fırlatır', async () => {
    mockDiscountCodeFindFirst.mockResolvedValue({
      id: 'disc-1',
      code: 'FULL10',
      percentOff: 10,
      validFrom: null,
      validUntil: null,
      maxUses: 100,
      usedCount: 100,
    });
    const uc = new PurchaseUseCase(prismaClient);
    await expect(uc.execute('test-1', 'cand-1', 'FULL10')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'DISCOUNT_MAXED_OUT' }),
    });
  });

  it('discount %50 üzeri ise DISCOUNT_TOO_HIGH fırlatır', async () => {
    mockDiscountCodeFindFirst.mockResolvedValue({
      id: 'disc-1',
      code: 'BIG75',
      percentOff: 75,
      validFrom: null,
      validUntil: null,
      maxUses: null,
      usedCount: 0,
    });
    const uc = new PurchaseUseCase(prismaClient);
    await expect(uc.execute('test-1', 'cand-1', 'BIG75')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'DISCOUNT_TOO_HIGH' }),
    });
  });

  it('kampanya fiyatı geçerliyse baz fiyat olarak kullanılır', async () => {
    const now = new Date();
    const from = new Date(now.getTime() - 3600_000);
    const until = new Date(now.getTime() + 3600_000);
    mockExamTestFindUnique.mockResolvedValue(
      makeTest({ campaignPriceCents: 1000, campaignValidFrom: from, campaignValidUntil: until }),
    );
    const uc = new PurchaseUseCase(prismaClient);
    await uc.execute('test-1', 'cand-1');
    const purchaseData = mockPurchaseCreate.mock.calls[0][0].data;
    expect(purchaseData.amountCents).toBe(1000);
  });

  it('başarı: purchase kaydı oluşturulur', async () => {
    const uc = new PurchaseUseCase(prismaClient);
    const result = await uc.execute('test-1', 'cand-1');
    expect(mockPurchaseCreate).toHaveBeenCalledTimes(1);
    expect(result.purchase).toBeDefined();
    expect(result.purchase.id).toBe('pur-1');
  });

  it('duplicate purchase → ConflictException ALREADY_PURCHASED', async () => {
    mockTransaction.mockImplementation(() => {
      const err: any = new Error('Unique constraint');
      err.code = 'P2002';
      throw err;
    });
    const uc = new PurchaseUseCase(prismaClient);
    await expect(uc.execute('test-1', 'cand-1')).rejects.toBeInstanceOf(ConflictException);
  });
});
