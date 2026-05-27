/**
 * ResetProviderDailyCountUseCase testleri.
 * dailySentCount > 0 olan sağlayıcılar sıfırlanır, dailyResetAt set edilir.
 */

const mockDb = {
  emailProviderConfig: { updateMany: jest.fn() },
};

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: mockDb,
}));

import { ResetProviderDailyCountUseCase } from '../../../src/application/use-cases/email/ResetProviderDailyCountUseCase';

describe('ResetProviderDailyCountUseCase', () => {
  let uc: ResetProviderDailyCountUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    uc = new ResetProviderDailyCountUseCase(mockDb as any);
  });

  it('güncellenen provider sayısını döner', async () => {
    // Arrange
    mockDb.emailProviderConfig.updateMany.mockResolvedValue({ count: 3 });

    // Act
    const result = await uc.execute();

    // Assert
    expect(result.reset).toBe(3);
  });

  it('dailySentCount gt:0 where koşulu ile çağrılır', async () => {
    // Arrange
    mockDb.emailProviderConfig.updateMany.mockResolvedValue({ count: 1 });

    // Act
    await uc.execute();

    // Assert
    expect(mockDb.emailProviderConfig.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { dailySentCount: { gt: 0 } },
      }),
    );
  });

  it('güncelleme verisinde dailySentCount:0 ve dailyResetAt set edilir', async () => {
    // Arrange
    mockDb.emailProviderConfig.updateMany.mockResolvedValue({ count: 2 });
    const before = Date.now();

    // Act
    await uc.execute();

    // Assert
    const call = mockDb.emailProviderConfig.updateMany.mock.calls[0][0];
    expect(call.data.dailySentCount).toBe(0);
    expect(call.data.dailyResetAt).toBeInstanceOf(Date);
    expect(call.data.dailyResetAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('güncellenecek kayıt yoksa reset:0 döner', async () => {
    // Arrange
    mockDb.emailProviderConfig.updateMany.mockResolvedValue({ count: 0 });

    // Act
    const result = await uc.execute();

    // Assert
    expect(result.reset).toBe(0);
  });
});
