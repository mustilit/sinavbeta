/**
 * UpdateAdPackageUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - Paket bulunamazsa NOT_FOUND BadRequestException
 * - durationDays < 1 → INVALID_INPUT
 * - impressions < 1 → INVALID_INPUT
 * - priceCents < 0 → INVALID_INPUT
 * - Başarı: sadece verilen alanlar güncellenir
 * - active false yapılabilir
 */

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    adPackage: {
      findUnique: jest.fn(),
      update: jest.fn().mockImplementation(async ({ where, data }: any) => ({ id: where.id, ...data })),
    },
  },
}));

import { UpdateAdPackageUseCase } from '../../../src/application/use-cases/ad/UpdateAdPackageUseCase';
import { BadRequestException } from '@nestjs/common';
import { prisma } from '../../../src/infrastructure/database/prisma';

const mockPrisma = prisma as any;

function makeAdPackage(overrides: any = {}) {
  return { id: 'ad-pkg-1', name: 'Mevcut Paket', durationDays: 7, impressions: 1000, priceCents: 5000, active: true, ...overrides };
}

describe('UpdateAdPackageUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.adPackage.findUnique.mockResolvedValue(makeAdPackage());
  });

  it('reklam paketi bulunamazsa NOT_FOUND fırlatır', async () => {
    mockPrisma.adPackage.findUnique.mockResolvedValue(null);
    const uc = new UpdateAdPackageUseCase();
    await expect(uc.execute('bad-id', { name: 'Yeni' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('durationDays 0 ise INVALID_INPUT fırlatır', async () => {
    const uc = new UpdateAdPackageUseCase();
    await expect(uc.execute('ad-pkg-1', { durationDays: 0 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('impressions 0 ise INVALID_INPUT fırlatır', async () => {
    const uc = new UpdateAdPackageUseCase();
    await expect(uc.execute('ad-pkg-1', { impressions: 0 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('priceCents negatif ise INVALID_INPUT fırlatır', async () => {
    const uc = new UpdateAdPackageUseCase();
    await expect(uc.execute('ad-pkg-1', { priceCents: -100 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('başarı: prisma.adPackage.update çağrılır', async () => {
    const uc = new UpdateAdPackageUseCase();
    await uc.execute('ad-pkg-1', { name: 'Güncel Paket' });
    expect(mockPrisma.adPackage.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'ad-pkg-1' }, data: expect.objectContaining({ name: 'Güncel Paket' }) }),
    );
  });

  it('active false yapılabilir', async () => {
    const uc = new UpdateAdPackageUseCase();
    await uc.execute('ad-pkg-1', { active: false });
    expect(mockPrisma.adPackage.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ active: false }) }),
    );
  });

  it('priceCents 0 kabul edilir', async () => {
    const uc = new UpdateAdPackageUseCase();
    await expect(uc.execute('ad-pkg-1', { priceCents: 0 })).resolves.toBeDefined();
  });
});
