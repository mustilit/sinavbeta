/**
 * HandleEmailWebhookUseCase testleri.
 * Processor.handleBrevo delegasyonu ve secret doğrulaması test edilir.
 */

jest.mock('../../../src/infrastructure/database/prisma', () => ({ prisma: {} }));

import { HandleEmailWebhookUseCase } from '../../../src/application/use-cases/email/HandleEmailWebhookUseCase';

describe('HandleEmailWebhookUseCase', () => {
  let mockProcessor: any;
  let uc: HandleEmailWebhookUseCase;

  beforeEach(() => {
    mockProcessor = { handleBrevo: jest.fn() };
    uc = new HandleEmailWebhookUseCase(mockProcessor as any);
  });

  it('geçerli payload ile processor.handleBrevo çağrılır', async () => {
    // Arrange
    const payload = { event: 'delivered', email: 'user@example.com', 'message-id': 'msg-1' };
    mockProcessor.handleBrevo.mockResolvedValue({ processed: 1 });

    // Act
    const result = await uc.execute({
      tenantId: 'tenant-1',
      secret: 'valid-secret',
      payload,
    });

    // Assert
    expect(mockProcessor.handleBrevo).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      secret: 'valid-secret',
      payload,
    });
    expect(result.processed).toBe(1);
  });

  it('geçersiz secret olduğunda processor 401 hata fırlatır ve use case iletir', async () => {
    // Arrange
    mockProcessor.handleBrevo.mockRejectedValue(
      Object.assign(new Error('Invalid webhook secret'), { status: 401 }),
    );

    // Act & Assert
    await expect(
      uc.execute({
        tenantId: 'tenant-1',
        secret: 'wrong-secret',
        payload: { event: 'delivered', email: 'x@y.com' },
      }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('dizi payload kabul edilir', async () => {
    // Arrange
    const events = [
      { event: 'delivered', email: 'a@b.com', 'message-id': 'm1' },
      { event: 'hard_bounce', email: 'c@d.com', 'message-id': 'm2' },
    ];
    mockProcessor.handleBrevo.mockResolvedValue({ processed: 2 });

    // Act
    const result = await uc.execute({ tenantId: 't1', secret: 'sec', payload: events });

    // Assert
    expect(result.processed).toBe(2);
  });

  it('bilinmeyen event tipi (null) işlendiğinde processor kaç döner', async () => {
    // Arrange
    mockProcessor.handleBrevo.mockResolvedValue({ processed: 0 });

    // Act
    const result = await uc.execute({
      tenantId: 't1',
      secret: 'sec',
      payload: { event: 'unknown_event', email: 'x@y.com' },
    });

    // Assert
    expect(result.processed).toBe(0);
  });
});
