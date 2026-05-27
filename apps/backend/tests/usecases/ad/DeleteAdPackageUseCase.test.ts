/**
 * DeleteAdPackageUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - Paket bulunamazsa NOT_FOUND BadRequestException
 * - Başarı: prisma.adPackage.delete çağrılır
 */

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    adPackage: {
      findUnique: jest.fn(),
      delete: jest.fn().mockResolvedValue({ id: 'ad-pkg-1' }),
    },
  },
}));

import { DeleteAdPackageUseCase } from '../../../src/application/use-cases/ad/DeleteAdPackageUseCase';
import { BadRequestException } from '@nestjs/common';
import { prisma } from '../../../src/infrastructure/database/prisma';

const mockPrisma = prisma as any;

describe('DeleteAdPackageUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.adPackage.findUnique.mockResolvedValue({ id: 'ad-pkg-1', name: 'Paket' });
    mockPrisma.adPackage.delete.mockResolvedValue({ id: 'ad-pkg-1' });
  });

  it('reklam paketi bulunamazsa BadRequestException fırlatır', async () => {
    mockPrisma.adPackage.findUnique.mockResolvedValue(null);
    const uc = new DeleteAdPackageUseCase();
    await expect(uc.execute('bad-id')).rejects.toBeInstanceOf(BadRequestException);
    expect(mockPrisma.adPackage.delete).not.toHaveBeenCalled();
  });

  it('başarı: prisma.adPackage.delete çağrılır', async () => {
    const uc = new DeleteAdPackageUseCase();
    await uc.execute('ad-pkg-1');
    expect(mockPrisma.adPackage.delete).toHaveBeenCalledWith({ where: { id: 'ad-pkg-1' } });
  });

  it('silinen paketin id döner', async () => {
    const uc = new DeleteAdPackageUseCase();
    const result = await uc.execute('ad-pkg-1');
    expect((result as any).id).toBe('ad-pkg-1');
  });
});
