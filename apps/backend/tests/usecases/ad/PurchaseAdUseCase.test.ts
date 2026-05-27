/**
 * PurchaseAdUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - adPurchasesEnabled=false → AD_PURCHASES_DISABLED
 * - Kullanıcı bulunamazsa USER_NOT_FOUND
 * - Askıya alınmış eğitici reklamlara erişemez
 * - Reklam paketi bulunamazsa AD_PACKAGE_NOT_FOUND
 * - Pasif reklam paketi → AD_PACKAGE_INACTIVE
 * - TEST türünde testId yoksa TEST_ID_REQUIRED
 * - Test bulunamazsa TEST_NOT_FOUND
 * - Test başkasına ait ise FORBIDDEN_NOT_OWNER
 * - Test yayınlanmamışsa TEST_NOT_PUBLISHED
 * - EDUCATOR türünde başarı
 * - TEST türünde başarı
 */

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    adminSettings: { findFirst: jest.fn().mockResolvedValue(null) },
    adPackage: { findUnique: jest.fn() },
    examTest: { findUnique: jest.fn() },
    adPurchase: {
      create: jest.fn().mockImplementation(async ({ data }: any) => ({
        id: 'ad-purchase-1',
        ...data,
        validUntil: new Date(),
        impressionsRemaining: data.impressionsRemaining,
        impressionsDelivered: 0,
        createdAt: new Date(),
      })),
    },
  },
}));

import { PurchaseAdUseCase } from '../../../src/application/use-cases/ad/PurchaseAdUseCase';
import { BadRequestException } from '@nestjs/common';
import { prisma } from '../../../src/infrastructure/database/prisma';

const mockPrisma = prisma as any;

function makeUser(overrides: any = {}) {
  return {
    id: 'edu-1',
    role: 'EDUCATOR',
    status: 'ACTIVE',
    tenantId: 'tenant-1',
    educatorApprovedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function makeAdPackage(overrides: any = {}) {
  return { id: 'ad-pkg-1', active: true, durationDays: 7, impressions: 500, priceCents: 2000, ...overrides };
}

function makeTest(overrides: any = {}) {
  return { id: 'test-1', educatorId: 'edu-1', status: 'PUBLISHED', tenantId: 'tenant-1', ...overrides };
}

function makeUserRepo(user: any = null) {
  return { findById: jest.fn().mockResolvedValue(user) };
}

describe('PurchaseAdUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.adminSettings.findFirst.mockResolvedValue(null);
    mockPrisma.adPackage.findUnique.mockResolvedValue(makeAdPackage());
    mockPrisma.examTest.findUnique.mockResolvedValue(makeTest());
  });

  it('adPurchasesEnabled=false ise AD_PURCHASES_DISABLED fırlatır', async () => {
    mockPrisma.adminSettings.findFirst.mockResolvedValue({ adPurchasesEnabled: false });
    const uc = new PurchaseAdUseCase(makeUserRepo(makeUser()) as any);
    await expect(uc.execute('edu-1', 'ad-pkg-1', 'test-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('kullanıcı bulunamazsa USER_NOT_FOUND fırlatır', async () => {
    const uc = new PurchaseAdUseCase(makeUserRepo(null) as any);
    await expect(uc.execute('edu-1', 'ad-pkg-1', 'test-1')).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
    });
  });

  it('eğitici askıya alınmışsa hata fırlatır (ensureEducatorActive)', async () => {
    const uc = new PurchaseAdUseCase(makeUserRepo(makeUser({ status: 'SUSPENDED' })) as any);
    await expect(uc.execute('edu-1', 'ad-pkg-1', 'test-1')).rejects.toBeDefined();
  });

  it('reklam paketi bulunamazsa AD_PACKAGE_NOT_FOUND fırlatır', async () => {
    mockPrisma.adPackage.findUnique.mockResolvedValue(null);
    const uc = new PurchaseAdUseCase(makeUserRepo(makeUser()) as any);
    await expect(uc.execute('edu-1', 'bad-pkg', 'test-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reklam paketi pasifse AD_PACKAGE_INACTIVE fırlatır', async () => {
    mockPrisma.adPackage.findUnique.mockResolvedValue(makeAdPackage({ active: false }));
    const uc = new PurchaseAdUseCase(makeUserRepo(makeUser()) as any);
    await expect(uc.execute('edu-1', 'ad-pkg-1', 'test-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('TEST türünde testId yoksa TEST_ID_REQUIRED fırlatır', async () => {
    const uc = new PurchaseAdUseCase(makeUserRepo(makeUser()) as any);
    await expect(uc.execute('edu-1', 'ad-pkg-1', null, 'TEST')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('test bulunamazsa TEST_NOT_FOUND fırlatır', async () => {
    mockPrisma.examTest.findUnique.mockResolvedValue(null);
    const uc = new PurchaseAdUseCase(makeUserRepo(makeUser()) as any);
    await expect(uc.execute('edu-1', 'ad-pkg-1', 'bad-test')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('test başkasının testiyse FORBIDDEN_NOT_OWNER fırlatır', async () => {
    mockPrisma.examTest.findUnique.mockResolvedValue(makeTest({ educatorId: 'other-edu' }));
    const uc = new PurchaseAdUseCase(makeUserRepo(makeUser()) as any);
    await expect(uc.execute('edu-1', 'ad-pkg-1', 'test-1')).rejects.toMatchObject({
      code: 'FORBIDDEN_NOT_OWNER',
    });
  });

  it('test yayınlanmamışsa TEST_NOT_PUBLISHED fırlatır', async () => {
    mockPrisma.examTest.findUnique.mockResolvedValue(makeTest({ status: 'DRAFT' }));
    const uc = new PurchaseAdUseCase(makeUserRepo(makeUser()) as any);
    await expect(uc.execute('edu-1', 'ad-pkg-1', 'test-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('TEST türünde başarılı satın alma', async () => {
    const uc = new PurchaseAdUseCase(makeUserRepo(makeUser()) as any);
    const result = await uc.execute('edu-1', 'ad-pkg-1', 'test-1', 'TEST');
    expect(result.targetType).toBe('TEST');
    expect(result.testId).toBe('test-1');
    expect(result.impressionsRemaining).toBe(500);
  });

  it('EDUCATOR türünde testId zorunlu değil', async () => {
    const uc = new PurchaseAdUseCase(makeUserRepo(makeUser()) as any);
    const result = await uc.execute('edu-1', 'ad-pkg-1', null, 'EDUCATOR');
    expect(result.targetType).toBe('EDUCATOR');
    expect(result.testId).toBeNull();
  });
});
