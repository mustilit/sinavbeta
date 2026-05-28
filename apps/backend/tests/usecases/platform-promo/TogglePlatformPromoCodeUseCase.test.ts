/**
 * TogglePlatformPromoCodeUseCase testleri — Sprint 15 #3.
 *
 * Admin promo kodunu aktif/pasif yapar. Silme yerine tercih edilen yöntem —
 * usedCount korunur, raporlama bozulmaz.
 *
 * - Kod yoksa → PROMO_NOT_FOUND
 * - Aynı state'e toggle → no-op (mevcut kayıt döner, update çağrılmaz)
 * - Farklı state → update + audit log
 */

const mockPromoFindUnique = jest.fn();
const mockPromoUpdate = jest.fn();

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    platformPromoCode: {
      findUnique: (...args: any[]) => mockPromoFindUnique(...args),
      update: (...args: any[]) => mockPromoUpdate(...args),
    },
  },
}));

import { TogglePlatformPromoCodeUseCase } from '../../../src/application/use-cases/platform-promo/TogglePlatformPromoCodeUseCase';

const PROMO_ID = 'promo-1';
const ACTOR_ID = 'admin-1';

function makeAuditRepo() {
  return { create: jest.fn().mockResolvedValue({}) };
}

describe('TogglePlatformPromoCodeUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPromoFindUnique.mockResolvedValue({ id: PROMO_ID, code: 'LAUNCH50', isActive: true });
    mockPromoUpdate.mockResolvedValue({ id: PROMO_ID, code: 'LAUNCH50', isActive: false });
  });

  it('kod yoksa → PROMO_NOT_FOUND (404)', async () => {
    mockPromoFindUnique.mockResolvedValue(null);
    const uc = new TogglePlatformPromoCodeUseCase();
    await expect(uc.execute('missing', false, ACTOR_ID)).rejects.toMatchObject({
      code: 'PROMO_NOT_FOUND',
      status:404,
    });
  });

  it('aynı state (zaten aktif → aktif) → no-op, update çağrılmaz', async () => {
    const uc = new TogglePlatformPromoCodeUseCase();
    await uc.execute(PROMO_ID, true, ACTOR_ID);
    expect(mockPromoUpdate).not.toHaveBeenCalled();
  });

  it('aktif → pasif: update çağrılır', async () => {
    const uc = new TogglePlatformPromoCodeUseCase();
    const result = await uc.execute(PROMO_ID, false, ACTOR_ID);
    expect(mockPromoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: PROMO_ID },
        data: { isActive: false },
      }),
    );
    expect(result.isActive).toBe(false);
  });

  it('pasif → aktif: update çağrılır', async () => {
    mockPromoFindUnique.mockResolvedValue({ id: PROMO_ID, code: 'LAUNCH50', isActive: false });
    mockPromoUpdate.mockResolvedValue({ id: PROMO_ID, code: 'LAUNCH50', isActive: true });
    const uc = new TogglePlatformPromoCodeUseCase();
    const result = await uc.execute(PROMO_ID, true, ACTOR_ID);
    expect(mockPromoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: true } }),
    );
    expect(result.isActive).toBe(true);
  });

  it('audit log yazılır', async () => {
    const auditRepo = makeAuditRepo();
    const uc = new TogglePlatformPromoCodeUseCase(auditRepo as any);
    await uc.execute(PROMO_ID, false, ACTOR_ID);
    expect(auditRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'PlatformPromoCode',
        entityId: PROMO_ID,
        actorId: ACTOR_ID,
      }),
    );
  });

  it('audit log hatası ana akışı kesmez', async () => {
    const auditRepo = { create: jest.fn().mockRejectedValue(new Error('AUDIT_FAIL')) };
    const uc = new TogglePlatformPromoCodeUseCase(auditRepo as any);
    await expect(uc.execute(PROMO_ID, false, ACTOR_ID)).resolves.toBeDefined();
  });
});
