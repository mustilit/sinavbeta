/**
 * ValidatePlatformPromoCodeUseCase testleri — Sprint 15 #3.
 *
 * Eğitici LiveSession / AdPackage satın almadan ÖNCE admin-issued platform
 * promo kodunu doğrular. Bu use case sadece kontrol yapar; usedCount artırma
 * PayLiveSessionUseCase / PurchaseAdUseCase'in transaction'ı içinde olur.
 *
 * Hata kodları:
 *   PROMO_NOT_FOUND, PROMO_NOT_ACTIVE, PROMO_SCOPE_MISMATCH,
 *   PROMO_OUT_OF_WINDOW, PROMO_USAGE_EXHAUSTED
 */

const mockPromoFindUnique = jest.fn();

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    platformPromoCode: { findUnique: (...args: any[]) => mockPromoFindUnique(...args) },
  },
}));

import { ValidatePlatformPromoCodeUseCase } from '../../../src/application/use-cases/platform-promo/ValidatePlatformPromoCodeUseCase';

const BASE_INPUT = {
  code: 'LAUNCH50',
  scope: 'LIVE_SESSION' as const,
  basePriceCents: 10000,
};

function makePromo(overrides: Record<string, any> = {}) {
  return {
    id: 'promo-1',
    code: 'LAUNCH50',
    description: 'Lansman indirimi',
    percentOff: 50,
    scopes: ['LIVE_SESSION', 'AD_PACKAGE'],
    maxUses: 100,
    usedCount: 0,
    validFrom: null,
    validUntil: null,
    isActive: true,
    ...overrides,
  };
}

describe('ValidatePlatformPromoCodeUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPromoFindUnique.mockResolvedValue(makePromo());
  });

  it('boş kod → PROMO_NOT_FOUND (400)', async () => {
    const uc = new ValidatePlatformPromoCodeUseCase();
    await expect(uc.execute({ ...BASE_INPUT, code: '   ' })).rejects.toMatchObject({
      code: 'PROMO_NOT_FOUND',
      status:400,
    });
  });

  it('basePriceCents null → PROMO_NOT_FOUND (400)', async () => {
    const uc = new ValidatePlatformPromoCodeUseCase();
    await expect(
      uc.execute({ ...BASE_INPUT, basePriceCents: null as any }),
    ).rejects.toMatchObject({ code: 'PROMO_NOT_FOUND' });
  });

  it('kod bulunamadı → PROMO_NOT_FOUND (404)', async () => {
    mockPromoFindUnique.mockResolvedValue(null);
    const uc = new ValidatePlatformPromoCodeUseCase();
    await expect(uc.execute(BASE_INPUT)).rejects.toMatchObject({
      code: 'PROMO_NOT_FOUND',
      status:404,
    });
  });

  it('isActive=false → PROMO_NOT_ACTIVE (409)', async () => {
    mockPromoFindUnique.mockResolvedValue(makePromo({ isActive: false }));
    const uc = new ValidatePlatformPromoCodeUseCase();
    await expect(uc.execute(BASE_INPUT)).rejects.toMatchObject({
      code: 'PROMO_NOT_ACTIVE',
      status:409,
    });
  });

  it('LIVE_SESSION kod AD_PACKAGE scope ile çağrılır → PROMO_SCOPE_MISMATCH', async () => {
    mockPromoFindUnique.mockResolvedValue(makePromo({ scopes: ['LIVE_SESSION'] }));
    const uc = new ValidatePlatformPromoCodeUseCase();
    await expect(
      uc.execute({ ...BASE_INPUT, scope: 'AD_PACKAGE' as any }),
    ).rejects.toMatchObject({
      code: 'PROMO_SCOPE_MISMATCH',
      status:409,
    });
  });

  it('validFrom gelecekte → PROMO_OUT_OF_WINDOW', async () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    mockPromoFindUnique.mockResolvedValue(makePromo({ validFrom: future }));
    const uc = new ValidatePlatformPromoCodeUseCase();
    await expect(uc.execute(BASE_INPUT)).rejects.toMatchObject({
      code: 'PROMO_OUT_OF_WINDOW',
    });
  });

  it('validUntil geçmişte → PROMO_OUT_OF_WINDOW', async () => {
    const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    mockPromoFindUnique.mockResolvedValue(makePromo({ validUntil: past }));
    const uc = new ValidatePlatformPromoCodeUseCase();
    await expect(uc.execute(BASE_INPUT)).rejects.toMatchObject({
      code: 'PROMO_OUT_OF_WINDOW',
    });
  });

  it('maxUses tükendi → PROMO_USAGE_EXHAUSTED', async () => {
    mockPromoFindUnique.mockResolvedValue(makePromo({ maxUses: 5, usedCount: 5 }));
    const uc = new ValidatePlatformPromoCodeUseCase();
    await expect(uc.execute(BASE_INPUT)).rejects.toMatchObject({
      code: 'PROMO_USAGE_EXHAUSTED',
    });
  });

  it('maxUses null (sınırsız) ise usedCount kontrolü yapılmaz', async () => {
    mockPromoFindUnique.mockResolvedValue(
      makePromo({ maxUses: null, usedCount: 9999 }),
    );
    const uc = new ValidatePlatformPromoCodeUseCase();
    await expect(uc.execute(BASE_INPUT)).resolves.toBeDefined();
  });

  it('başarı: 50% indirim doğru hesaplanır', async () => {
    const uc = new ValidatePlatformPromoCodeUseCase();
    const result = await uc.execute({ ...BASE_INPUT, basePriceCents: 10000 });
    expect(result).toEqual({
      id: 'promo-1',
      code: 'LAUNCH50',
      percentOff: 50,
      discountCents: 5000,
      finalAmountCents: 5000,
      description: 'Lansman indirimi',
    });
  });

  it('başarı: 100% indirim → finalAmount 0', async () => {
    mockPromoFindUnique.mockResolvedValue(makePromo({ percentOff: 100 }));
    const uc = new ValidatePlatformPromoCodeUseCase();
    const result = await uc.execute({ ...BASE_INPUT, basePriceCents: 10000 });
    expect(result.discountCents).toBe(10000);
    expect(result.finalAmountCents).toBe(0);
  });

  it('başarı: küçük harfle girilen kod büyük harfe çevrilir', async () => {
    const uc = new ValidatePlatformPromoCodeUseCase();
    await uc.execute({ ...BASE_INPUT, code: 'launch50' });
    expect(mockPromoFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { code: 'LAUNCH50' } }),
    );
  });

  it('AD_PACKAGE scope ile valid promo → başarı', async () => {
    const uc = new ValidatePlatformPromoCodeUseCase();
    const result = await uc.execute({ ...BASE_INPUT, scope: 'AD_PACKAGE' as any });
    expect(result.code).toBe('LAUNCH50');
  });
});
