// @ts-nocheck
import { CreateTestPackageUseCase } from '../../src/application/use-cases/package/CreateTestPackageUseCase';

jest.mock('../../src/infrastructure/database/prisma', () => ({
  prisma: {
    adminSettings: { findFirst: jest.fn(async () => ({ packageCreationEnabled: true })) },
    user: { findUnique: jest.fn(async () => ({ tenantId: 'tenant-1' })) },
    $queryRaw: jest.fn(async () => [{ minPackagePriceCents: 100 }]),
  },
}));
import { prisma } from '../../src/infrastructure/database/prisma';

function makeRepo(created: any = null) {
  return { create: jest.fn(async (data: any) => created ?? { id: 'pkg-1', ...data }) };
}

describe('CreateTestPackageUseCase', () => {
  beforeEach(() => jest.clearAllMocks());

  it('paket oluşturur ve varsayılan difficulty medium olur', async () => {
    const repo = makeRepo();
    const uc = new CreateTestPackageUseCase(repo as any);
    await uc.execute('edu-1', { title: 'KPSS Paketi', priceCents: 500 });
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ difficulty: 'medium', title: 'KPSS Paketi' }));
  });

  it('packageCreationEnabled=false ise PACKAGE_CREATION_DISABLED fırlatır', async () => {
    (prisma.adminSettings.findFirst as jest.Mock).mockResolvedValueOnce({ packageCreationEnabled: false });
    const uc = new CreateTestPackageUseCase(makeRepo() as any);
    await expect(uc.execute('edu-1', { title: 'Test', priceCents: 500 })).rejects.toMatchObject({ code: 'PACKAGE_CREATION_DISABLED' });
  });

  it('adminSettings null ise kill-switch devreye girmez', async () => {
    (prisma.adminSettings.findFirst as jest.Mock).mockResolvedValueOnce(null);
    const repo = makeRepo();
    const uc = new CreateTestPackageUseCase(repo as any);
    await expect(uc.execute('edu-1', { title: 'Test', priceCents: 500 })).resolves.toBeDefined();
  });

  it('boş başlık → INVALID_TITLE fırlatır', async () => {
    const uc = new CreateTestPackageUseCase(makeRepo() as any);
    await expect(uc.execute('edu-1', { title: '   ', priceCents: 500 })).rejects.toMatchObject({ code: 'INVALID_TITLE' });
  });

  it('fiyat minPriceCents altındaysa PRICE_TOO_LOW fırlatır', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([{ minPackagePriceCents: 500 }]);
    const uc = new CreateTestPackageUseCase(makeRepo() as any);
    await expect(uc.execute('edu-1', { title: 'Ucuz Paket', priceCents: 100 })).rejects.toMatchObject({ code: 'PRICE_TOO_LOW' });
  });

  it('geçerli difficulty değeri saklanır', async () => {
    const repo = makeRepo();
    const uc = new CreateTestPackageUseCase(repo as any);
    await uc.execute('edu-1', { title: 'Paket', priceCents: 500, difficulty: 'hard' });
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ difficulty: 'hard' }));
  });

  it('geçersiz difficulty → medium fallback', async () => {
    const repo = makeRepo();
    const uc = new CreateTestPackageUseCase(repo as any);
    await uc.execute('edu-1', { title: 'Paket', priceCents: 500, difficulty: 'expert' });
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ difficulty: 'medium' }));
  });
});
