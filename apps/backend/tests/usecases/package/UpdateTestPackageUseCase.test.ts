/**
 * UpdateTestPackageUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - Paket bulunamazsa PACKAGE_NOT_FOUND
 * - Başkasının paketini düzenlemeye çalışırsa FORBIDDEN
 * - Boş başlık gönderilirse INVALID_TITLE
 * - Negatif fiyat gönderilirse INVALID_PRICE
 * - Başarı: repo.update çağrılır, trim uygulanır
 */

import { UpdateTestPackageUseCase } from '../../../src/application/use-cases/package/UpdateTestPackageUseCase';

function makeRepo(pkg: any = null) {
  return {
    findById: jest.fn().mockResolvedValue(pkg),
    update: jest.fn().mockImplementation(async (id: string, data: any) => ({ id, ...data })),
  };
}

function makePackage(overrides: any = {}) {
  return {
    id: 'pkg-1',
    educatorId: 'edu-1',
    title: 'Mevcut Paket',
    priceCents: 1000,
    publishedAt: null,
    ...overrides,
  };
}

describe('UpdateTestPackageUseCase', () => {
  it('paket bulunamazsa PACKAGE_NOT_FOUND fırlatır', async () => {
    const repo = makeRepo(null);
    const uc = new UpdateTestPackageUseCase(repo as any);
    await expect(uc.execute('pkg-x', 'edu-1', { title: 'Yeni' })).rejects.toMatchObject({
      code: 'PACKAGE_NOT_FOUND',
    });
  });

  it('başkasının paketini düzenleyince FORBIDDEN fırlatır', async () => {
    const repo = makeRepo(makePackage({ educatorId: 'other-edu' }));
    const uc = new UpdateTestPackageUseCase(repo as any);
    await expect(uc.execute('pkg-1', 'edu-1', { title: 'Güncelle' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('başlık boş string ise INVALID_TITLE fırlatır', async () => {
    const repo = makeRepo(makePackage());
    const uc = new UpdateTestPackageUseCase(repo as any);
    await expect(uc.execute('pkg-1', 'edu-1', { title: '   ' })).rejects.toMatchObject({
      code: 'INVALID_TITLE',
    });
  });

  it('negatif fiyat ise INVALID_PRICE fırlatır', async () => {
    const repo = makeRepo(makePackage());
    const uc = new UpdateTestPackageUseCase(repo as any);
    await expect(uc.execute('pkg-1', 'edu-1', { priceCents: -1 })).rejects.toMatchObject({
      code: 'INVALID_PRICE',
    });
  });

  it('başarı: başlık trim edilerek repo.update çağrılır', async () => {
    const repo = makeRepo(makePackage());
    const uc = new UpdateTestPackageUseCase(repo as any);
    await uc.execute('pkg-1', 'edu-1', { title: '  Temizlenmiş Başlık  ' });
    expect(repo.update).toHaveBeenCalledWith('pkg-1', expect.objectContaining({ title: 'Temizlenmiş Başlık' }));
  });

  it('sıfır fiyat kabul edilir (ücretsiz paket)', async () => {
    const repo = makeRepo(makePackage());
    const uc = new UpdateTestPackageUseCase(repo as any);
    await expect(uc.execute('pkg-1', 'edu-1', { priceCents: 0 })).resolves.toBeDefined();
    expect(repo.update).toHaveBeenCalledWith('pkg-1', expect.objectContaining({ priceCents: 0 }));
  });

  it('güncelleme alanları opsiyonel — sadece verilen alanlar geçirilir', async () => {
    const repo = makeRepo(makePackage());
    const uc = new UpdateTestPackageUseCase(repo as any);
    await uc.execute('pkg-1', 'edu-1', { coverImageUrl: 'https://cdn.example.com/img.png' });
    expect(repo.update).toHaveBeenCalledWith('pkg-1', expect.objectContaining({ coverImageUrl: 'https://cdn.example.com/img.png' }));
    expect(repo.update).not.toHaveBeenCalledWith('pkg-1', expect.objectContaining({ title: expect.anything() }));
  });
});
