/**
 * UnpublishTestPackageUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - Paket bulunamazsa PACKAGE_NOT_FOUND
 * - Başkasının paketini yayından kaldırma → FORBIDDEN
 * - Zaten yayında değilse NOT_PUBLISHED
 * - Başarı: repo.unpublish çağrılır
 */

import { UnpublishTestPackageUseCase } from '../../../src/application/use-cases/package/UnpublishTestPackageUseCase';

function makeRepo(pkg: any = null) {
  return {
    findById: jest.fn().mockResolvedValue(pkg),
    unpublish: jest.fn().mockImplementation(async (id: string) => ({ id, publishedAt: null })),
  };
}

function makePackage(overrides: any = {}) {
  return {
    id: 'pkg-1',
    educatorId: 'edu-1',
    publishedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

describe('UnpublishTestPackageUseCase', () => {
  it('paket bulunamazsa PACKAGE_NOT_FOUND fırlatır', async () => {
    const repo = makeRepo(null);
    const uc = new UnpublishTestPackageUseCase(repo as any);
    await expect(uc.execute('no-pkg', 'edu-1')).rejects.toMatchObject({ code: 'PACKAGE_NOT_FOUND' });
  });

  it('başkasının paketini yayından kaldırınca FORBIDDEN fırlatır', async () => {
    const repo = makeRepo(makePackage({ educatorId: 'other-edu' }));
    const uc = new UnpublishTestPackageUseCase(repo as any);
    await expect(uc.execute('pkg-1', 'edu-1')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('paket zaten yayında değilse NOT_PUBLISHED fırlatır', async () => {
    const repo = makeRepo(makePackage({ publishedAt: null }));
    const uc = new UnpublishTestPackageUseCase(repo as any);
    await expect(uc.execute('pkg-1', 'edu-1')).rejects.toMatchObject({ code: 'NOT_PUBLISHED' });
  });

  it('yayınlanmış paketi başarıyla yayından kaldırır', async () => {
    const repo = makeRepo(makePackage());
    const uc = new UnpublishTestPackageUseCase(repo as any);
    await uc.execute('pkg-1', 'edu-1');
    expect(repo.unpublish).toHaveBeenCalledWith('pkg-1');
  });

  it('yayından kaldırılan paketin publishedAt null döner', async () => {
    const repo = makeRepo(makePackage());
    const uc = new UnpublishTestPackageUseCase(repo as any);
    const result = await uc.execute('pkg-1', 'edu-1');
    expect((result as any).publishedAt).toBeNull();
  });
});
