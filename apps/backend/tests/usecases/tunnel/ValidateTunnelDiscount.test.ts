/**
 * Tünel indirim kodu önizleme doğrulaması: kapsam (global/eğitici), tarih penceresi,
 * kullanım limiti, %50 eğitici clamp, tutar hesabı.
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    tunnel: { findUnique: jest.fn() },
    discountCode: { findFirst: jest.fn() },
  },
}));

import { ValidateTunnelDiscountUseCase } from '../../../src/application/use-cases/tunnel/ValidateTunnelDiscountUseCase';
import { prisma } from '../../../src/infrastructure/database/prisma';

const p = prisma as any;
const uc = new ValidateTunnelDiscountUseCase();
beforeEach(() => jest.clearAllMocks());

const tunnel = (over: any = {}) => ({ id: 'tn1', educatorId: 'edu1', status: 'PUBLISHED', priceCents: 10000, ...over });
const code = (over: any = {}) => ({
  code: 'KOD', description: null, percentOff: 20, maxUses: null, usedCount: 0,
  validFrom: null, validUntil: null, isActive: true, createdById: 'edu1', ...over,
});

it('boş kod → DISCOUNT_NOT_FOUND', async () => {
  await expect(uc.execute({ code: '  ', tunnelId: 'tn1' })).rejects.toMatchObject({ code: 'DISCOUNT_NOT_FOUND' });
});

it('tünel yok/yayında değil → TUNNEL_NOT_FOUND', async () => {
  p.tunnel.findUnique.mockResolvedValue(null);
  await expect(uc.execute({ code: 'X', tunnelId: 'tn1' })).rejects.toMatchObject({ code: 'TUNNEL_NOT_FOUND' });
  p.tunnel.findUnique.mockResolvedValue(tunnel({ status: 'DRAFT' }));
  await expect(uc.execute({ code: 'X', tunnelId: 'tn1' })).rejects.toMatchObject({ code: 'TUNNEL_NOT_FOUND' });
});

it('kod bulunamadı → DISCOUNT_NOT_FOUND', async () => {
  p.tunnel.findUnique.mockResolvedValue(tunnel());
  p.discountCode.findFirst.mockResolvedValue(null);
  await expect(uc.execute({ code: 'X', tunnelId: 'tn1' })).rejects.toMatchObject({ code: 'DISCOUNT_NOT_FOUND' });
});

it('pasif kod → DISCOUNT_NOT_ACTIVE', async () => {
  p.tunnel.findUnique.mockResolvedValue(tunnel());
  p.discountCode.findFirst.mockResolvedValue(code({ isActive: false }));
  await expect(uc.execute({ code: 'X', tunnelId: 'tn1' })).rejects.toMatchObject({ code: 'DISCOUNT_NOT_ACTIVE' });
});

it('başka eğiticinin kodu → DISCOUNT_NOT_OWNED', async () => {
  p.tunnel.findUnique.mockResolvedValue(tunnel());
  p.discountCode.findFirst.mockResolvedValue(code({ createdById: 'other' }));
  await expect(uc.execute({ code: 'X', tunnelId: 'tn1' })).rejects.toMatchObject({ code: 'DISCOUNT_NOT_OWNED' });
});

it('tarih penceresi dışı → DISCOUNT_OUT_OF_WINDOW', async () => {
  p.tunnel.findUnique.mockResolvedValue(tunnel());
  p.discountCode.findFirst.mockResolvedValue(code({ validFrom: new Date(Date.now() + 86400000) }));
  await expect(uc.execute({ code: 'X', tunnelId: 'tn1' })).rejects.toMatchObject({ code: 'DISCOUNT_OUT_OF_WINDOW' });
  p.discountCode.findFirst.mockResolvedValue(code({ validUntil: new Date(Date.now() - 86400000) }));
  await expect(uc.execute({ code: 'X', tunnelId: 'tn1' })).rejects.toMatchObject({ code: 'DISCOUNT_OUT_OF_WINDOW' });
});

it('kullanım hakkı bitti → DISCOUNT_USAGE_EXHAUSTED', async () => {
  p.tunnel.findUnique.mockResolvedValue(tunnel());
  p.discountCode.findFirst.mockResolvedValue(code({ maxUses: 5, usedCount: 5 }));
  await expect(uc.execute({ code: 'X', tunnelId: 'tn1' })).rejects.toMatchObject({ code: 'DISCOUNT_USAGE_EXHAUSTED' });
});

it('eğitici kodu %50 ile clamp edilir', async () => {
  p.tunnel.findUnique.mockResolvedValue(tunnel({ priceCents: 10000 }));
  p.discountCode.findFirst.mockResolvedValue(code({ createdById: 'edu1', percentOff: 80 }));
  const r = await uc.execute({ code: 'X', tunnelId: 'tn1' });
  expect(r.percentOff).toBe(50);
  expect(r.discountCents).toBe(5000);
  expect(r.finalAmountCents).toBe(5000);
});

it('global kod (createdById null) clamp edilmez', async () => {
  p.tunnel.findUnique.mockResolvedValue(tunnel({ priceCents: 10000 }));
  p.discountCode.findFirst.mockResolvedValue(code({ createdById: null, percentOff: 80 }));
  const r = await uc.execute({ code: 'X', tunnelId: 'tn1' });
  expect(r.percentOff).toBe(80);
  expect(r.discountCents).toBe(8000);
  expect(r.finalAmountCents).toBe(2000);
});
