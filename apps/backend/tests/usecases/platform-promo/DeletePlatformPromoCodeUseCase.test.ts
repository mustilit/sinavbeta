/**
 * DeletePlatformPromoCodeUseCase testleri — Sprint 15 #3.
 *
 * Hard delete: PlatformPromoCodeUsage kayıtları CASCADE ile silinir.
 * usedCount > 0 olan kodu silmek raporlamayı bozar — UI uyarı göstermeli.
 * Bu use case yine de izin verir (admin kararı).
 */

const mockPromoFindUnique = jest.fn();
const mockPromoDelete = jest.fn();

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    platformPromoCode: {
      findUnique: (...args: any[]) => mockPromoFindUnique(...args),
      delete: (...args: any[]) => mockPromoDelete(...args),
    },
  },
}));

import { DeletePlatformPromoCodeUseCase } from '../../../src/application/use-cases/platform-promo/DeletePlatformPromoCodeUseCase';

const PROMO_ID = 'promo-1';
const ACTOR_ID = 'admin-1';

function makeAuditRepo() {
  return { create: jest.fn().mockResolvedValue({}) };
}

describe('DeletePlatformPromoCodeUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPromoFindUnique.mockResolvedValue({ id: PROMO_ID, code: 'LAUNCH50', usedCount: 0 });
    mockPromoDelete.mockResolvedValue({ id: PROMO_ID });
  });

  it('kod yoksa → PROMO_NOT_FOUND (404)', async () => {
    mockPromoFindUnique.mockResolvedValue(null);
    const uc = new DeletePlatformPromoCodeUseCase();
    await expect(uc.execute('missing', ACTOR_ID)).rejects.toMatchObject({
      code: 'PROMO_NOT_FOUND',
      status:404,
    });
  });

  it('başarı: delete çağrılır + { ok: true } döner', async () => {
    const uc = new DeletePlatformPromoCodeUseCase();
    const result = await uc.execute(PROMO_ID, ACTOR_ID);
    expect(mockPromoDelete).toHaveBeenCalledWith({ where: { id: PROMO_ID } });
    expect(result).toEqual({ ok: true });
  });

  it('usedCount > 0 olan kod yine de silinir (admin kararı)', async () => {
    mockPromoFindUnique.mockResolvedValue({ id: PROMO_ID, code: 'LAUNCH50', usedCount: 42 });
    const uc = new DeletePlatformPromoCodeUseCase();
    const result = await uc.execute(PROMO_ID, ACTOR_ID);
    expect(mockPromoDelete).toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });

  it('audit log yazılır (usedCount metadata içinde)', async () => {
    mockPromoFindUnique.mockResolvedValue({ id: PROMO_ID, code: 'LAUNCH50', usedCount: 5 });
    const auditRepo = makeAuditRepo();
    const uc = new DeletePlatformPromoCodeUseCase(auditRepo as any);
    await uc.execute(PROMO_ID, ACTOR_ID);
    expect(auditRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'PlatformPromoCode',
        entityId: PROMO_ID,
        actorId: ACTOR_ID,
        metadata: expect.objectContaining({ code: 'LAUNCH50', usedCount: 5, deleted: true }),
      }),
    );
  });

  it('audit log hatası ana akışı kesmez', async () => {
    const auditRepo = { create: jest.fn().mockRejectedValue(new Error('AUDIT_FAIL')) };
    const uc = new DeletePlatformPromoCodeUseCase(auditRepo as any);
    await expect(uc.execute(PROMO_ID, ACTOR_ID)).resolves.toBeDefined();
  });
});
