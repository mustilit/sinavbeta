/**
 * PublishTestPackageUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - Admin kill-switch (testPublishingEnabled=false) → PUBLISHING_DISABLED
 * - Paket bulunamazsa → PACKAGE_NOT_FOUND
 * - Eğitici değilse (başka kullanıcı) → FORBIDDEN
 * - Zaten yayınlanmışsa → ALREADY_PUBLISHED
 * - Test yoksa → PACKAGE_EMPTY
 * - priceCents <= 0 → INVALID_PRICE
 * - Başarı: repo.publish çağrılır
 */

const mockAdminSettingsFindFirst = jest.fn();

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    adminSettings: { findFirst: (...args: any[]) => mockAdminSettingsFindFirst(...args) },
  },
}));

import { PublishTestPackageUseCase } from '../../../src/application/use-cases/package/PublishTestPackageUseCase';
import { AppError } from '../../../src/application/errors/AppError';

function makePackageRepo(pkg: any) {
  return {
    findByIdWithTests: jest.fn().mockResolvedValue(pkg),
    publish: jest.fn().mockResolvedValue({ id: 'pkg-1', publishedAt: new Date() }),
  };
}

function makePackage(overrides: Record<string, any> = {}) {
  return {
    id: 'pkg-1',
    educatorId: 'edu-1',
    title: 'Test Paketi',
    publishedAt: null,
    priceCents: 4900,
    tests: [{ id: 'test-1', publishedAt: new Date(), title: 'Test 1' }],
    ...overrides,
  };
}

describe('PublishTestPackageUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAdminSettingsFindFirst.mockResolvedValue({ id: 1, testPublishingEnabled: true });
  });

  it('testPublishingEnabled=false → PUBLISHING_DISABLED AppError fırlatır', async () => {
    mockAdminSettingsFindFirst.mockResolvedValue({ id: 1, testPublishingEnabled: false });
    const uc = new PublishTestPackageUseCase(makePackageRepo(makePackage()) as any);
    await expect(uc.execute('pkg-1', 'edu-1')).rejects.toMatchObject({ code: 'PUBLISHING_DISABLED' });
  });

  it('paket bulunamazsa PACKAGE_NOT_FOUND fırlatır', async () => {
    const uc = new PublishTestPackageUseCase(makePackageRepo(null) as any);
    await expect(uc.execute('pkg-missing', 'edu-1')).rejects.toMatchObject({ code: 'PACKAGE_NOT_FOUND' });
  });

  it('eğitici değilse FORBIDDEN fırlatır', async () => {
    const uc = new PublishTestPackageUseCase(makePackageRepo(makePackage()) as any);
    await expect(uc.execute('pkg-1', 'other-edu')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('paket zaten yayınlanmışsa ALREADY_PUBLISHED fırlatır', async () => {
    const uc = new PublishTestPackageUseCase(makePackageRepo(makePackage({ publishedAt: new Date() })) as any);
    await expect(uc.execute('pkg-1', 'edu-1')).rejects.toMatchObject({ code: 'ALREADY_PUBLISHED' });
  });

  it('test yoksa PACKAGE_EMPTY fırlatır', async () => {
    const uc = new PublishTestPackageUseCase(makePackageRepo(makePackage({ tests: [] })) as any);
    await expect(uc.execute('pkg-1', 'edu-1')).rejects.toMatchObject({ code: 'PACKAGE_EMPTY' });
  });

  it('priceCents = 0 → INVALID_PRICE fırlatır', async () => {
    const uc = new PublishTestPackageUseCase(makePackageRepo(makePackage({ priceCents: 0 })) as any);
    await expect(uc.execute('pkg-1', 'edu-1')).rejects.toMatchObject({ code: 'INVALID_PRICE' });
  });

  it('priceCents negatif → INVALID_PRICE fırlatır', async () => {
    const uc = new PublishTestPackageUseCase(makePackageRepo(makePackage({ priceCents: -100 })) as any);
    await expect(uc.execute('pkg-1', 'edu-1')).rejects.toMatchObject({ code: 'INVALID_PRICE' });
  });

  it('başarı: repo.publish çağrılır', async () => {
    const repo = makePackageRepo(makePackage());
    const uc = new PublishTestPackageUseCase(repo as any);
    await uc.execute('pkg-1', 'edu-1');
    expect(repo.publish).toHaveBeenCalledWith('pkg-1');
  });
});
