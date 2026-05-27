/**
 * GetEmailTrafficMetricsUseCase testleri.
 * KPI hesaplamaları, bounce rate alert ve auto-pause durumu test edilir.
 */

const mockDb = {
  emailLog: {
    groupBy: jest.fn(),
  },
  emailProviderConfig: { findMany: jest.fn() },
  adminSettings: { findFirst: jest.fn() },
};

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: mockDb,
}));

import { GetEmailTrafficMetricsUseCase } from '../../../src/application/use-cases/email/GetEmailTrafficMetricsUseCase';

const makeSettings = (overrides: Partial<any> = {}) => ({
  id: 1,
  emailBounceRateAlertThreshold: 0.02,
  emailBulkAutoPausedAt: null,
  emailBulkAutoPausedReason: null,
  ...overrides,
});

describe('GetEmailTrafficMetricsUseCase', () => {
  let uc: GetEmailTrafficMetricsUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    uc = new GetEmailTrafficMetricsUseCase(mockDb as any);

    // Default mocks
    mockDb.emailLog.groupBy.mockResolvedValue([]);
    mockDb.emailProviderConfig.findMany.mockResolvedValue([]);
    mockDb.adminSettings.findFirst.mockResolvedValue(makeSettings());
  });

  it('tüm alanlar sıfır olduğunda sıfır KPI döner', async () => {
    // Arrange
    mockDb.emailLog.groupBy.mockResolvedValue([]);

    // Act
    const result = await uc.execute({ tenantId: 'tenant-1' });

    // Assert
    expect(result.counts24h.sent).toBe(0);
    expect(result.counts24h.bounced).toBe(0);
    expect(result.bounceRate24h).toBe(0);
    expect(result.alert).toBe(false);
  });

  it('bounce rate eşiği aşıldığında alert true döner', async () => {
    // Arrange — 10 sent, 3 bounced → rate = 0.3 > 0.02
    mockDb.emailLog.groupBy
      .mockResolvedValueOnce([
        { status: 'SENT', _count: { _all: 10 } },
        { status: 'BOUNCED', _count: { _all: 3 } },
      ])
      .mockResolvedValueOnce([]) // 7g
      .mockResolvedValueOnce([]); // templatePerf

    // Act
    const result = await uc.execute({ tenantId: 'tenant-1' });

    // Assert
    expect(result.alert).toBe(true);
    expect(result.bounceRate24h).toBeGreaterThan(0.02);
  });

  it('bulk auto-paused olduğunda alert true ve autoPaused.active true döner', async () => {
    // Arrange
    const pausedAt = new Date('2026-05-01T10:00:00Z');
    mockDb.adminSettings.findFirst.mockResolvedValue(
      makeSettings({ emailBulkAutoPausedAt: pausedAt, emailBulkAutoPausedReason: 'Yüksek bounce' }),
    );

    // Act
    const result = await uc.execute({ tenantId: 'tenant-1' });

    // Assert
    expect(result.autoPaused.active).toBe(true);
    expect(result.autoPaused.at).toEqual(pausedAt);
    expect(result.autoPaused.reason).toBe('Yüksek bounce');
    expect(result.alert).toBe(true);
  });

  it('provider listesi sıralanmış döner', async () => {
    // Arrange
    const providers = [
      { id: 'p1', name: 'Primary', kind: 'BREVO_API', isActive: true, priority: 1,
        dailyCap: 300, dailySentCount: 50, lastSuccessAt: null, lastFailureAt: null, lastFailureReason: null },
      { id: 'p2', name: 'Fallback', kind: 'SMTP', isActive: true, priority: 2,
        dailyCap: null, dailySentCount: 0, lastSuccessAt: null, lastFailureAt: null, lastFailureReason: null },
    ];
    mockDb.emailProviderConfig.findMany.mockResolvedValue(providers);

    // Act
    const result = await uc.execute({ tenantId: 'tenant-1' });

    // Assert
    expect(result.providers).toHaveLength(2);
    expect(result.providers[0].priority).toBe(1);
  });

  it('kuyruk derinliği QUEUED ve SENDING kayıtlarından hesaplanır', async () => {
    // Arrange — queueDepth için groupBy son çağrı
    mockDb.emailLog.groupBy
      .mockResolvedValueOnce([]) // counts24h
      .mockResolvedValueOnce([]) // counts7d
      .mockResolvedValueOnce([]) // templatePerf
      .mockResolvedValueOnce([  // queueDepth
        { queue: 'CRITICAL', _count: { _all: 5 } },
        { queue: 'NOTIFY', _count: { _all: 2 } },
        { queue: 'BULK', _count: { _all: 10 } },
      ]);

    // Act
    const result = await uc.execute({ tenantId: 'tenant-1' });

    // Assert
    expect(result.queueDepth.CRITICAL).toBe(5);
    expect(result.queueDepth.NOTIFY).toBe(2);
    expect(result.queueDepth.BULK).toBe(10);
  });
});
