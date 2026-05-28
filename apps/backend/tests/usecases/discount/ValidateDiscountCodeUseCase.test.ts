/**
 * ValidateDiscountCodeUseCase testleri — Sprint 15 #2.
 *
 * Bu use case aday paket satın almadan ÖNCE kodun geçerliliğini kontrol eder.
 * usedCount artırma asıl `PurchaseUseCase` içinde transaction altında yapılır
 * (race-safe `updateMany ... lt: maxUses`). Burada test edilen davranışlar:
 *
 * - boş kod / packageId / basePriceCents → DISCOUNT_NOT_FOUND (400)
 * - paket bulunamadı veya yayımlanmamış → PACKAGE_NOT_FOUND (404)
 * - kod bulunamadı → DISCOUNT_NOT_FOUND (404)
 * - isActive=false → DISCOUNT_NOT_ACTIVE (409)
 * - createdById !== package.educatorId → DISCOUNT_NOT_OWNED (409)
 * - validFrom > now → DISCOUNT_OUT_OF_WINDOW
 * - validUntil < now → DISCOUNT_OUT_OF_WINDOW
 * - usedCount >= maxUses → DISCOUNT_USAGE_EXHAUSTED
 * - başarı: percentOff %50 üst sınırı, doğru hesap
 */

const mockTestPackageFindUnique = jest.fn();
const mockDiscountCodeFindUnique = jest.fn();

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    testPackage: { findUnique: (...args: any[]) => mockTestPackageFindUnique(...args) },
    discountCode: { findUnique: (...args: any[]) => mockDiscountCodeFindUnique(...args) },
  },
}));

import { ValidateDiscountCodeUseCase } from '../../../src/application/use-cases/discount/ValidateDiscountCodeUseCase';

const EDUCATOR_ID = 'edu-1';
const PACKAGE_ID = 'pkg-1';
const BASE_INPUT = { code: 'SAVE20', packageId: PACKAGE_ID, basePriceCents: 10000 };

