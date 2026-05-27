/**
 * ListAdPackagesUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - activeOnly=true (default): yalnızca aktif paketler döner
 * - activeOnly=false: tüm paketler döner
 * - Paket yoksa boş dizi döner
 */

const mockAdPackageFindMany = jest.fn();

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    adPackage: { findMany: (...args: any[]) => mockAdPackageFindMany(...args) },
  },
}));

import { ListAdPackagesUseCase } from '../../../src/application/use-cases/ad/ListAdPackagesUseCase';

function makeAdPackage(overrides: Record<string, any> = {}) {
  return {
    id: 'ap-1',
    name: 'Standart Reklam',
    active: true,
    priceCents: 9900,
    impressions: 1000,
    ...overrides,
  };
}

describe('ListAdPackagesUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAdPackageFindMany.mockResolvedValue([makeAdPackage()]);
  });

  it('activeOnly=true (default) → where: { active: true } ile sorgu yapılır', async () => {
    const uc = new ListAdPackagesUseCase();
    await uc.execute();
    expect(mockAdPackageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { active: true } }),
    );
  });

  it('activeOnly=false → boş where ile sorgu yapılır', async () => {
    const uc = new ListAdPackagesUseCase();
    await uc.execute(false);
    expect(mockAdPackageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });

  it('paket yoksa boş dizi döner', async () => {
    mockAdPackageFindMany.mockResolvedValue([]);
    const uc = new ListAdPackagesUseCase();
    const result = await uc.execute();
    expect(result).toEqual([]);
  });

  it('aktif paketler döner', async () => {
    const packages = [makeAdPackage(), makeAdPackage({ id: 'ap-2', name: 'Premium' })];
    mockAdPackageFindMany.mockResolvedValue(packages);
    const uc = new ListAdPackagesUseCase();
    const result = await uc.execute();
    expect(result).toHaveLength(2);
  });

  it('fiyata göre asc sıralanır', async () => {
    const uc = new ListAdPackagesUseCase();
    await uc.execute();
    expect(mockAdPackageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { priceCents: 'asc' } }),
    );
  });
});
