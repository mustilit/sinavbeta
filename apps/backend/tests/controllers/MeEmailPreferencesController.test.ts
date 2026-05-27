/**
 * MeEmailPreferencesController unit testleri.
 * UpdateUserEmailPreferencesUseCase mock'lanır.
 */
import { HttpException } from '@nestjs/common';
import { MeEmailPreferencesController } from '../../src/nest/controllers/me.email-preferences.controller';
import { UpdateUserEmailPreferencesUseCase } from '../../src/application/use-cases/email/UpdateUserEmailPreferencesUseCase';

const makePrefs = () => ({
  marketing: false,
  productUpdates: true,
  weeklyDigest: true,
  reviewNotifications: true,
  objectionUpdates: true,
  liveSessionInvites: true,
  refundUpdates: true,
});

describe('MeEmailPreferencesController', () => {
  let controller: MeEmailPreferencesController;
  let mockUC: jest.Mocked<UpdateUserEmailPreferencesUseCase>;

  beforeEach(() => {
    mockUC = {
      get: jest.fn().mockResolvedValue(makePrefs()),
      update: jest.fn().mockResolvedValue(makePrefs()),
    } as any;
    controller = new MeEmailPreferencesController(mockUC);
  });

  // --- get ---

  describe('get', () => {
    it('userId alınıp tercihleri döner', async () => {
      // Arrange
      const req = { user: { sub: 'user-1' } };

      // Act
      const result = await controller.get(req as any);

      // Assert
      expect(result).toEqual(makePrefs());
      expect(mockUC.get).toHaveBeenCalledWith('user-1');
    });

    it('user token yoksa 401 hatası fırlatır', async () => {
      const req = { user: {} };
      await expect(controller.get(req as any)).rejects.toThrow(HttpException);
    });
  });

  // --- update ---

  describe('update', () => {
    it('değişiklikleri use case\'e iletir', async () => {
      // Arrange
      const req = { user: { sub: 'user-1' } };
      const body = { marketing: true, weeklyDigest: false } as any;

      // Act
      await controller.update(body, req as any);

      // Assert
      expect(mockUC.update).toHaveBeenCalledWith({
        userId: 'user-1',
        changes: body,
      });
    });

    it('CRITICAL tercih alanı güncellenmeden iletilir (use case kontrol eder)', async () => {
      // Bu testin amacı: controller CRITICAL alanları engellemez, use case katmanına delege eder.
      const req = { user: { sub: 'user-1' } };
      const body = { marketing: false } as any;
      await controller.update(body, req as any);
      expect(mockUC.update).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1' }),
      );
    });

    it('user token yoksa 401 hatası fırlatır', async () => {
      const req = { user: {} };
      await expect(controller.update({} as any, req as any)).rejects.toThrow(HttpException);
    });
  });
});
