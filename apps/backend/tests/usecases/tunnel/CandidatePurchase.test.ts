/** Tünel satın alma + başlatma use-case testleri (indirim dahil). */
jest.mock('../../../src/infrastructure/database/prisma', () => {
  const tx = {
    discountCode: { updateMany: jest.fn() },
    tunnelPurchase: { create: jest.fn() },
    auditLog: { create: jest.fn(async () => ({})) },
  };
  return {
    prisma: {
      user: { findUnique: jest.fn() },
      tunnel: { findUnique: jest.fn() },
      contract: { findFirst: jest.fn(async () => null) },
      tunnelPurchase: { findUnique: jest.fn(), create: jest.fn() },
      tunnelAttempt: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      discountCode: { findFirst: jest.fn(), updateMany: jest.fn() },
      tunnelQuestionProgress: { findMany: jest.fn(async () => []) },
      auditLog: { create: jest.fn(async () => ({})) },
      $transaction: jest.fn(async (fn: any) => fn(tx)),
      __tx: tx,
    },
  };
});

import { PurchaseTunnelUseCase } from '../../../src/application/use-cases/tunnel/PurchaseTunnelUseCase';
import { prisma } from '../../../src/infrastructure/database/prisma';

const p = prisma as any;
beforeEach(() => jest.clearAllMocks());

describe('PurchaseTunnelUseCase', () => {
  const pubTunnel = { id: 'tn1', status: 'PUBLISHED', educatorId: 'edu1', priceCents: 10000, currency: 'TRY' };

  it('yayında değilse → hata', async () => {
    p.user.findUnique.mockResolvedValue({ id: 'c1', tenantId: 't1' });
    p.tunnel.findUnique.mockResolvedValue({ ...pubTunnel, status: 'DRAFT' });
    await expect(new PurchaseTunnelUseCase().execute('tn1', 'c1')).rejects.toMatchObject({ code: 'TUNNEL_NOT_PUBLISHED' });
  });

  it('kendi tüneli → OWN_TUNNEL', async () => {
    p.user.findUnique.mockResolvedValue({ id: 'edu1', tenantId: 't1' });
    p.tunnel.findUnique.mockResolvedValue(pubTunnel);
    await expect(new PurchaseTunnelUseCase().execute('tn1', 'edu1')).rejects.toMatchObject({ code: 'OWN_TUNNEL' });
  });

  it('zaten satın alınmış → mevcut döner (idempotent)', async () => {
    p.user.findUnique.mockResolvedValue({ id: 'c1', tenantId: 't1' });
    p.tunnel.findUnique.mockResolvedValue(pubTunnel);
    p.tunnelPurchase.findUnique.mockResolvedValue({ id: 'pp1' });
    const r = await new PurchaseTunnelUseCase().execute('tn1', 'c1');
    expect(r).toEqual({ id: 'pp1' });
    expect(p.tunnelPurchase.create).not.toHaveBeenCalled();
  });

  it('indirimsiz → tam fiyat snapshot', async () => {
    p.user.findUnique.mockResolvedValue({ id: 'c1', tenantId: 't1' });
    p.tunnel.findUnique.mockResolvedValue(pubTunnel);
    p.tunnelPurchase.findUnique.mockResolvedValue(null);
    p.tunnelPurchase.create.mockImplementation(({ data }: any) => ({ id: 'pp', ...data }));
    const r = await new PurchaseTunnelUseCase().execute('tn1', 'c1');
    expect(r.amountCents).toBe(10000);
  });

  it('eğitici kodu %50 clamp + race-safe usedCount + snapshot', async () => {
    p.user.findUnique.mockResolvedValue({ id: 'c1', tenantId: 't1' });
    p.tunnel.findUnique.mockResolvedValue(pubTunnel);
    p.tunnelPurchase.findUnique.mockResolvedValue(null);
    p.discountCode.findFirst.mockResolvedValue({ id: 'dc1', percentOff: 80, createdById: 'edu1', maxUses: 5, usedCount: 0, isActive: true, validFrom: null, validUntil: null });
    p.__tx.discountCode.updateMany.mockResolvedValue({ count: 1 });
    p.__tx.tunnelPurchase.create.mockImplementation(({ data }: any) => ({ id: 'pp', ...data }));
    const r = await new PurchaseTunnelUseCase().execute('tn1', 'c1', 'KOD80');
    // %80 istendi ama eğitici kodu %50 clamp → 5000 indirim, 5000 final
    expect(r.discountAmountCents).toBe(5000);
    expect(r.amountCents).toBe(5000);
    expect(r.discountCodeId).toBe('dc1');
  });

  it('global admin kodu clamp YOK', async () => {
    p.user.findUnique.mockResolvedValue({ id: 'c1', tenantId: 't1' });
    p.tunnel.findUnique.mockResolvedValue(pubTunnel);
    p.tunnelPurchase.findUnique.mockResolvedValue(null);
    p.discountCode.findFirst.mockResolvedValue({ id: 'dc2', percentOff: 80, createdById: null, maxUses: null, usedCount: 0, isActive: true, validFrom: null, validUntil: null });
    p.__tx.discountCode.updateMany.mockResolvedValue({ count: 1 });
    p.__tx.tunnelPurchase.create.mockImplementation(({ data }: any) => ({ id: 'pp', ...data }));
    const r = await new PurchaseTunnelUseCase().execute('tn1', 'c1', 'GLOBAL80');
    expect(r.discountAmountCents).toBe(8000); // %80 tam
    // maxUses null → where'de usedCount filtresi OLMAMALI (INT4 overflow regresyonu).
    const whereArg = p.__tx.discountCode.updateMany.mock.calls[0][0].where;
    expect(whereArg.usedCount).toBeUndefined();
    expect(JSON.stringify(whereArg)).not.toContain('9007199254740991');
  });

  it('başka eğiticinin kodu → DISCOUNT_NOT_OWNED', async () => {
    p.user.findUnique.mockResolvedValue({ id: 'c1', tenantId: 't1' });
    p.tunnel.findUnique.mockResolvedValue(pubTunnel);
    p.tunnelPurchase.findUnique.mockResolvedValue(null);
    p.discountCode.findFirst.mockResolvedValue({ id: 'dc3', percentOff: 20, createdById: 'other-edu', maxUses: null, usedCount: 0, isActive: true, validFrom: null, validUntil: null });
    await expect(new PurchaseTunnelUseCase().execute('tn1', 'c1', 'X')).rejects.toMatchObject({ code: 'DISCOUNT_NOT_OWNED' });
  });

  it('kullanım dolu → DISCOUNT_USAGE_EXHAUSTED', async () => {
    p.user.findUnique.mockResolvedValue({ id: 'c1', tenantId: 't1' });
    p.tunnel.findUnique.mockResolvedValue(pubTunnel);
    p.tunnelPurchase.findUnique.mockResolvedValue(null);
    p.discountCode.findFirst.mockResolvedValue({ id: 'dc4', percentOff: 10, createdById: null, maxUses: 1, usedCount: 1, isActive: true, validFrom: null, validUntil: null });
    p.__tx.discountCode.updateMany.mockResolvedValue({ count: 0 });
    await expect(new PurchaseTunnelUseCase().execute('tn1', 'c1', 'FULL')).rejects.toMatchObject({ code: 'DISCOUNT_USAGE_EXHAUSTED' });
  });
});
