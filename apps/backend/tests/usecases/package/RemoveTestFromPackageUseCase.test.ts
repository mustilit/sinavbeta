/**
 * RemoveTestFromPackageUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - Paket bulunamazsa PACKAGE_NOT_FOUND
 * - Başkasının paketinden test silme → FORBIDDEN
 * - Test bu pakette değilse TEST_NOT_IN_PACKAGE
 * - Test hiç bulunamazsa TEST_NOT_IN_PACKAGE
 * - Başarı: repo.removeTest çağrılır, { success: true } döner
 */

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    examTest: { findUnique: jest.fn() },
  },
}));

import { RemoveTestFromPackageUseCase } from '../../../src/application/use-cases/package/RemoveTestFromPackageUseCase';
import { prisma } from '../../../src/infrastructure/database/prisma';

const mockPrisma = prisma as any;

function makeRepo(pkg: any = null) {
  return {
    findById: jest.fn().mockResolvedValue(pkg),
    removeTest: jest.fn().mockResolvedValue(undefined),
  };
}

function makePackage(overrides: any = {}) {
  return { id: 'pkg-1', educatorId: 'edu-1', ...overrides };
}

describe('RemoveTestFromPackageUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.examTest.findUnique.mockResolvedValue({ id: 'test-1', packageId: 'pkg-1' });
  });

  it('paket bulunamazsa PACKAGE_NOT_FOUND fırlatır', async () => {
    const repo = makeRepo(null);
    const uc = new RemoveTestFromPackageUseCase(repo as any);
    await expect(uc.execute('no-pkg', 'edu-1', 'test-1')).rejects.toMatchObject({
      code: 'PACKAGE_NOT_FOUND',
    });
  });

  it('başkasının paketinden test silinince FORBIDDEN fırlatır', async () => {
    const repo = makeRepo(makePackage({ educatorId: 'other-edu' }));
    const uc = new RemoveTestFromPackageUseCase(repo as any);
    await expect(uc.execute('pkg-1', 'edu-1', 'test-1')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('test bu pakette değilse TEST_NOT_IN_PACKAGE fırlatır', async () => {
    mockPrisma.examTest.findUnique.mockResolvedValue({ id: 'test-1', packageId: 'other-pkg' });
    const repo = makeRepo(makePackage());
    const uc = new RemoveTestFromPackageUseCase(repo as any);
    await expect(uc.execute('pkg-1', 'edu-1', 'test-1')).rejects.toMatchObject({
      code: 'TEST_NOT_IN_PACKAGE',
    });
  });

  it('test hiç bulunamazsa TEST_NOT_IN_PACKAGE fırlatır', async () => {
    mockPrisma.examTest.findUnique.mockResolvedValue(null);
    const repo = makeRepo(makePackage());
    const uc = new RemoveTestFromPackageUseCase(repo as any);
    await expect(uc.execute('pkg-1', 'edu-1', 'test-1')).rejects.toMatchObject({
      code: 'TEST_NOT_IN_PACKAGE',
    });
  });

  it('başarı: { success: true } döner ve repo.removeTest çağrılır', async () => {
    const repo = makeRepo(makePackage());
    const uc = new RemoveTestFromPackageUseCase(repo as any);
    const result = await uc.execute('pkg-1', 'edu-1', 'test-1');
    expect(result).toEqual({ success: true });
    expect(repo.removeTest).toHaveBeenCalledWith('pkg-1', 'test-1');
  });
});
