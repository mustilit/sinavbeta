/**
 * WrittenPurchaseUseCases unit testleri.
 * PurchaseWrittenPackageUseCase + ValidateWrittenDiscountUseCase — tüm dallar.
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    writtenPackage: { findUnique: jest.fn() },
    writtenPurchase: { findUnique: jest.fn(), create: jest.fn() },
    writtenTest: { findMany: jest.fn() },
    contract: { findFirst: jest.fn() },
    discountCode: { findFirst: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));

import {
  PurchaseWrittenPackageUseCase,
  ValidateWrittenDiscountUseCase,
} from '../../../src/application/use-cases/written/WrittenPurchaseUseCases';
import { prisma } from '../../../src/infrastructure/database/prisma';

const p = prisma as any;

const pkgPaid = { id: 'pkg1', educatorId: 'edu1', priceCents: 10000, currency: 'TRY', isActive: true, publishedAt: new Date() };

beforeEach(() => {
  jest.clearAllMocks();
  p.user.findUnique.mockResolvedValue({ id: 'cand1', tenantId: 'tn1' });
  p.writtenPackage.findUnique.mockResolvedValue(pkgPaid);
  p.writtenPurchase.findUnique.mockResolvedValue(null);
  p.writtenTest.findMany.mockResolvedValue([]);
  p.contract.findFirst.mockResolvedValue(null); // mesafeli satış sözleşmesi yok → onay gerekmez
  p.writtenPurchase.create.mockImplementation(async ({ data }: any) => ({ id: 'wp1', ...data }));
  p.$transaction.mockImplementation(async (cb: any) => cb({
    discountCode: { updateMany: p.discountCode.updateMany },
    writtenPurchase: { create: p.writtenPurchase.create },
  }));
});

describe('PurchaseWrittenPackageUseCase', () => {
  const uc = new PurchaseWrittenPackageUseCase();

  it('actorId yoksa UNAUTHORIZED', async () => {
    await expect(uc.execute('pkg1', null)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('kullanıcı bulunamazsa UNAUTHORIZED', async () => {
    p.user.findUnique.mockResolvedValue(null);
    await expect(uc.execute('pkg1', 'cand1')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('paket yoksa WRITTEN_PACKAGE_NOT_FOUND', async () => {
    p.writtenPackage.findUnique.mockResolvedValue(null);
    await expect(uc.execute('pkg1', 'cand1')).rejects.toMatchObject({ code: 'WRITTEN_PACKAGE_NOT_FOUND' });
  });

  it('yayımlı değilse WRITTEN_PACKAGE_NOT_PUBLISHED', async () => {
    p.writtenPackage.findUnique.mockResolvedValue({ ...pkgPaid, publishedAt: null });
    await expect(uc.execute('pkg1', 'cand1')).rejects.toMatchObject({ code: 'WRITTEN_PACKAGE_NOT_PUBLISHED' });
  });

  it('isActive false ise WRITTEN_PACKAGE_NOT_PUBLISHED', async () => {
    p.writtenPackage.findUnique.mockResolvedValue({ ...pkgPaid, isActive: false });
    await expect(uc.execute('pkg1', 'cand1')).rejects.toMatchObject({ code: 'WRITTEN_PACKAGE_NOT_PUBLISHED' });
  });

  it('kendi paketini alamaz → OWN_PACKAGE', async () => {
    await expect(uc.execute('pkg1', 'edu1')).rejects.toMatchObject({ code: 'OWN_PACKAGE' });
  });

  it('zaten ACTIVE satın alma varsa mevcut döner (idempotent)', async () => {
    const existing = { id: 'wpX', status: 'ACTIVE' };
    p.writtenPurchase.findUnique.mockResolvedValue(existing);
    const r = await uc.execute('pkg1', 'cand1');
    expect(r).toBe(existing);
    expect(p.writtenPurchase.create).not.toHaveBeenCalled();
  });

  it('eski REFUNDED satın alma varsa yeni oluşturur', async () => {
    p.writtenPurchase.findUnique.mockResolvedValue({ id: 'wpOld', status: 'REFUNDED' });
    const r = await uc.execute('pkg1', 'cand1');
    expect(r.status).toBe('ACTIVE');
    expect(p.writtenPurchase.create).toHaveBeenCalled();
  });

  it('mesafeli satış sözleşmesi aktif ama onay yoksa TERMS_NOT_ACCEPTED', async () => {
    p.contract.findFirst.mockResolvedValue({ id: 'ct1' });
    await expect(uc.execute('pkg1', 'cand1')).rejects.toMatchObject({ code: 'TERMS_NOT_ACCEPTED' });
  });

  it('mesafeli satış onayı doğruysa snapshot ile satın alır', async () => {
    p.contract.findFirst.mockResolvedValue({ id: 'ct1' });
    const r = await uc.execute('pkg1', 'cand1', null, {
      acceptedDistanceSaleContractId: 'ct1', paymentProvider: 'iyzico', ip: '1.2.3.4', userAgent: 'UA',
    });
    expect(r.distanceSaleContractId).toBe('ct1');
    expect(r.distanceSaleAcceptedIp).toBe('1.2.3.4');
  });

  it('ücretsiz paket (priceCents=0) → kod olmadan oluşturur', async () => {
    p.writtenPackage.findUnique.mockResolvedValue({ ...pkgPaid, priceCents: 0 });
    const r = await uc.execute('pkg1', 'cand1');
    expect(r.amountCents).toBe(0);
    expect(p.discountCode.findFirst).not.toHaveBeenCalled();
  });

  it('kod yoksa ücretli paket tam fiyatla oluşturur', async () => {
    const r = await uc.execute('pkg1', 'cand1');
    expect(r.amountCents).toBe(10000);
    expect(p.discountCode.findFirst).not.toHaveBeenCalled();
  });

  it('kod bulunamazsa DISCOUNT_NOT_FOUND', async () => {
    p.discountCode.findFirst.mockResolvedValue(null);
    await expect(uc.execute('pkg1', 'cand1', 'YOK')).rejects.toMatchObject({ code: 'DISCOUNT_NOT_FOUND' });
  });

  it('kod tarih penceresi dışındaysa DISCOUNT_OUT_OF_WINDOW', async () => {
    p.discountCode.findFirst.mockResolvedValue({ id: 'dc1', percentOff: 20, createdById: 'edu1', validUntil: new Date(Date.now() - 1000) });
    await expect(uc.execute('pkg1', 'cand1', 'IND')).rejects.toMatchObject({ code: 'DISCOUNT_OUT_OF_WINDOW' });
  });

  it('başka eğiticinin kodu DISCOUNT_NOT_OWNED', async () => {
    p.discountCode.findFirst.mockResolvedValue({ id: 'dc1', percentOff: 20, createdById: 'eduOTHER' });
    await expect(uc.execute('pkg1', 'cand1', 'IND')).rejects.toMatchObject({ code: 'DISCOUNT_NOT_OWNED' });
  });

  it('global kod (createdById null) clamp olmadan uygulanır', async () => {
    p.discountCode.findFirst.mockResolvedValue({ id: 'dc1', percentOff: 80, createdById: null, maxUses: null });
    p.discountCode.updateMany.mockResolvedValue({ count: 1 });
    const r = await uc.execute('pkg1', 'cand1', 'GLOBAL');
    // 80% indirim: 10000 -> 2000
    expect(r.discountAmountCents).toBe(8000);
    expect(r.amountCents).toBe(2000);
    expect(r.discountCodeId).toBe('dc1');
  });

  it('eğitici kodu %50 ile clamp edilir', async () => {
    p.discountCode.findFirst.mockResolvedValue({ id: 'dc2', percentOff: 90, createdById: 'edu1', maxUses: 5 });
    p.discountCode.updateMany.mockResolvedValue({ count: 1 });
    const r = await uc.execute('pkg1', 'cand1', 'EDU');
    // 90 clamp 50 → 5000 indirim
    expect(r.discountAmountCents).toBe(5000);
    expect(r.amountCents).toBe(5000);
  });

  it('kullanım limiti dolmuşsa (tx inc.count=0) DISCOUNT_USAGE_EXHAUSTED', async () => {
    p.discountCode.findFirst.mockResolvedValue({ id: 'dc3', percentOff: 10, createdById: null, maxUses: 1 });
    p.discountCode.updateMany.mockResolvedValue({ count: 0 });
    await expect(uc.execute('pkg1', 'cand1', 'DOLU')).rejects.toMatchObject({ code: 'DISCOUNT_USAGE_EXHAUSTED' });
  });
});

describe('ValidateWrittenDiscountUseCase', () => {
  const uc = new ValidateWrittenDiscountUseCase();
  const dcBase = { code: 'IND', description: 'x', percentOff: 20, maxUses: null, usedCount: 0, validFrom: null, validUntil: null, isActive: true, createdById: 'edu1' };

  beforeEach(() => {
    p.writtenPackage.findUnique.mockResolvedValue(pkgPaid);
  });

  it('boş kod → DISCOUNT_NOT_FOUND', async () => {
    await expect(uc.execute({ code: '', packageId: 'pkg1' })).rejects.toMatchObject({ code: 'DISCOUNT_NOT_FOUND' });
  });

  it('packageId yoksa → DISCOUNT_NOT_FOUND', async () => {
    await expect(uc.execute({ code: 'IND', packageId: '' })).rejects.toMatchObject({ code: 'DISCOUNT_NOT_FOUND' });
  });

  it('paket bulunamazsa WRITTEN_PACKAGE_NOT_FOUND', async () => {
    p.writtenPackage.findUnique.mockResolvedValue(null);
    await expect(uc.execute({ code: 'IND', packageId: 'pkg1' })).rejects.toMatchObject({ code: 'WRITTEN_PACKAGE_NOT_FOUND' });
  });

  it('kod bulunamazsa DISCOUNT_NOT_FOUND', async () => {
    p.discountCode.findFirst.mockResolvedValue(null);
    await expect(uc.execute({ code: 'IND', packageId: 'pkg1' })).rejects.toMatchObject({ code: 'DISCOUNT_NOT_FOUND' });
  });

  it('kod pasifse DISCOUNT_NOT_ACTIVE', async () => {
    p.discountCode.findFirst.mockResolvedValue({ ...dcBase, isActive: false });
    await expect(uc.execute({ code: 'IND', packageId: 'pkg1' })).rejects.toMatchObject({ code: 'DISCOUNT_NOT_ACTIVE' });
  });

  it('başka eğitici kodu DISCOUNT_NOT_OWNED', async () => {
    p.discountCode.findFirst.mockResolvedValue({ ...dcBase, createdById: 'eduOTHER' });
    await expect(uc.execute({ code: 'IND', packageId: 'pkg1' })).rejects.toMatchObject({ code: 'DISCOUNT_NOT_OWNED' });
  });

  it('validFrom gelecekteyse DISCOUNT_OUT_OF_WINDOW', async () => {
    p.discountCode.findFirst.mockResolvedValue({ ...dcBase, validFrom: new Date(Date.now() + 100000) });
    await expect(uc.execute({ code: 'IND', packageId: 'pkg1' })).rejects.toMatchObject({ code: 'DISCOUNT_OUT_OF_WINDOW' });
  });

  it('validUntil geçmişse DISCOUNT_OUT_OF_WINDOW', async () => {
    p.discountCode.findFirst.mockResolvedValue({ ...dcBase, validUntil: new Date(Date.now() - 100000) });
    await expect(uc.execute({ code: 'IND', packageId: 'pkg1' })).rejects.toMatchObject({ code: 'DISCOUNT_OUT_OF_WINDOW' });
  });

  it('kullanım hakkı tükenmişse DISCOUNT_USAGE_EXHAUSTED', async () => {
    p.discountCode.findFirst.mockResolvedValue({ ...dcBase, maxUses: 3, usedCount: 3 });
    await expect(uc.execute({ code: 'IND', packageId: 'pkg1' })).rejects.toMatchObject({ code: 'DISCOUNT_USAGE_EXHAUSTED' });
  });

  it('global kod clamp olmadan döner', async () => {
    p.discountCode.findFirst.mockResolvedValue({ ...dcBase, percentOff: 70, createdById: null });
    const r = await uc.execute({ code: 'IND', packageId: 'pkg1' });
    expect(r.percentOff).toBe(70);
    expect(r.discountCents).toBe(7000);
    expect(r.finalAmountCents).toBe(3000);
  });

  it('eğitici kodu %50 clamp ile döner', async () => {
    p.discountCode.findFirst.mockResolvedValue({ ...dcBase, percentOff: 90, createdById: 'edu1' });
    const r = await uc.execute({ code: 'IND', packageId: 'pkg1' });
    expect(r.percentOff).toBe(50);
    expect(r.discountCents).toBe(5000);
    expect(r.finalAmountCents).toBe(5000);
  });
});
