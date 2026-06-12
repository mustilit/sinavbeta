/**
 * LoginUseCase unit testleri (B9 sonrası).
 *
 * Kapsam:
 * - Girdi normalize (trim/lowercase) + missing credentials
 * - INVALID_CREDENTIALS (user yok / şifre yanlış)
 * - ACCOUNT_SUSPENDED
 * - REJECTED kullanıcının login akışı sorunsuz tamamlanır — sessionId raw SQL
 *   ($executeRaw) ile yazılır (B9 fix; prisma.user.update enum'a takılıyordu).
 * - 2FA sistem geneli + kullanıcı bireysel açıkken pendingMfaToken döner.
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  },
}));

jest.mock('../../../src/infrastructure/cache/RedisCache', () => ({
  RedisCache: class {
    async del() { /* noop */ }
  },
}));

import { LoginUseCase } from '../../../src/application/use-cases/auth/LoginUseCase';
import { prisma } from '../../../src/infrastructure/database/prisma';

const mockPrisma = prisma as any;

const makeUser = (overrides: any = {}) => ({
  id: 'user-1',
  email: 'test@example.com',
  username: 'tester',
  passwordHash: 'hash',
  role: 'EDUCATOR',
  status: 'ACTIVE',
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const buildDeps = (overrides: any = {}) => {
  const userRepository: any = {
    findByEmail: jest.fn().mockResolvedValue(makeUser()),
  };
  const passwordService: any = {
    compare: jest.fn().mockResolvedValue(true),
  };
  const jwtService: any = {
    sign: jest.fn().mockReturnValue('signed.jwt.token'),
  };
  const audit: any = { logAsync: jest.fn() };
  return { userRepository, passwordService, jwtService, audit, ...overrides };
};

describe('LoginUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: 2FA sistem geneli kapalı
    mockPrisma.$queryRaw.mockResolvedValue([{ twoFactorSystemEnabled: false }]);
    mockPrisma.$executeRaw.mockResolvedValue(1);
  });

  describe('girdi doğrulama', () => {
    it('boş email → INVALID_CREDENTIALS', async () => {
      const deps = buildDeps();
      const uc = new LoginUseCase(deps.userRepository, deps.passwordService, deps.jwtService, deps.audit);
      await expect(uc.execute({ email: '', password: 'x' })).rejects.toThrow('INVALID_CREDENTIALS');
      expect(deps.userRepository.findByEmail).not.toHaveBeenCalled();
    });

    it('boş şifre → INVALID_CREDENTIALS', async () => {
      const deps = buildDeps();
      const uc = new LoginUseCase(deps.userRepository, deps.passwordService, deps.jwtService, deps.audit);
      await expect(uc.execute({ email: 'a@b.com', password: '' })).rejects.toThrow('INVALID_CREDENTIALS');
    });

    it('email lowercase + trim normalize edilir', async () => {
      const deps = buildDeps();
      const uc = new LoginUseCase(deps.userRepository, deps.passwordService, deps.jwtService, deps.audit);
      await uc.execute({ email: '  UPPER@Example.COM ', password: 'pw' });
      expect(deps.userRepository.findByEmail).toHaveBeenCalledWith('upper@example.com');
    });
  });

  describe('kimlik hatası', () => {
    it('kullanıcı bulunamazsa INVALID_CREDENTIALS', async () => {
      const deps = buildDeps({
        userRepository: { findByEmail: jest.fn().mockResolvedValue(null) },
      });
      const uc = new LoginUseCase(deps.userRepository, deps.passwordService, deps.jwtService, deps.audit);
      await expect(uc.execute({ email: 'no@user.com', password: 'pw' })).rejects.toThrow('INVALID_CREDENTIALS');
    });

    it('şifre yanlışsa INVALID_CREDENTIALS', async () => {
      const deps = buildDeps({
        passwordService: { compare: jest.fn().mockResolvedValue(false) },
      });
      const uc = new LoginUseCase(deps.userRepository, deps.passwordService, deps.jwtService, deps.audit);
      await expect(uc.execute({ email: 'a@b.com', password: 'wrong' })).rejects.toThrow('INVALID_CREDENTIALS');
      // sessionId update yapılmaz
      expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
    });
  });

  describe('hesap durumu', () => {
    it('SUSPENDED hesap → ACCOUNT_SUSPENDED', async () => {
      const deps = buildDeps({
        userRepository: { findByEmail: jest.fn().mockResolvedValue(makeUser({ status: 'SUSPENDED' })) },
      });
      const uc = new LoginUseCase(deps.userRepository, deps.passwordService, deps.jwtService, deps.audit);
      await expect(uc.execute({ email: 'a@b.com', password: 'pw' })).rejects.toThrow('ACCOUNT_SUSPENDED');
      expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('REJECTED kullanıcı login akışını sorunsuz tamamlar (B9 — enum bypass)', async () => {
      // Frontend REJECTED'ı EducatorSettings'e kilitler ama login API'si geçer.
      const deps = buildDeps({
        userRepository: { findByEmail: jest.fn().mockResolvedValue(makeUser({ status: 'REJECTED' })) },
      });
      const uc = new LoginUseCase(deps.userRepository, deps.passwordService, deps.jwtService, deps.audit);
      const result = await uc.execute({ email: 'rej@user.com', password: 'pw' });
      expect((result as any).requiresMfa).toBeUndefined();
      expect((result as any).token).toBe('signed.jwt.token');
      // sessionId raw SQL ile yazılmalı — Prisma client REJECTED'ı görmediği için
      // prisma.user.update bu satırda patlardı; $executeRaw güvenli yol.
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    });
  });

  describe('başarılı giriş', () => {
    it('token + sessionId üretir, raw SQL UPDATE çalıştırır', async () => {
      const deps = buildDeps();
      const uc = new LoginUseCase(deps.userRepository, deps.passwordService, deps.jwtService, deps.audit);
      const result = await uc.execute({ email: 'a@b.com', password: 'pw' });
      expect((result as any).token).toBe('signed.jwt.token');
      // JWT payload'da sub + email + role + sid var
      expect(deps.jwtService.sign).toHaveBeenCalledWith(expect.objectContaining({
        sub: 'user-1',
        email: 'test@example.com',
        role: 'EDUCATOR',
        sid: expect.any(String),
      }));
      // $executeRaw ile activeSessionId güncellendi
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('user objesi response içinde dönmeli', async () => {
      const deps = buildDeps();
      const uc = new LoginUseCase(deps.userRepository, deps.passwordService, deps.jwtService, deps.audit);
      const result = await uc.execute({ email: 'a@b.com', password: 'pw' });
      expect((result as any).user?.id).toBe('user-1');
      expect((result as any).user?.email).toBe('test@example.com');
    });
  });

  describe('cihaz kapısı (notifyDevice)', () => {
    const makeNotifyDevice = (requiresVerification: boolean) => ({
      execute: jest.fn().mockResolvedValue({ requiresVerification }),
    });

    it('ADMIN + notifyDevice requiresVerification:true → DEVICE_VERIFICATION_REQUIRED, token verilmez', async () => {
      const deps = buildDeps({
        userRepository: { findByEmail: jest.fn().mockResolvedValue(makeUser({ role: 'ADMIN' })) },
      });
      const notifyDevice = makeNotifyDevice(true);
      const uc = new LoginUseCase(
        deps.userRepository, deps.passwordService, deps.jwtService, deps.audit, notifyDevice as any,
      );
      await expect(uc.execute({ email: 'admin@b.com', password: 'pw' })).rejects.toThrow('DEVICE_VERIFICATION_REQUIRED');
      expect(deps.jwtService.sign).not.toHaveBeenCalled();
    });

    it('CANDIDATE + notifyDevice requiresVerification:true → giriş engellenmez, token döner', async () => {
      const deps = buildDeps({
        userRepository: { findByEmail: jest.fn().mockResolvedValue(makeUser({ role: 'CANDIDATE' })) },
      });
      const notifyDevice = makeNotifyDevice(true);
      const uc = new LoginUseCase(
        deps.userRepository, deps.passwordService, deps.jwtService, deps.audit, notifyDevice as any,
      );
      const result = await uc.execute({ email: 'cand@b.com', password: 'pw' });
      expect((result as any).token).toBe('signed.jwt.token');
    });

    it('ADMIN + notifyDevice requiresVerification:false → normal giriş', async () => {
      const deps = buildDeps({
        userRepository: { findByEmail: jest.fn().mockResolvedValue(makeUser({ role: 'ADMIN' })) },
      });
      const notifyDevice = makeNotifyDevice(false);
      const uc = new LoginUseCase(
        deps.userRepository, deps.passwordService, deps.jwtService, deps.audit, notifyDevice as any,
      );
      const result = await uc.execute({ email: 'admin@b.com', password: 'pw' });
      expect((result as any).token).toBe('signed.jwt.token');
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    });
  });

  describe('2FA gate', () => {
    it('sistem 2FA açık + user 2FA açık → pendingMfaToken döner (sessionId YAZILMAZ)', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ twoFactorSystemEnabled: true }]);
      mockPrisma.user.findUnique.mockResolvedValue({ twoFactorEnabled: true });

      const deps = buildDeps();
      const uc = new LoginUseCase(deps.userRepository, deps.passwordService, deps.jwtService, deps.audit);
      const result = await uc.execute({ email: 'a@b.com', password: 'pw' });
      expect((result as any).requiresMfa).toBe(true);
      expect((result as any).pendingMfaToken).toBeDefined();
      // 2FA tamamlanmadan sessionId yazılmaz
      expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('sistem 2FA açık ama user 2FA kapalı → normal akış', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ twoFactorSystemEnabled: true }]);
      mockPrisma.user.findUnique.mockResolvedValue({ twoFactorEnabled: false });

      const deps = buildDeps();
      const uc = new LoginUseCase(deps.userRepository, deps.passwordService, deps.jwtService, deps.audit);
      const result = await uc.execute({ email: 'a@b.com', password: 'pw' });
      expect((result as any).token).toBeDefined();
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    });
  });
});
