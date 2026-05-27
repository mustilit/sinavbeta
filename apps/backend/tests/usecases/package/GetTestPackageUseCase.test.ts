/**
 * GetTestPackageUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - Paket bulunamazsa → PACKAGE_NOT_FOUND
 * - Başka kullanıcı isteği → FORBIDDEN
 * - Başarı: paketin sahibi paketi görebilir
 */

import { GetTestPackageUseCase } from '../../../src/application/use-cases/package/GetTestPackageUseCase';

function makePackageRepo(pkg: any) {
  return { findByIdWithTests: jest.fn().mockResolvedValue(pkg) };
}

function makePackage(overrides: Record<string, any> = {}) {
  return {
    id: 'pkg-1',
    educatorId: 'edu-1',
    title: 'Test Paketi',
    publishedAt: null,
    priceCents: 4900,
    tests: [{ id: 'test-1', title: 'Test 1' }],
    ...overrides,
  };
}

describe('GetTestPackageUseCase', () => {
  it('paket bulunamazsa PACKAGE_NOT_FOUND AppError fırlatır', async () => {
    const uc = new GetTestPackageUseCase(makePackageRepo(null) as any);
    await expect(uc.execute('pkg-missing', 'edu-1')).rejects.toMatchObject({ code: 'PACKAGE_NOT_FOUND' });
  });

  it('başka kullanıcının paketi → FORBIDDEN AppError fırlatır', async () => {
    const uc = new GetTestPackageUseCase(makePackageRepo(makePackage({ educatorId: 'other-edu' })) as any);
    await expect(uc.execute('pkg-1', 'edu-1')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('paketin sahibi paketi görebilir', async () => {
    const pkg = makePackage();
    const uc = new GetTestPackageUseCase(makePackageRepo(pkg) as any);
    const result = await uc.execute('pkg-1', 'edu-1');
    expect(result.id).toBe('pkg-1');
    expect(result.educatorId).toBe('edu-1');
  });

  it('repo.findByIdWithTests çağrılır', async () => {
    const repo = makePackageRepo(makePackage());
    const uc = new GetTestPackageUseCase(repo as any);
    await uc.execute('pkg-1', 'edu-1');
    expect(repo.findByIdWithTests).toHaveBeenCalledWith('pkg-1');
  });
});
