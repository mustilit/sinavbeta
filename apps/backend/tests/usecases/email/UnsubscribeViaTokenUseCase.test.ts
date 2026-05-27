/**
 * UnsubscribeViaTokenUseCase testleri.
 * Token doğrulama, kategori kapatma, tüm tercih kapatma, audit log test edilir.
 */

process.env.EMAIL_SECRETS_KEY = 'a'.repeat(64);

const mockDb = {
  user: { findUnique: jest.fn(), update: jest.fn() },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
};

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: mockDb,
}));

import { UnsubscribeViaTokenUseCase } from '../../../src/application/use-cases/email/UnsubscribeViaTokenUseCase';
import { generateUnsubscribeToken } from '../../../src/application/services/email/utils/unsubscribeToken';

describe('UnsubscribeViaTokenUseCase', () => {
  let uc: UnsubscribeViaTokenUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    uc = new UnsubscribeViaTokenUseCase(mockDb as any);
  });

  it('geçersiz token formatında 400 fırlatır', async () => {
    // Arrange & Act & Assert
    await expect(uc.execute({ token: 'invalid-token', category: 'all' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('token DB\'de bulunamazsa 404 fırlatır', async () => {
    // Arrange
    const token = generateUnsubscribeToken();
    mockDb.user.findUnique.mockResolvedValue(null);

    // Act & Assert
    await expect(uc.execute({ token }))
      .rejects.toMatchObject({ status: 404 });
  });

  it('category="all" ile tüm tercihler false yapılır', async () => {
    // Arrange
    const token = generateUnsubscribeToken();
    mockDb.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      emailPreferences: {
        marketing: true,
        productUpdates: true,
        weeklyDigest: true,
        reviewNotifications: true,
        objectionUpdates: true,
        liveSessionInvites: true,
        refundUpdates: true,
      },
    });
    mockDb.user.update.mockResolvedValue({});

    // Act
    const result = await uc.execute({ token, category: 'all' });

    // Assert
    expect(result.preferences.marketing).toBe(false);
    expect(result.preferences.weeklyDigest).toBe(false);
    expect(result.preferences.reviewNotifications).toBe(false);
  });

  it('belirli kategori kapatılır, diğerleri etkilenmez', async () => {
    // Arrange
    const token = generateUnsubscribeToken();
    mockDb.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      emailPreferences: { marketing: true, reviewNotifications: true },
    });
    mockDb.user.update.mockResolvedValue({});

    // Act
    const result = await uc.execute({ token, category: 'marketing' });

    // Assert
    expect(result.preferences.marketing).toBe(false);
    expect(result.preferences.reviewNotifications).toBe(true);
  });

  it('geçersiz kategori adı 400 fırlatır', async () => {
    // Arrange
    const token = generateUnsubscribeToken();
    mockDb.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      emailPreferences: {},
    });

    // Act & Assert
    await expect(uc.execute({ token, category: 'invalidCategory' as any }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('başarılı unsubscribe sonrası AuditLog yazılır', async () => {
    // Arrange
    const token = generateUnsubscribeToken();
    mockDb.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      emailPreferences: {},
    });
    mockDb.user.update.mockResolvedValue({});

    // Act
    await uc.execute({ token, category: 'all' });

    // Assert
    expect(mockDb.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'EMAIL_UNSUBSCRIBE' }),
      }),
    );
  });
});
