import { LoginUseCase } from '../../src/application/use-cases/auth/LoginUseCase';

/**
 * Mock kurulumu:
 *  - prisma.adminSettings.findUnique → varsayılan twoFactorSystemEnabled: true
 *    (sistem 2FA açık; böylece bireysel 2FA testleri sade kalır)
 *  - prisma.user.findUnique → varsayılan twoFactorEnabled: false
 *    (2FA kapalı; normal login testleri bundan etkilenmez)
 */
/**
 * prisma.$queryRaw: adminSettings'ten twoFactorSystemEnabled okumak için kullanılır.
 * varsayılan → sistem 2FA açık (true); bireysel 2FA testleri bu mock ile sade kalır.
 *
 * prisma.user.findUnique: bireysel twoFactorEnabled kontrolü.
 * varsayılan → false (2FA kapalı); normal login testleri etkilenmez.
 */
jest.mock('../../src/infrastructure/database/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(async () => ({ twoFactorEnabled: false })),
    },
    $queryRaw: jest.fn(async () => [{ twoFactorSystemEnabled: true }]),
  },
}));

import { prisma } from '../../src/infrastructure/database/prisma';

// ── Test yardımcıları ────────────────────────────────────────────────────────

function makeUserRepo(user: any = null) {
  return { findByEmail: jest.fn(async () => user) };
}

function makePasswordService(valid = true) {
  return {
    compare: jest.fn(async () => valid),
    hash: jest.fn(async (p: string) => `hashed-${p}`),
  };
}

