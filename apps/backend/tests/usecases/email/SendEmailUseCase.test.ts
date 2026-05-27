/**
 * SendEmailUseCase testleri.
 * EmailService.send'i çağırır — service davranışları EmailService testlerinde detaylandırılır.
 */

jest.mock('../../../src/infrastructure/database/prisma', () => ({ prisma: {} }));

import { SendEmailUseCase } from '../../../src/application/use-cases/email/SendEmailUseCase';

describe('SendEmailUseCase', () => {
  let mockService: any;
  let uc: SendEmailUseCase;

  const baseInput = {
    tenantId: 'tenant-1',
    templateKey: 'purchase-receipt',
    to: { userId: 'user-1', email: 'buyer@example.com', role: 'CANDIDATE' as const },
    data: { orderId: 'ord-1' },
  };

  beforeEach(() => {
    mockService = { send: jest.fn() };
    uc = new SendEmailUseCase(mockService as any);
  });

  it('geçerli input ile EmailService.send çağrılır', async () => {
    // Arrange
    const fakeLog = { id: 'log-1', status: 'QUEUED' };
    mockService.send.mockResolvedValue(fakeLog);

    // Act
    const result = await uc.execute(baseInput);

    // Assert
    expect(mockService.send).toHaveBeenCalledWith(baseInput);
    expect(result.id).toBe('log-1');
  });

  it('service hata fırlatırsa use case hata aynen iletir', async () => {
    // Arrange
    mockService.send.mockRejectedValue(new Error('Service down'));

    // Act & Assert
    await expect(uc.execute(baseInput)).rejects.toThrow('Service down');
  });

  it('forceQueue parametresi service\'e aktarılır', async () => {
    // Arrange
    const inputWithQueue = { ...baseInput, forceQueue: 'CRITICAL' as const };
    mockService.send.mockResolvedValue({ id: 'log-2', status: 'QUEUED' });

    // Act
    await uc.execute(inputWithQueue);

    // Assert
    expect(mockService.send).toHaveBeenCalledWith(
      expect.objectContaining({ forceQueue: 'CRITICAL' }),
    );
  });

  it('bypassPreferences=true ile service çağrılır', async () => {
    // Arrange
    const inputBypass = { ...baseInput, bypassPreferences: true };
    mockService.send.mockResolvedValue({ id: 'log-3', status: 'QUEUED' });

    // Act
    await uc.execute(inputBypass);

    // Assert
    expect(mockService.send).toHaveBeenCalledWith(
      expect.objectContaining({ bypassPreferences: true }),
    );
  });
});
