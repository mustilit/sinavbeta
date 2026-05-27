/**
 * AddTestToPackageUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - Paket bulunamazsa PACKAGE_NOT_FOUND
 * - Başkasının paketine test ekleme → FORBIDDEN
 * - Test bulunamazsa TEST_NOT_FOUND
 * - Test başka eğiticiye ait ise FORBIDDEN
 * - Test zaten başka pakette ise TEST_ALREADY_IN_PACKAGE
 * - Test zaten bu pakette ise TEST_ALREADY_IN_PACKAGE
 * - maxTestsPerPackage aşılırsa PACKAGE_FULL
 * - Başarı: repo.addTest çağrılır
 */

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    examTest: { findUnique: jest.fn() },
    adminSettings: { findFirst: jest.fn().mockResolvedValue({ maxTestsPerPackage: 10 }) },
  },
}));

import { AddTestToPackageUseCase } from '../../../src/application/use-cases/package/AddTestToPackageUseCase';
import { prisma } from '../../../src/infrastructure/database/prisma';

const mockPrisma = prisma as any;

function makeRepo(pkg: any = null) {
  return {
    findByIdWithTests: jest.fn().mockResolvedValue(pkg),
    addTest: jest.fn().mockResolvedValue(undefined),
  };
}

function makePackage(overrides: any = {}) {
  return {
    id: 'pkg-1',
    educatorId: 'edu-1',
    tests: [],
    ...overrides,
  };
}

function makeTest(overrides: any = {}) {
  return {
    id: 'test-1',
    educatorId: 'edu-1',
    packageId: null,
    ...overrides,
  };
}

describe('AddTestToPackageUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.adminSettings.findFirst.mockResolvedValue({ maxTestsPerPackage: 10 });
    mockPrisma.examTest.findUnique.mockResolvedValue(makeTest());
  });

  it('paket bulunamazsa PACKAGE_NOT_FOUND fırlatır', async () => {
    const repo = makeRepo(null);
    const uc = new AddTestToPackageUseCase(repo as any);
    await expect(uc.execute('no-pkg', 'edu-1', 'test-1')).rejects.toMatchObject({
      code: 'PACKAGE_NOT_FOUND',
    });
  });

  it('başkasının paketine test ekleyince FORBIDDEN fırlatır', async () => {
    const repo = makeRepo(makePackage({ educatorId: 'other-edu' }));
    const uc = new AddTestToPackageUseCase(repo as any);
    await expect(uc.execute('pkg-1', 'edu-1', 'test-1')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('test bulunamazsa TEST_NOT_FOUND fırlatır', async () => {
    mockPrisma.examTest.findUnique.mockResolvedValue(null);
    const repo = makeRepo(makePackage());
    const uc = new AddTestToPackageUseCase(repo as any);
    await expect(uc.execute('pkg-1', 'edu-1', 'test-x')).rejects.toMatchObject({ code: 'TEST_NOT_FOUND' });
  });

  it('test başka eğiticiye aitse FORBIDDEN fırlatır', async () => {
    mockPrisma.examTest.findUnique.mockResolvedValue(makeTest({ educatorId: 'other-edu' }));
    const repo = makeRepo(makePackage());
    const uc = new AddTestToPackageUseCase(repo as any);
    await expect(uc.execute('pkg-1', 'edu-1', 'test-1')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('test zaten başka pakette ise TEST_ALREADY_IN_PACKAGE fırlatır', async () => {
    mockPrisma.examTest.findUnique.mockResolvedValue(makeTest({ packageId: 'other-pkg' }));
    const repo = makeRepo(makePackage());
    const uc = new AddTestToPackageUseCase(repo as any);
    await expect(uc.execute('pkg-1', 'edu-1', 'test-1')).rejects.toMatchObject({
      code: 'TEST_ALREADY_IN_PACKAGE',
    });
  });

  it('test zaten bu pakette ise TEST_ALREADY_IN_PACKAGE fırlatır', async () => {
    mockPrisma.examTest.findUnique.mockResolvedValue(makeTest({ packageId: 'pkg-1' }));
    const repo = makeRepo(makePackage());
    const uc = new AddTestToPackageUseCase(repo as any);
    await expect(uc.execute('pkg-1', 'edu-1', 'test-1')).rejects.toMatchObject({
      code: 'TEST_ALREADY_IN_PACKAGE',
    });
  });

  it('maxTestsPerPackage dolmuşsa PACKAGE_FULL fırlatır', async () => {
    mockPrisma.adminSettings.findFirst.mockResolvedValue({ maxTestsPerPackage: 2 });
    const pkg = makePackage({ tests: [{ id: 't1' }, { id: 't2' }] });
    const repo = makeRepo(pkg);
    const uc = new AddTestToPackageUseCase(repo as any);
    await expect(uc.execute('pkg-1', 'edu-1', 'test-1')).rejects.toMatchObject({ code: 'PACKAGE_FULL' });
  });

  it('başarı: repo.addTest çağrılır', async () => {
    const repo = makeRepo(makePackage());
    repo.findByIdWithTests
      .mockResolvedValueOnce(makePackage())
      .mockResolvedValueOnce({ ...makePackage(), tests: [makeTest()] });
    const uc = new AddTestToPackageUseCase(repo as any);
    await uc.execute('pkg-1', 'edu-1', 'test-1');
    expect(repo.addTest).toHaveBeenCalledWith('pkg-1', 'test-1');
  });
});
