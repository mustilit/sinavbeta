/**
 * CheckBounceRateAlertUseCase testleri.
 * Bounce rate hesabı, auto-pause tetikleme, eşik kontrolü test edilir.
 */

const mockDb = {
  adminSettings: { findFirst: jest.fn(), update: jest.fn() },
  emailLog: { groupBy: jest.fn() },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
};

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: mockDb,
}));

import { CheckBounceRateAlertUseCase } from '../../../src/application/use-cases/email/CheckBounceRateAlertUseCase';

const makeSettings = (overrides: Partial<any> = {}) => ({
  id: 1,
  emailBounceRateAlertThreshold: 0.02,
  emailEducatorBulkEnabled: true,
  emailCandidateBulkEnabled: true,
  emailBulkAutoPausedAt: null,
  ...overrides,
});

describe('CheckBounceRateAlertUseCase', () => {
  let uc: CheckBounceRateAlertUseCase;
  const fixedNow = new Date('2026-05-27T12:00:00Z');

  beforeEach(() => {
    jest.clearAllMocks();
    uc = new CheckBounceRateAlertUseCase(mockDb as any);
  });

  it('bounce rate eşiğin altında kalırsa no_action döner', async () => {
    // Arrange
    mockDb.adminSettings.findFirst.mockResolvedValue(makeSettings({ emailBounceRateAlertThreshold: 0.02 }));
    mockDb.emailLog.groupBy.mockResolvedValue([
      { status: 'SENT', _count: { _all: 100 } },
      { status: 'BOUNCED', _count: { _all: 1 } }, // rate = 1/101 ≈ 0.0099 < 0.02
    ]);

    // Act
    const result = await uc.execute({ now: fixedNow });

    // Assert
    expect(result.action).toBe('no_action');
    expect(mockDb.adminSettings.update).not.toHaveBeenCalled();
  });

  it('bounce rate eşiği aşınca bulk_auto_paused döner ve AdminSettings güncellenir', async () => {
    // Arrange
    mockDb.adminSettings.findFirst.mockResolvedValue(makeSettings());
    mockDb.emailLog.groupBy.mockResolvedValue([
      { status: 'SENT', _count: { _all: 10 } },
      { status: 'BOUNCED', _count: { _all: 5 } }, // rate = 5/15 ≈ 0.33 > 0.02
    ]);
    mockDb.adminSettings.update.mockResolvedValue({});

    // Act
    const result = await uc.execute({ now: fixedNow });

    // Assert
    expect(result.action).toBe('bulk_auto_paused');
    expect(mockDb.adminSettings.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          emailEducatorBulkEnabled: false,
          emailCandidateBulkEnabled: false,
          emailBulkAutoPausedAt: fixedNow,
        }),
      }),
    );
  });

  it('bulk zaten kapalıysa already_paused döner', async () => {
    // Arrange
    mockDb.adminSettings.findFirst.mockResolvedValue(
      makeSettings({ emailEducatorBulkEnabled: false, emailCandidateBulkEnabled: false }),
    );
    mockDb.emailLog.groupBy.mockResolvedValue([
      { status: 'BOUNCED', _count: { _all: 10 } },
      { status: 'SENT', _count: { _all: 5 } },
    ]);

    // Act
    const result = await uc.execute({ now: fixedNow });

    // Assert
    expect(result.action).toBe('already_paused');
    expect(mockDb.adminSettings.update).not.toHaveBeenCalled();
  });

  it('veri yoksa rate 0 ve no_action döner', async () => {
    // Arrange
    mockDb.adminSettings.findFirst.mockResolvedValue(makeSettings());
    mockDb.emailLog.groupBy.mockResolvedValue([]);

    // Act
    const result = await uc.execute({ now: fixedNow });

    // Assert
    expect(result.rate).toBe(0);
    expect(result.action).toBe('no_action');
  });

  it('auto-pause sonrası AuditLog yazılır', async () => {
    // Arrange
    mockDb.adminSettings.findFirst.mockResolvedValue(makeSettings());
    mockDb.emailLog.groupBy.mockResolvedValue([
      { status: 'COMPLAINED', _count: { _all: 10 } },
      { status: 'DELIVERED', _count: { _all: 5 } },
    ]);
    mockDb.adminSettings.update.mockResolvedValue({});

    // Act
    await uc.execute({ now: fixedNow });

    // Assert
    expect(mockDb.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'EMAIL_KILL_SWITCH_CHANGED' }),
      }),
    );
  });
});
