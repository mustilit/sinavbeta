/**
 * PingLiveSessionUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - Katılımcı yoksa NOT_JOINED fırlatır
 * - Katılımcı varsa lastSeenAt güncellenir
 * - ok:true döner
 */

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    liveParticipant: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import { PingLiveSessionUseCase } from '../../../src/application/use-cases/live/PingLiveSessionUseCase';
import { prisma } from '../../../src/infrastructure/database/prisma';

const mockPrisma = prisma as any;

describe('PingLiveSessionUseCase', () => {
  beforeEach(() => jest.clearAllMocks());

  it('katılımcı yoksa NOT_JOINED fırlatır', async () => {
    mockPrisma.liveParticipant.findUnique.mockResolvedValue(null);
    const uc = new PingLiveSessionUseCase();
    await expect(uc.execute('sess-1', { userId: 'user-1' })).rejects.toMatchObject({ code: 'NOT_JOINED' });
  });

  it('katılımcı varsa lastSeenAt update çağrılır', async () => {
    mockPrisma.liveParticipant.findUnique.mockResolvedValue({ id: 'part-1', sessionId: 'sess-1' });
    mockPrisma.liveParticipant.update.mockResolvedValue({ id: 'part-1' });
    const uc = new PingLiveSessionUseCase();
    await uc.execute('sess-1', { userId: 'user-1' });
    expect(mockPrisma.liveParticipant.update).toHaveBeenCalledWith({
      where: { id: 'part-1' },
      data: expect.objectContaining({ lastSeenAt: expect.any(Date) }),
    });
  });

  it('başarılı ping sonucu ok:true döner', async () => {
    mockPrisma.liveParticipant.findUnique.mockResolvedValue({ id: 'part-1', sessionId: 'sess-1' });
    mockPrisma.liveParticipant.update.mockResolvedValue({ id: 'part-1' });
    const uc = new PingLiveSessionUseCase();
    const result = await uc.execute('sess-1', { userId: 'user-1' });
    expect(result.ok).toBe(true);
  });

  it('sessionId ve userId doğru şekilde iletilir', async () => {
    mockPrisma.liveParticipant.findUnique.mockResolvedValue(null);
    const uc = new PingLiveSessionUseCase();
    await expect(uc.execute('sess-xyz', { userId: 'user-abc' })).rejects.toBeTruthy();
    expect(mockPrisma.liveParticipant.findUnique).toHaveBeenCalledWith({
      where: { sessionId_userId: { sessionId: 'sess-xyz', userId: 'user-abc' } },
    });
  });
});
