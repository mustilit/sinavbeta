// @ts-nocheck
import { PublishTestPackageUseCase } from '../../src/application/use-cases/package/PublishTestPackageUseCase';

jest.mock('../../src/infrastructure/database/prisma', () => ({
  prisma: {
    adminSettings: { findFirst: jest.fn(async () => ({ testPublishingEnabled: true })) },
  },
}));
import { prisma } from '../../src/infrastructure/database/prisma';

function makeRepo(pkg: any = null) {
  return {
    findByIdWithTests: jest.fn(async () => pkg),
    publish: jest.fn(async (id: string) => ({ id, publishedAt: new Date() })),
  };
}
function makePackage(o: any = {}) {
  return {
    id: 'pkg-1',
    educatorId: 'edu-1',
    publishedAt: null,
    priceCents: 1000,
    tests: [{ id: 'test-1' }],
    ...o,
  };
}

describe('PublishTestPackageUseCase', () => {
  beforeEach(() => jest.clearAllMocks());

  it('paketi yayınlar', async () => {
    const repo = makeRepo(makePackage());
    const uc = new PublishTestPackageUseCase(repo as any);
    const result = await uc.execute('pkg-1', 'edu-1');
    expect(result.publishedAt).toBeDefined();
    expect(repo.publish).toHaveBeenCalledWith('pkg-1');
  });

  it('testPublishingEnabled=false ise PUBLISHING_DISABLED fırlatır', async () => {
    (prisma.adminSettings.findFirst as jest.Mock).mockResolvedValueOnce({ testPublishingEnabled: false });
    const uc = new PublishTestPackageUseCase(makeRepo(makePackage()) as any);
    await expect(uc.execute('pkg-1', 'edu-1')).rejects.toMatchObject({ code: 'PUBLISHING_DISABLED' });
  });

  it('paket bulunamazsa PACKAGE_NOT_FOUND fırlatır', async () => {
    const uc = new PublishTestPackageUseCase(makeRepo(null) as any);
    await expect(uc.execute('bad-pkg', 'edu-1')).rejects.toMatchObject({ code: 'PACKAGE_NOT_FOUND' });
  });

  it('başkasının paketini yayınlamaya çalışırsa FORBIDDEN fırlatır', async () => {
    const uc = new PublishTestPackageUseCase(makeRepo(makePackage({ educatorId: 'other-edu' })) as any);
    await expect(uc.execute('pkg-1', 'edu-1')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('zaten yayınlanmışsa ALREADY_PUBLISHED fırlatır', async () => {
    const uc = new PublishTestPackageUseCase(makeRepo(makePackage({ publishedAt: new Date() })) as any);
    await expect(uc.execute('pkg-1', 'edu-1')).rejects.toMatchObject({ code: 'ALREADY_PUBLISHED' });
  });

  it('test yoksa PACKAGE_EMPTY fırlatır', async () => {
    const uc = new PublishTestPackageUseCase(makeRepo(makePackage({ tests: [] })) as any);
    await expect(uc.execute('pkg-1', 'edu-1')).rejects.toMatchObject({ code: 'PACKAGE_EMPTY' });
  });

  it('fiyat 0 ise INVALID_PRICE fırlatır', async () => {
    const uc = new PublishTestPackageUseCase(makeRepo(makePackage({ priceCents: 0 })) as any);
    await expect(uc.execute('pkg-1', 'edu-1')).rejects.toMatchObject({ code: 'INVALID_PRICE' });
  });
});
