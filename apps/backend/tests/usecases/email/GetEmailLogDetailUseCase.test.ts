/**
 * GetEmailLogDetailUseCase testleri.
 * Log bulunamazsa 404, bulununca tüm ilişkilerle döner.
 */

const mockDb = {
  emailLog: { findFirst: jest.fn() },
};

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: mockDb,
}));

import { GetEmailLogDetailUseCase } from '../../../src/application/use-cases/email/GetEmailLogDetailUseCase';

const makeFullLog = () => ({
  id: 'log-1',
  tenantId: 'tenant-1',
  recipientEmail: 'user@example.com',
  templateKey: 'purchase-receipt',
  queue: 'CRITICAL',
  status: 'DELIVERED',
  subject: 'Satın Alma Onayı',
  htmlBody: '<p>Teşekkürler</p>',
  textBody: 'Teşekkürler',
  recipient: { id: 'user-1', username: 'testuser', email: 'user@example.com', role: 'CANDIDATE' },
  providerConfig: { id: 'prov-1', name: 'Brevo', kind: 'BREVO_API', fromEmail: 'no-reply@example.com' },
  events: [
    { id: 'ev-1', eventType: 'QUEUED', occurredAt: new Date('2026-01-01T10:00:00Z') },
    { id: 'ev-2', eventType: 'SENT', occurredAt: new Date('2026-01-01T10:00:05Z') },
    { id: 'ev-3', eventType: 'DELIVERED', occurredAt: new Date('2026-01-01T10:00:30Z') },
  ],
});

describe('GetEmailLogDetailUseCase', () => {
  let uc: GetEmailLogDetailUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    uc = new GetEmailLogDetailUseCase(mockDb as any);
  });

  it('log bulunamazsa 404 fırlatır', async () => {
    // Arrange
    mockDb.emailLog.findFirst.mockResolvedValue(null);

    // Act & Assert
    await expect(uc.execute({ tenantId: 'tenant-1', id: 'nonexistent' }))
      .rejects.toMatchObject({ status: 404 });
  });

  it('log bulununca recipient, providerConfig ve events ile döner', async () => {
    // Arrange
    const fullLog = makeFullLog();
    mockDb.emailLog.findFirst.mockResolvedValue(fullLog);

    // Act
    const result = await uc.execute({ tenantId: 'tenant-1', id: 'log-1' });

    // Assert
    expect(result.id).toBe('log-1');
    expect(result.recipient?.username).toBe('testuser');
    expect(result.providerConfig?.kind).toBe('BREVO_API');
    expect(result.events).toHaveLength(3);
  });

  it('tenantId ile id birlikte where\'e geçirilir', async () => {
    // Arrange
    mockDb.emailLog.findFirst.mockResolvedValue(makeFullLog());

    // Act
    await uc.execute({ tenantId: 'tenant-1', id: 'log-1' });

    // Assert
    expect(mockDb.emailLog.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'log-1', tenantId: 'tenant-1' },
      }),
    );
  });

  it('events zaman sırasıyla sıralanmış gelir', async () => {
    // Arrange
    const log = makeFullLog();
    mockDb.emailLog.findFirst.mockResolvedValue(log);

    // Act
    const result = await uc.execute({ tenantId: 'tenant-1', id: 'log-1' });

    // Assert
    expect(mockDb.emailLog.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          events: expect.objectContaining({ orderBy: { occurredAt: 'asc' } }),
        }),
      }),
    );
  });
});
