/**
 * CreateAdPackageUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - durationDays < 1 → BadRequestException (INVALID_INPUT)
 * - impressions < 1 → BadRequestException (INVALID_INPUT)
 * - priceCents < 0 → BadRequestException (INVALID_INPUT)
 * - Başarı: prisma.adPackage.create çağrılır
 * - Varsayılan currency TRY
 * - Varsayılan active true
 */

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    adPackage: {
      create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'ad-pkg-1', ...data })),
    },
  },
}));

import { CreateAdPackageUseCase } from '../../../src/application/use-cases/ad/CreateAdPackageUseCase';
import { BadRequestException } from '@nestjs/common';
import { prisma } from '../../../src/infrastructure/database/prisma';

const mockPrisma = prisma as any;

const VALID_INPUT = { name: 'Premium Reklam', durationDays: 7, impressions: 1000, priceCents: 5000 };

describe('CreateAdPackageUseCase', () => {
  beforeEach(() => jest.clearAllMocks());

  it('durationDays 0 ise BadRequestException fırlatır', async () => {
    const uc = new CreateAdPackageUseCase();
    await expect(uc.execute({ ...VALID_INPUT, durationDays: 0 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('impressions 0 ise BadRequestException fırlatır', async () => {
    const uc = new CreateAdPackageUseCase();
    await expect(uc.execute({ ...VALID_INPUT, impressions: 0 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('priceCents -1 ise BadRequestException fırlatır', async () => {
    const uc = new CreateAdPackageUseCase();
    await expect(uc.execute({ ...VALID_INPUT, priceCents: -1 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('priceCents 0 kabul edilir (ücretsiz)', async () => {
    const uc = new CreateAdPackageUseCase();
    await expect(uc.execute({ ...VALID_INPUT, priceCents: 0 })).resolves.toBeDefined();
  });

  it('başarı: prisma.adPackage.create çağrılır', async () => {
    const uc = new CreateAdPackageUseCase();
    await uc.execute(VALID_INPUT);
    expect(mockPrisma.adPackage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'Premium Reklam' }) }),
    );
  });

  it('varsayılan currency TRY olarak ayarlanır', async () => {
    const uc = new CreateAdPackageUseCase();
    await uc.execute(VALID_INPUT);
    expect(mockPrisma.adPackage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ currency: 'TRY' }) }),
    );
  });

  it('varsayılan active true olarak ayarlanır', async () => {
    const uc = new CreateAdPackageUseCase();
    await uc.execute(VALID_INPUT);
    expect(mockPrisma.adPackage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ active: true }) }),
    );
  });

  it('active: false geçilirse false saklanır', async () => {
    const uc = new CreateAdPackageUseCase();
    await uc.execute({ ...VALID_INPUT, active: false });
    expect(mockPrisma.adPackage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ active: false }) }),
    );
  });
});
