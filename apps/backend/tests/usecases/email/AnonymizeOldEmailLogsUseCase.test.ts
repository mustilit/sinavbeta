/**
 * AnonymizeOldEmailLogsUseCase testleri.
 * Retention süresi, cutoff hesabı, updateMany çağrısı test edilir.
 */

const mockDb = {
  adminSettings: { findFirst: jest.fn() },
  emailLog: { updateMany: jest.fn() },
};

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: mockDb,
}));

import { AnonymizeOldEmailLogsUseCase } from '../../../src/application/use-cases/email/AnonymizeOldEmailLogsUseCase';

describe('AnonymizeOldEmailLogsUseCase', () => {
  let uc: AnonymizeOldEmailLogsUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    uc = new AnonymizeOldEmailLogsUseCase(mockDb as any);
  });

  it('90 gün önceki cutoff hesaplanır ve updateMany çağrılır', async () => {
    // Arrange
    const now = new Date('2026-05-27T12:00:00Z');
    mockDb.adminSettings.findFirst.mockResolvedValue({ emailRetentionDays: 90 });
    mockDb.emailLog.updateMany.mockResolvedValue({ count: 5 });

    // Act
    const result = await uc.execute({ now });

    // Assert
    const expectedCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    expect(mockDb.emailLog.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          queuedAt: { lt: expectedCutoff },
        }),
        data: expect.objectContaining({
          htmlBody: null,
          textBody: null,
          templateData: null,
        }),
      }),
    );
    expect(result.anonymized).toBe(5);
  });

  it('adminSettings yoksa varsayılan 90 gün kullanılır', async () => {
    // Arrange
    mockDb.adminSettings.findFirst.mockResolvedValue(null);
    mockDb.emailLog.updateMany.mockResolvedValue({ count: 0 });
    const now = new Date('2026-05-27T12:00:00Z');

    // Act
    const result = await uc.execute({ now });

    // Assert
    expect(result.anonymized).toBe(0);
    const call = mockDb.emailLog.updateMany.mock.calls[0][0];
    const cutoff: Date = call.where.queuedAt.lt;
    const diffDays = (now.getTime() - cutoff.getTime()) / (24 * 60 * 60 * 1000);
    expect(Math.round(diffDays)).toBe(90);
  });

  it('adminSettings emailRetentionDays=30 ise 30 günlük cutoff hesaplanır', async () => {
    // Arrange
    const now = new Date('2026-05-27T12:00:00Z');
    mockDb.adminSettings.findFirst.mockResolvedValue({ emailRetentionDays: 30 });
    mockDb.emailLog.updateMany.mockResolvedValue({ count: 12 });

    // Act
    const result = await uc.execute({ now });

    // Assert
    const call = mockDb.emailLog.updateMany.mock.calls[0][0];
    const cutoff: Date = call.where.queuedAt.lt;
    const diffDays = (now.getTime() - cutoff.getTime()) / (24 * 60 * 60 * 1000);
    expect(Math.round(diffDays)).toBe(30);
    expect(result.cutoff).toEqual(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
  });

  it('now parametresi verilmezse şu anki zaman kullanılır', async () => {
    // Arrange
    mockDb.adminSettings.findFirst.mockResolvedValue({ emailRetentionDays: 90 });
    mockDb.emailLog.updateMany.mockResolvedValue({ count: 0 });
    const before = Date.now();

    // Act
    const result = await uc.execute();

    // Assert
    const after = Date.now();
    const cutoffMs = result.cutoff.getTime();
    const expectedMin = before - 90 * 24 * 60 * 60 * 1000;
    const expectedMax = after - 90 * 24 * 60 * 60 * 1000;
    expect(cutoffMs).toBeGreaterThanOrEqual(expectedMin);
    expect(cutoffMs).toBeLessThanOrEqual(expectedMax);
  });
});
