/**
 * CreatePlatformPromoCodeUseCase testleri — Sprint 15 #3.
 *
 * Admin platform promo kodu oluşturur. Doğrulama kuralları:
 *  - code: en az 3 karakter, [A-Z0-9_-] (büyük harfe çevrilir)
 *  - percentOff: 1-100
 *  - scopes: en az 1, 'LIVE_SESSION' | 'AD_PACKAGE'
 *  - maxUses: opsiyonel, ≥ 1 ve integer
 *  - validFrom < validUntil
 *  - Aynı kod varsa DUPLICATE_CODE
 */

const mockPromoCreate = jest.fn();
const mockPromoFindUnique = jest.fn();

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    platformPromoCode: {
      create: (...args: any[]) => mockPromoCreate(...args),
      findUnique: (...args: any[]) => mockPromoFindUnique(...args),
    },
  },
}));

import { BadRequestException } from '@nestjs/common';
import { CreatePlatformPromoCodeUseCase } from '../../../src/application/use-cases/platform-promo/CreatePlatformPromoCodeUseCase';
import { AppError } from '../../../src/application/errors/AppError';

const ADMIN_ID = 'admin-1';
const BASE_INPUT = {
  code: 'LAUNCH50',
  percentOff: 50,
  scopes: ['LIVE_SESSION', 'AD_PACKAGE'] as ('LIVE_SESSION' | 'AD_PACKAGE')[],
};

function makeAuditRepo() {
  return { create: jest.fn().mockResolvedValue({}) };
}

describe('CreatePlatformPromoCodeUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPromoFindUnique.mockResolvedValue(null);
    mockPromoCreate.mockResolvedValue({
      id: 'promo-1',
      code: 'LAUNCH50',
      percentOff: 50,
      scopes: ['LIVE_SESSION', 'AD_PACKAGE'],
      maxUses: null,
      usedCount: 0,
      validFrom: null,
      validUntil: null,
      isActive: true,
      description: null,
      createdById: ADMIN_ID,
      createdAt: new Date(),
    });
  });

  it('boş kod → BadRequestException (CODE_INVALID)', async () => {
    const uc = new CreatePlatformPromoCodeUseCase();
    await expect(uc.execute(ADMIN_ID, { ...BASE_INPUT, code: '   ' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('2 karakterlik kod → BadRequestException', async () => {
    const uc = new CreatePlatformPromoCodeUseCase();
    await expect(uc.execute(ADMIN_ID, { ...BASE_INPUT, code: 'AB' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('geçersiz karakter (boşluk, !) → BadRequestException', async () => {
    const uc = new CreatePlatformPromoCodeUseCase();
    await expect(uc.execute(ADMIN_ID, { ...BASE_INPUT, code: 'A B!' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('percentOff = 0 → BadRequestException (PERCENT_INVALID)', async () => {
    const uc = new CreatePlatformPromoCodeUseCase();
    await expect(uc.execute(ADMIN_ID, { ...BASE_INPUT, percentOff: 0 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('percentOff = 101 → BadRequestException', async () => {
    const uc = new CreatePlatformPromoCodeUseCase();
    await expect(uc.execute(ADMIN_ID, { ...BASE_INPUT, percentOff: 101 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('scopes boş array → BadRequestException (SCOPES_REQUIRED)', async () => {
    const uc = new CreatePlatformPromoCodeUseCase();
    await expect(uc.execute(ADMIN_ID, { ...BASE_INPUT, scopes: [] })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('geçersiz scope değeri → BadRequestException (SCOPE_INVALID)', async () => {
    const uc = new CreatePlatformPromoCodeUseCase();
    await expect(
      uc.execute(ADMIN_ID, { ...BASE_INPUT, scopes: ['FOO' as any] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('maxUses = 0 → BadRequestException (MAX_USES_INVALID)', async () => {
    const uc = new CreatePlatformPromoCodeUseCase();
    await expect(uc.execute(ADMIN_ID, { ...BASE_INPUT, maxUses: 0 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('maxUses = 1.5 (non-integer) → BadRequestException', async () => {
    const uc = new CreatePlatformPromoCodeUseCase();
    await expect(uc.execute(ADMIN_ID, { ...BASE_INPUT, maxUses: 1.5 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('validUntil <= validFrom → BadRequestException (DATE_RANGE_INVALID)', async () => {
    const uc = new CreatePlatformPromoCodeUseCase();
    await expect(
      uc.execute(ADMIN_ID, {
        ...BASE_INPUT,
        validFrom: new Date('2026-06-01'),
        validUntil: new Date('2026-05-01'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('aynı kod zaten var → AppError DUPLICATE_CODE (409)', async () => {
    mockPromoFindUnique.mockResolvedValue({ id: 'existing', code: 'LAUNCH50' });
    const uc = new CreatePlatformPromoCodeUseCase();
    await expect(uc.execute(ADMIN_ID, BASE_INPUT)).rejects.toMatchObject({
      code: 'DUPLICATE_CODE',
      status:409,
    });
  });

  it('başarı: kod büyük harfe çevrilir, create çağrılır', async () => {
    const uc = new CreatePlatformPromoCodeUseCase();
    await uc.execute(ADMIN_ID, { ...BASE_INPUT, code: 'launch50' });
    expect(mockPromoCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ code: 'LAUNCH50', createdById: ADMIN_ID }),
      }),
    );
  });

  it('başarı: audit log yazılır', async () => {
    const auditRepo = makeAuditRepo();
    const uc = new CreatePlatformPromoCodeUseCase(auditRepo as any);
    await uc.execute(ADMIN_ID, BASE_INPUT);
    expect(auditRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'PlatformPromoCode',
        actorId: ADMIN_ID,
      }),
    );
  });

  it('audit log hatası ana akışı kesmez', async () => {
    const auditRepo = { create: jest.fn().mockRejectedValue(new Error('AUDIT_FAIL')) };
    const uc = new CreatePlatformPromoCodeUseCase(auditRepo as any);
    await expect(uc.execute(ADMIN_ID, BASE_INPUT)).resolves.toBeDefined();
  });

  it('auditRepo verilmezse hata atmaz (opsiyonel)', async () => {
    const uc = new CreatePlatformPromoCodeUseCase();
    await expect(uc.execute(ADMIN_ID, BASE_INPUT)).resolves.toBeDefined();
  });
});
