/**
 * AuthController unit testleri.
 * Tüm bağımlı use case ve servisler mock'lanır.
 * DI bağımlılık ağacını bypass ederek sadece HTTP ↔ UseCase köprüsü test edilir.
 */

jest.mock('../../src/nest/common/rate-limit', () => ({
  delKey: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/infrastructure/database/prisma', () => ({
  prisma: {
    workerPermission: { findUnique: jest.fn().mockResolvedValue(null) },
    user: { findUnique: jest.fn() },
    // me() rejection + profil detaylarını raw SQL ile çeker.
    $queryRaw: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('../../src/infrastructure/audit/AuditLogger', () => ({
  auditContextFromRequest: jest.fn().mockReturnValue({ ip: '127.0.0.1', userAgent: 'test' }),
}));

import { HttpException } from '@nestjs/common';
import { AuthController } from '../../src/nest/controllers/auth.controller';

// Yardımcı: controller bağımlılıklarını mock olarak döndür
function buildController(overrides: Partial<any> = {}) {
  const registerUC = overrides.registerUseCase ?? { execute: jest.fn().mockResolvedValue({ id: 'u-1' }) };
  const registerEducatorUC = overrides.registerEducatorUseCase ?? { execute: jest.fn() };
  const loginUC = overrides.loginUseCase ?? { execute: jest.fn().mockResolvedValue({ token: 'jwt', user: {} }) };
  const userRepo = overrides.userRepo ?? {
    findById: jest.fn().mockResolvedValue({
      id: 'u-1', email: 'e@x.com', username: 'u', role: 'CANDIDATE',
      status: 'ACTIVE', createdAt: new Date(),
    }),
  };
  const forgotPwdUC = overrides.forgotPasswordUC ?? { execute: jest.fn().mockResolvedValue(undefined) };
  const resetPwdUC = overrides.resetPasswordUC ?? { execute: jest.fn().mockResolvedValue(undefined) };
  const changePwdUC = overrides.changePasswordUC ?? { execute: jest.fn().mockResolvedValue(undefined) };
  const googleAuthUC = overrides.googleAuthUC ?? { execute: jest.fn() };
  const verifyDeviceUC = overrides.verifyDeviceUC ?? { execute: jest.fn().mockResolvedValue({ ok: true }) };

  // Controller constructor sırası: register, registerEducator, login, userRepo,
  // forgotPassword, resetPassword, changePassword, googleAuth, verifyDevice
  return new AuthController(
    registerUC as any,
    registerEducatorUC as any,
    loginUC as any,
    userRepo as any,
    forgotPwdUC as any,
    resetPwdUC as any,
    changePwdUC as any,
    googleAuthUC as any,
    verifyDeviceUC as any,
  );
}

describe('AuthController', () => {
  // --- checkAvailability (kayıt wizard step-1) ---
  describe('checkAvailability', () => {
    it('doğrulanmış kullanıcı varsa email + username "alınmış" döner', async () => {
      const userRepo = {
        findById: jest.fn(),
        findByEmail: jest.fn().mockResolvedValue({ id: 'u-1' }),
        findByUsername: jest.fn().mockResolvedValue({ id: 'u-1' }),
      };
      const controller = buildController({ userRepo });
      const res = await controller.checkAvailability('taken@x.com', 'takenuser');
      expect(res).toEqual({ emailAvailable: false, usernameAvailable: false });
    });

    it('users tablosunda yoksa MÜSAİT döner — bekleyen/doğrulanmamış kayıt ENGELLEMEZ', async () => {
      // Regresyon: doğrulama maili ulaşmayan kullanıcı pending kayıt yüzünden
      // bir daha kayıt olamıyordu ("Bu e-posta adresi zaten kayıtlı" kilidi, 2026-06-07).
      // RegisterUseCase pending'i zaten siler+yeniden gönderir; availability yalnız
      // users'a bakmalı.
      const userRepo = {
        findById: jest.fn(),
        findByEmail: jest.fn().mockResolvedValue(null),
        findByUsername: jest.fn().mockResolvedValue(null),
      };
      const controller = buildController({ userRepo });
      const res = await controller.checkAvailability('pending@x.com', 'pendinguser');
      expect(res).toEqual({ emailAvailable: true, usernameAvailable: true });
      expect(userRepo.findByEmail).toHaveBeenCalledWith('pending@x.com');
    });
  });

  // --- login ---

  describe('login', () => {
    it('geçerli credentials ile token döner', async () => {
      // Arrange
      const loginUC = { execute: jest.fn().mockResolvedValue({ token: 'jwt-abc', user: {} }) };
      const controller = buildController({ loginUseCase: loginUC });
      const req = { user: {}, ip: '127.0.0.1', headers: {} };

      // Act
      const result = await controller.login({ email: 'test@example.com', password: 'pass123' }, req as any);

      // Assert
      expect((result as any).token).toBe('jwt-abc');
      expect(loginUC.execute).toHaveBeenCalled();
    });

    it('email yoksa 400 hata fırlatır', async () => {
      const controller = buildController();
      const req = { user: {}, ip: '127.0.0.1', headers: {} };
      await expect(controller.login({ email: '', password: 'pass' }, req as any)).rejects.toThrow(HttpException);
    });

    it('şifre yoksa 400 hata fırlatır', async () => {
      const controller = buildController();
      const req = { user: {}, ip: '127.0.0.1', headers: {} };
      await expect(controller.login({ email: 'x@x.com', password: '' }, req as any)).rejects.toThrow(HttpException);
    });

    it('INVALID_CREDENTIALS hatası 401\'e çevrilir', async () => {
      const loginUC = { execute: jest.fn().mockRejectedValue(new Error('INVALID_CREDENTIALS')) };
      const controller = buildController({ loginUseCase: loginUC });
      const req = { user: {}, ip: '127.0.0.1', headers: {} };
      try {
        await controller.login({ email: 'x@x.com', password: 'wrong' }, req as any);
        fail('should throw');
      } catch (err: any) {
        expect(err).toBeInstanceOf(HttpException);
        expect(err.getStatus()).toBe(401);
      }
    });
  });

  // --- forgotPassword ---

  describe('forgotPassword', () => {
    it('geçerli email ile always-success mesaj döner', async () => {
      const controller = buildController();
      const result = await controller.forgotPassword({ email: 'user@example.com' });
      expect((result as any).message).toBe('E-posta gönderildi');
    });

    it('email boşsa 400 hata fırlatır', async () => {
      const controller = buildController();
      await expect(controller.forgotPassword({ email: '' })).rejects.toThrow(HttpException);
    });
  });

  // --- resetPassword ---

  describe('resetPassword', () => {
    it('geçerli token ile şifre güncellenir', async () => {
      const controller = buildController();
      const result = await controller.resetPassword({ token: 'valid-token', newPassword: 'newPass123' });
      expect((result as any).message).toBeDefined();
    });

    it('use case hata fırlattığında HttpException\'a çevrilir', async () => {
      const resetPwdUC = { execute: jest.fn().mockRejectedValue(Object.assign(new Error('INVALID_TOKEN'), { status: 400 })) };
      const controller = buildController({ resetPasswordUC: resetPwdUC });
      await expect(controller.resetPassword({ token: 'bad', newPassword: 'pass' })).rejects.toThrow(HttpException);
    });
  });

  // --- me ---

  describe('me', () => {
    it('token doğruysa kullanıcı bilgilerini döner', async () => {
      const controller = buildController();
      const req = { user: { sub: 'u-1' } };
      const result = await controller.me(req as any);
      expect((result as any).user.id).toBe('u-1');
    });

    it('token yoksa 401 fırlatır', async () => {
      const controller = buildController();
      const req = { user: {} };
      await expect(controller.me(req as any)).rejects.toThrow(HttpException);
    });

    it('kullanıcı bulunamazsa 404 fırlatır', async () => {
      const userRepo = { findById: jest.fn().mockResolvedValue(null) };
      const controller = buildController({ userRepo });
      const req = { user: { sub: 'u-1' } };
      await expect(controller.me(req as any)).rejects.toThrow(HttpException);
    });
  });

  // --- verifyDevice ---

  describe('verifyDevice', () => {
    it('token ile cihazı doğrular', async () => {
      const controller = buildController();
      const result = await controller.verifyDevice({ token: 'device-token' });
      expect((result as any).ok).toBe(true);
    });
  });
});
