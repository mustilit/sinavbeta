/**
 * CreateLiveSessionTierUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - label boşsa hata fırlatır
 * - priceCents negatifse hata fırlatır
 * - minParticipants negatifse hata fırlatır
 * - maxParticipants <= minParticipants ise hata fırlatır
 * - Başarı: prisma.liveSessionTier.create çağrılır, isActive = true
 * - order varsayılan 0
 */

const mockTierCreate = jest.fn();

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    liveSessionTier: {
      create: (...args: any[]) => mockTierCreate(...args),
    },
  },
}));

import { CreateLiveSessionTierUseCase } from '../../../src/application/use-cases/live/CreateLiveSessionTierUseCase';

describe('CreateLiveSessionTierUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTierCreate.mockResolvedValue({ id: 'tier-1', label: 'Küçük Sınıf', priceCents: 1000, isActive: true });
  });

  it('label boşsa hata fırlatır', async () => {
    const uc = new CreateLiveSessionTierUseCase();
    await expect(uc.execute({ label: '', priceCents: 100, minParticipants: 5 })).rejects.toThrow();
  });

  it('label sadece boşluksa hata fırlatır', async () => {
    const uc = new CreateLiveSessionTierUseCase();
    await expect(uc.execute({ label: '   ', priceCents: 100, minParticipants: 5 })).rejects.toThrow();
  });

  it('priceCents negatifse hata fırlatır', async () => {
    const uc = new CreateLiveSessionTierUseCase();
    await expect(uc.execute({ label: 'Tier A', priceCents: -1, minParticipants: 5 })).rejects.toThrow();
  });

  it('minParticipants negatifse hata fırlatır', async () => {
    const uc = new CreateLiveSessionTierUseCase();
    await expect(uc.execute({ label: 'Tier A', priceCents: 100, minParticipants: -1 })).rejects.toThrow();
  });

  it('maxParticipants minParticipants ile eşitse hata fırlatır', async () => {
    const uc = new CreateLiveSessionTierUseCase();
    await expect(uc.execute({ label: 'Tier A', priceCents: 100, minParticipants: 10, maxParticipants: 10 })).rejects.toThrow();
  });

  it('maxParticipants minParticipants\'tan küçükse hata fırlatır', async () => {
    const uc = new CreateLiveSessionTierUseCase();
    await expect(uc.execute({ label: 'Tier A', priceCents: 100, minParticipants: 20, maxParticipants: 10 })).rejects.toThrow();
  });

  it('başarı: liveSessionTier.create çağrılır, isActive = true', async () => {
    const uc = new CreateLiveSessionTierUseCase();
    await uc.execute({ label: 'Küçük Sınıf', priceCents: 1000, minParticipants: 5, maxParticipants: 30 });
    expect(mockTierCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ label: 'Küçük Sınıf', isActive: true }),
    });
  });

  it('order belirtilmezse 0 kullanılır', async () => {
    const uc = new CreateLiveSessionTierUseCase();
    await uc.execute({ label: 'Küçük Sınıf', priceCents: 1000, minParticipants: 5 });
    expect(mockTierCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ order: 0 }),
    });
  });
});
