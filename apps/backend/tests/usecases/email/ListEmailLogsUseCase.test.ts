/**
 * ListEmailLogsUseCase testleri.
 * Cursor pagination, filtreler, limit sınırı test edilir.
 */

const mockDb = {
  emailLog: { findMany: jest.fn() },
};

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: mockDb,
}));

import { ListEmailLogsUseCase } from '../../../src/application/use-cases/email/ListEmailLogsUseCase';

const makeLog = (overrides: Partial<any> = {}) => ({
  id: 'log-1',
  recipientEmail: 'user@example.com',
  recipientRole: 'CANDIDATE',
  templateKey: 'purchase-receipt',
  queue: 'CRITICAL',
  status: 'SENT',
  subject: 'Satın Alma',
  providerKind: 'BREVO_API',
  attemptCount: 1,
  lastErrorCode: null,
  queuedAt: new Date('2026-01-01T10:00:00Z'),
  sentAt: new Date('2026-01-01T10:00:05Z'),
  deliveredAt: null,
  bouncedAt: null,
  ...overrides,
});

describe('ListEmailLogsUseCase', () => {
  let uc: ListEmailLogsUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    uc = new ListEmailLogsUseCase(mockDb as any);
  });

  it('limit + 1 kayıt dönünce hasMore true ve nextCursor set edilir', async () => {
    // Arrange — 51 kayıt döner (limit 50 + 1)
    const logs = Array.from({ length: 51 }, (_, i) =>
      makeLog({ id: `log-${i}`, queuedAt: new Date(Date.now() - i * 1000) }),
    );
    mockDb.emailLog.findMany.mockResolvedValue(logs);

    // Act
    const result = await uc.execute({ tenantId: 'tenant-1' });

    // Assert
    expect(result.items).toHaveLength(50);
    expect(result.nextCursor).toBeTruthy();
    expect(result.nextCursor?.id).toBe('log-49');
  });

  it('limit kayıt veya altında dönünce nextCursor null olur', async () => {
    // Arrange
    const logs = [makeLog()];
    mockDb.emailLog.findMany.mockResolvedValue(logs);

    // Act
    const result = await uc.execute({ tenantId: 'tenant-1' });

    // Assert
    expect(result.nextCursor).toBeNull();
  });

  it('queue filtresi prisma where\'e eklenir', async () => {
    // Arrange
    mockDb.emailLog.findMany.mockResolvedValue([]);

    // Act
    await uc.execute({ tenantId: 't1', filter: { queue: 'CRITICAL' } });

    // Assert
    expect(mockDb.emailLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ queue: 'CRITICAL' }),
      }),
    );
  });

  it('status filtresi prisma where\'e eklenir', async () => {
    // Arrange
    mockDb.emailLog.findMany.mockResolvedValue([]);

    // Act
    await uc.execute({ tenantId: 't1', filter: { status: 'BOUNCED' } });

    // Assert
    expect(mockDb.emailLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'BOUNCED' }),
      }),
    );
  });

  it('cursor varsa skip:1 ve cursor id prisma\'ya gönderilir', async () => {
    // Arrange
    mockDb.emailLog.findMany.mockResolvedValue([]);

    // Act
    await uc.execute({
      tenantId: 't1',
      cursor: { id: 'log-50', queuedAt: '2026-01-01T00:00:00Z' },
    });

    // Assert
    expect(mockDb.emailLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: { id: 'log-50' },
        skip: 1,
      }),
    );
  });

  it('limit max 100 ile sınırlandırılır', async () => {
    // Arrange
    mockDb.emailLog.findMany.mockResolvedValue([]);

    // Act
    await uc.execute({ tenantId: 't1', limit: 999 });

    // Assert
    expect(mockDb.emailLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 101 }), // 100 + 1
    );
  });
});