function makePackage(overrides: Record<string, any> = {}) {
  return {
    id: PACKAGE_ID,
    educatorId: EDUCATOR_ID,
    publishedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeDiscount(overrides: Record<string, any> = {}) {
  return {
    code: 'SAVE20',
    description: '20% indirim',
    percentOff: 20,
    maxUses: 100,
    usedCount: 0,
    validFrom: null,
    validUntil: null,
    isActive: true,
    createdById: EDUCATOR_ID,
    ...overrides,
  };
}

describe('ValidateDiscountCodeUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTestPackageFindUnique.mockResolvedValue(makePackage());
    mockDiscountCodeFindUnique.mockResolvedValue(makeDiscount());
  });

  it('boş kod → DISCOUNT_NOT_FOUND (400)', async () => {
    const uc = new ValidateDiscountCodeUseCase();
    await expect(uc.execute({ ...BASE_INPUT, code: '   ' })).rejects.toMatchObject({
      code: 'DISCOUNT_NOT_FOUND',
      status:400,
    });
  });

  it('boş packageId → DISCOUNT_NOT_FOUND (400)', async () => {
    const uc = new ValidateDiscountCodeUseCase();
    await expect(uc.execute({ ...BASE_INPUT, packageId: '' })).rejects.toMatchObject({
      code: 'DISCOUNT_NOT_FOUND',
    });
  });

  it('basePriceCents null → DISCOUNT_NOT_FOUND (400)', async () => {
    const uc = new ValidateDiscountCodeUseCase();
    await expect(
      uc.execute({ ...BASE_INPUT, basePriceCents: null as any }),
    ).rejects.toMatchObject({ code: 'DISCOUNT_NOT_FOUND' });
  });

  it('paket bulunamadı → PACKAGE_NOT_FOUND (404)', async () => {
    mockTestPackageFindUnique.mockResolvedValue(null);
    const uc = new ValidateDiscountCodeUseCase();
    await expect(uc.execute(BASE_INPUT)).rejects.toMatchObject({
      code: 'PACKAGE_NOT_FOUND',
      status:404,
    });
  });

  it('yayımlanmamış paket (publishedAt null) → PACKAGE_NOT_FOUND', async () => {
    mockTestPackageFindUnique.mockResolvedValue(makePackage({ publishedAt: null }));
    const uc = new ValidateDiscountCodeUseCase();
    await expect(uc.execute(BASE_INPUT)).rejects.toMatchObject({
      code: 'PACKAGE_NOT_FOUND',
    });
  });

  it('kod bulunamadı → DISCOUNT_NOT_FOUND (404)', async () => {
    mockDiscountCodeFindUnique.mockResolvedValue(null);
    const uc = new ValidateDiscountCodeUseCase();
    await expect(uc.execute(BASE_INPUT)).rejects.toMatchObject({
      code: 'DISCOUNT_NOT_FOUND',
      status:404,
    });
  });

  it('kod pasif (isActive=false) → DISCOUNT_NOT_ACTIVE (409)', async () => {
    mockDiscountCodeFindUnique.mockResolvedValue(makeDiscount({ isActive: false }));
    const uc = new ValidateDiscountCodeUseCase();
    await expect(uc.execute(BASE_INPUT)).rejects.toMatchObject({
      code: 'DISCOUNT_NOT_ACTIVE',
      status:409,
    });
  });

  it('createdById eşleşmiyor (kod başka eğiticinin) → DISCOUNT_NOT_OWNED', async () => {
    mockDiscountCodeFindUnique.mockResolvedValue(makeDiscount({ createdById: 'edu-other' }));
    const uc = new ValidateDiscountCodeUseCase();
    await expect(uc.execute(BASE_INPUT)).rejects.toMatchObject({
      code: 'DISCOUNT_NOT_OWNED',
      status:409,
    });
  });

  it('createdById null → DISCOUNT_NOT_OWNED (legacy kod, sahipsiz)', async () => {
    mockDiscountCodeFindUnique.mockResolvedValue(makeDiscount({ createdById: null }));
    const uc = new ValidateDiscountCodeUseCase();
    await expect(uc.execute(BASE_INPUT)).rejects.toMatchObject({
      code: 'DISCOUNT_NOT_OWNED',
    });
  });

  it('validFrom gelecekte → DISCOUNT_OUT_OF_WINDOW', async () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    mockDiscountCodeFindUnique.mockResolvedValue(makeDiscount({ validFrom: future }));
    const uc = new ValidateDiscountCodeUseCase();
    await expect(uc.execute(BASE_INPUT)).rejects.toMatchObject({
      code: 'DISCOUNT_OUT_OF_WINDOW',
    });
  });

  it('validUntil geçmişte → DISCOUNT_OUT_OF_WINDOW', async () => {
    const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    mockDiscountCodeFindUnique.mockResolvedValue(makeDiscount({ validUntil: past }));
    const uc = new ValidateDiscountCodeUseCase();
    await expect(uc.execute(BASE_INPUT)).rejects.toMatchObject({
      code: 'DISCOUNT_OUT_OF_WINDOW',
    });
  });

  it('usedCount >= maxUses → DISCOUNT_USAGE_EXHAUSTED', async () => {
    mockDiscountCodeFindUnique.mockResolvedValue(
      makeDiscount({ maxUses: 5, usedCount: 5 }),
    );
    const uc = new ValidateDiscountCodeUseCase();
    await expect(uc.execute(BASE_INPUT)).rejects.toMatchObject({
      code: 'DISCOUNT_USAGE_EXHAUSTED',
    });
  });

  it('maxUses null (sınırsız) ise usedCount kontrolü yapılmaz', async () => {
    mockDiscountCodeFindUnique.mockResolvedValue(
      makeDiscount({ maxUses: null, usedCount: 999 }),
    );
    const uc = new ValidateDiscountCodeUseCase();
    await expect(uc.execute(BASE_INPUT)).resolves.toBeDefined();
  });

  it('başarı: 20% indirim, doğru hesap', async () => {
    const uc = new ValidateDiscountCodeUseCase();
    const result = await uc.execute({ ...BASE_INPUT, basePriceCents: 10000 });
    expect(result).toEqual({
      code: 'SAVE20',
      percentOff: 20,
      discountCents: 2000,
      finalAmountCents: 8000,
      description: '20% indirim',
    });
  });

  it('başarı: percentOff %50 üst sınırına çekilir (DB %70 olsa bile)', async () => {
    mockDiscountCodeFindUnique.mockResolvedValue(makeDiscount({ percentOff: 70 }));
    const uc = new ValidateDiscountCodeUseCase();
    const result = await uc.execute({ ...BASE_INPUT, basePriceCents: 10000 });
    // %50 max → 5000 indirim, 5000 nihai
    expect(result.percentOff).toBe(50);
    expect(result.discountCents).toBe(5000);
    expect(result.finalAmountCents).toBe(5000);
  });

  it('başarı: küçük harfle girilen kod büyük harfe çevrilir', async () => {
    const uc = new ValidateDiscountCodeUseCase();
    await uc.execute({ ...BASE_INPUT, code: 'save20' });
    expect(mockDiscountCodeFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { code: 'SAVE20' } }),
    );
  });

  it('başarı: finalAmountCents negatife düşmez (clamp 0)', async () => {
    mockDiscountCodeFindUnique.mockResolvedValue(makeDiscount({ percentOff: 50 }));
    const uc = new ValidateDiscountCodeUseCase();
    const result = await uc.execute({ ...BASE_INPUT, basePriceCents: 1 });
    // floor((1 * 50) / 100) = 0 → finalAmount = 1
    expect(result.finalAmountCents).toBeGreaterThanOrEqual(0);
  });
});
