// @ts-nocheck
import { LoginUseCase } from '../../src/application/use-cases/auth/LoginUseCase';

// prisma modülünü mock'la (2FA twoFactorEnabled kontrolü için)
jest.mock('../../src/infrastructure/database/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn(async () => ({ twoFactorEnabled: false })) },
  },
}));

import { prisma } from '../../src/infrastructure/database/prisma';

function makeUserRepo(user: any = null) {
  return {
    findByEmail: jest.fn(async () => user),
  };
}

function makePasswordService(valid = true) {
  return {
    compare: jest.fn(async () => valid),
    hash: jest.fn(async (p: string) => `hashed-${p}`),
  };
}

function makeJwtService() {
  return {
    sign: jest.fn(() => 'jwt-token'),
  };
}

function makeUser(overrides: any = {}) {
  return {
    id: 'user-1',
    email: 'test@example.com',
    username: 'testuser',
    passwordHash: 'hash',
    role: 'CANDIDATE',
    status: 'ACTIVE',
    createdAt: new Date(),
    ...overrides,
  };
}

describe('LoginUseCase', () => {
  beforeEach(() => jest.clearAllMocks());

  it('geçerli e-posta ve şifre ile JWT token döner', async () => {
    const user = makeUser();
    const uc = new LoginUseCase(
      makeUserRepo(user) as any,
      makePasswordService(true) as any,
      makeJwtService() as any,
    );
    const result = await uc.execute({ email: 'test@example.com', password: 'pass' }) as any;
    expect(result.token).toBe('jwt-token');
    expect(result.user.id).toBe('user-1');
  });

  it('e-posta büyük/küçük harf ve boşluk normalize edilir', async () => {
    const userRepo = makeUserRepo(makeUser());
    const uc = new LoginUseCase(userRepo as any, makePasswordService() as any, makeJwtService() as any);
    await uc.execute({ email: '  Test@Example.COM  ', password: 'pass' });
    expect(userRepo.findByEmail).toHaveBeenCalledWith('test@example.com');
  });

  it('kullanıcı bulunamazsa INVALID_CREDENTIALS fırlatır', async () => {
    const uc = new LoginUseCase(makeUserRepo(null) as any, makePasswordService() as any, makeJwtService() as any);
    await expect(uc.execute({ email: 'x@x.com', password: 'p' })).rejects.toThrow('INVALID_CREDENTIALS');
  });

  it('şifre yanlışsa INVALID_CREDENTIALS fırlatır', async () => {
    const uc = new LoginUseCase(makeUserRepo(makeUser()) as any, makePasswordService(false) as any, makeJwtService() as any);
    await expect(uc.execute({ email: 'test@example.com', password: 'wrong' })).rejects.toThrow('INVALID_CREDENTIALS');
  });

  it('boş e-posta veya şifre ile INVALID_CREDENTIALS fırlatır', async () => {
    const uc = new LoginUseCase(makeUserRepo() as any, makePasswordService() as any, makeJwtService() as any);
    await expect(uc.execute({ email: '', password: 'pass' })).rejects.toThrow('INVALID_CREDENTIALS');
    await expect(uc.execute({ email: 'a@b.com', password: '' })).rejects.toThrow('INVALID_CREDENTIALS');
  });

  it('2FA aktifse pendingMfaToken döner, tam token vermez', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({ twoFactorEnabled: true });
    const uc = new LoginUseCase(makeUserRepo(makeUser()) as any, makePasswordService(true) as any, makeJwtService() as any);
    const result = await uc.execute({ email: 'test@example.com', password: 'pass' }) as any;
    expect(result.requiresMfa).toBe(true);
    expect(result.pendingMfaToken).toBeTruthy();
    expect(result.token).toBeUndefined();
  });

  it('dönen user nesnesinde passwordHash içermez', async () => {
    const uc = new LoginUseCase(makeUserRepo(makeUser()) as any, makePasswordService() as any, makeJwtService() as any);
    const result = await uc.execute({ email: 'test@example.com', password: 'pass' }) as any;
    expect(result.user?.passwordHash).toBeUndefined();
  });
});