function makeJwtService() {
  return { sign: jest.fn(() => 'jwt-token') };
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

function makeUc(userOrNull: any = makeUser(), passwordValid = true) {
  return new LoginUseCase(
    makeUserRepo(userOrNull) as any,
    makePasswordService(passwordValid) as any,
    makeJwtService() as any,
  );
}

// ── Testler ──────────────────────────────────────────────────────────────────

describe('LoginUseCase', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── Temel başarılı akış ───────────────────────────────────────────────────

  it('geçerli e-posta ve şifre ile token ve user döner', async () => {
    const result = await makeUc().execute({ email: 'test@example.com', password: 'pass' }) as any;
    expect(result.token).toBe('jwt-token');
    expect(result.user.id).toBe('user-1');
    expect(result.user.email).toBe('test@example.com');
  });

  it('JWT sign sub, email, role içerir', async () => {
    const jwtService = makeJwtService();
    const uc = new LoginUseCase(makeUserRepo(makeUser({ role: 'EDUCATOR' })) as any, makePasswordService() as any, jwtService as any);
    await uc.execute({ email: 'test@example.com', password: 'pass' });
    expect(jwtService.sign).toHaveBeenCalledWith(expect.objectContaining({
      sub: 'user-1',
      email: 'test@example.com',
      role: 'EDUCATOR',
    }));
  });

  it('dönen user nesnesinde passwordHash bulunmaz', async () => {
    const result = await makeUc().execute({ email: 'test@example.com', password: 'pass' }) as any;
    expect(result.user?.passwordHash).toBeUndefined();
  });

  it('dönen user nesnesinde id, email, username, role, status, createdAt bulunur', async () => {
    const result = await makeUc().execute({ email: 'test@example.com', password: 'pass' }) as any;
    expect(result.user).toMatchObject({
      id: 'user-1',
      email: 'test@example.com',
      username: 'testuser',
      role: 'CANDIDATE',
      status: 'ACTIVE',
    });
    expect(result.user.createdAt).toBeInstanceOf(Date);
  });

  // ── Email normalizasyonu ──────────────────────────────────────────────────

  it('e-posta büyük/küçük harf ve çevreleyen boşluklar temizlenir', async () => {
    const userRepo = makeUserRepo(makeUser());
    const uc = new LoginUseCase(userRepo as any, makePasswordService() as any, makeJwtService() as any);
    await uc.execute({ email: '  Test@Example.COM  ', password: 'pass' });
    expect(userRepo.findByEmail).toHaveBeenCalledWith('test@example.com');
  });

  // ── Kimlik doğrulama hataları ─────────────────────────────────────────────

  it('kullanıcı bulunamazsa INVALID_CREDENTIALS fırlatır', async () => {
    const uc = makeUc(null);
    await expect(uc.execute({ email: 'yok@test.com', password: 'pass' }))
      .rejects.toThrow('INVALID_CREDENTIALS');
  });

  it('şifre yanlışsa INVALID_CREDENTIALS fırlatır', async () => {
    const uc = makeUc(makeUser(), false);
    await expect(uc.execute({ email: 'test@example.com', password: 'yanlis' }))
      .rejects.toThrow('INVALID_CREDENTIALS');
  });

  it('boş e-posta ile INVALID_CREDENTIALS fırlatır', async () => {
    await expect(makeUc().execute({ email: '', password: 'pass' }))
      .rejects.toThrow('INVALID_CREDENTIALS');
  });

  it('boş şifre ile INVALID_CREDENTIALS fırlatır', async () => {
    await expect(makeUc().execute({ email: 'a@b.com', password: '' }))
      .rejects.toThrow('INVALID_CREDENTIALS');
  });

  it('yalnızca boşluktan oluşan e-posta INVALID_CREDENTIALS fırlatır', async () => {
    await expect(makeUc().execute({ email: '   ', password: 'pass' }))
      .rejects.toThrow('INVALID_CREDENTIALS');
  });

  // ── Kullanıcı durumu (status) ─────────────────────────────────────────────

  it('SUSPENDED kullanıcı ACCOUNT_SUSPENDED hatası alır (şifre doğru olsa bile)', async () => {
    const uc = makeUc(makeUser({ status: 'SUSPENDED' }));
    await expect(uc.execute({ email: 'test@example.com', password: 'pass' }))
      .rejects.toThrow('ACCOUNT_SUSPENDED');
  });

  it('ACTIVE kullanıcı başarıyla giriş yapar', async () => {
    const result = await makeUc(makeUser({ status: 'ACTIVE' })).execute({ email: 'test@example.com', password: 'pass' }) as any;
    expect(result.token).toBeTruthy();
  });

  // ── 2FA — bireysel flag ───────────────────────────────────────────────────

  it('twoFactorEnabled=true ise pendingMfaToken döner, asıl token verilmez', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({ twoFactorEnabled: true });
    const result = await makeUc().execute({ email: 'test@example.com', password: 'pass' }) as any;
    expect(result.requiresMfa).toBe(true);
    expect(result.pendingMfaToken).toBeTruthy();
    expect(result.token).toBeUndefined();
  });

  it('twoFactorEnabled=false ise normal token döner', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({ twoFactorEnabled: false });
    const result = await makeUc().execute({ email: 'test@example.com', password: 'pass' }) as any;
    expect(result.token).toBe('jwt-token');
    expect(result.requiresMfa).toBeUndefined();
  });

  it('twoFactorEnabled=null ise 2FA gate atlanır, normal token döner', async () => {
    // DB'de satır null gelirse → 2FA kapalı sayılır
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({ twoFactorEnabled: null });
    const result = await makeUc().execute({ email: 'test@example.com', password: 'pass' }) as any;
    expect(result.token).toBe('jwt-token');
  });

  // ── 2FA — sistem geneli flag (twoFactorSystemEnabled) ────────────────────

  it('twoFactorSystemEnabled=false iken twoFactorEnabled=true olsa bile normal token döner', async () => {
    // Admin sistem 2FA'sını kapattığında bireysel ayar göz ardı edilir
    (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([{ twoFactorSystemEnabled: false }]);
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({ twoFactorEnabled: true });
    const result = await makeUc().execute({ email: 'test@example.com', password: 'pass' }) as any;
    expect(result.token).toBe('jwt-token');
    expect(result.requiresMfa).toBeUndefined();
  });

  it('adminSettings satırı boş dizi dönerse 2FA sistem geneli kapalı sayılır', async () => {
    // $queryRaw [] döndürürse → twoFactorSystemEnabled varsayılan false
    (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([]);
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({ twoFactorEnabled: true });
    const result = await makeUc().execute({ email: 'test@example.com', password: 'pass' }) as any;
    expect(result.token).toBe('jwt-token');
    expect(result.requiresMfa).toBeUndefined();
  });

  it('twoFactorSystemEnabled=true ve twoFactorEnabled=true ise 2FA akışı başlar', async () => {
    // Varsayılan mock $queryRaw→true, bu test açıkça onaylar
    (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([{ twoFactorSystemEnabled: true }]);
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({ twoFactorEnabled: true });
    const result = await makeUc().execute({ email: 'test@example.com', password: 'pass' }) as any;
    expect(result.requiresMfa).toBe(true);
    expect(result.pendingMfaToken).toBeTruthy();
  });
});
