import { ChangePasswordUseCase } from '../../src/application/use-cases/auth/ChangePasswordUseCase';

// ─── ChangePasswordUseCase ─────────────────────────────────────────────────
// Oturum içi şifre değiştirme: mevcut şifre doğrulanır, yeni şifre hash'lenip
// yazılır. Prisma'ya bağlı DEĞİL — userRepo + passwordService DI ile mock'lanır.

function makeDeps(opts: { user?: any; passwordValid?: boolean } = {}) {
  const { user = null, passwordValid = true } = opts;
  return {
    userRepo: {
      findById: jest.fn(async () => user),
      resetPassword: jest.fn(async () => {}),
    },
    pwService: {
      compare: jest.fn(async () => passwordValid),
      hash: jest.fn(async (p: string) => `hashed-${p}`),
    },
  };
}

const USER = {
  id: 'u1',
  email: 'admin@example.com',
  username: 'admin',
  passwordHash: 'old-hash',
  role: 'ADMIN',
};

describe('ChangePasswordUseCase', () => {
  it('mevcut şifre doğru + yeni geçerli → yeni hash ile resetPassword çağrılır', async () => {
    const deps = makeDeps({ user: { ...USER }, passwordValid: true });
    const uc = new ChangePasswordUseCase(deps.userRepo as any, deps.pwService as any);

    await uc.execute('u1', 'currentPass1', 'newSecret123');

    expect(deps.pwService.compare).toHaveBeenCalledWith('currentPass1', 'old-hash');
    expect(deps.pwService.hash).toHaveBeenCalledWith('newSecret123');
    expect(deps.userRepo.resetPassword).toHaveBeenCalledWith('u1', 'hashed-newSecret123');
  });

  it('mevcut şifre yanlış → INVALID_CURRENT_PASSWORD ve resetPassword çağrılmaz', async () => {
    const deps = makeDeps({ user: { ...USER }, passwordValid: false });
    const uc = new ChangePasswordUseCase(deps.userRepo as any, deps.pwService as any);

    await expect(uc.execute('u1', 'wrongPass', 'newSecret123')).rejects.toMatchObject({
      code: 'INVALID_CURRENT_PASSWORD',
      status: 400,
    });
    expect(deps.userRepo.resetPassword).not.toHaveBeenCalled();
    expect(deps.pwService.hash).not.toHaveBeenCalled();
  });

  it('yeni şifre 8 karakterden kısa → PASSWORD_TOO_SHORT (DB hiç sorgulanmaz)', async () => {
    const deps = makeDeps({ user: { ...USER } });
    const uc = new ChangePasswordUseCase(deps.userRepo as any, deps.pwService as any);

    await expect(uc.execute('u1', 'currentPass1', 'short')).rejects.toMatchObject({
      code: 'PASSWORD_TOO_SHORT',
      status: 400,
    });
    expect(deps.userRepo.findById).not.toHaveBeenCalled();
    expect(deps.pwService.compare).not.toHaveBeenCalled();
  });

  it('yeni şifre mevcut ile aynı → SAME_PASSWORD', async () => {
    const deps = makeDeps({ user: { ...USER }, passwordValid: true });
    const uc = new ChangePasswordUseCase(deps.userRepo as any, deps.pwService as any);

    await expect(uc.execute('u1', 'samePass123', 'samePass123')).rejects.toMatchObject({
      code: 'SAME_PASSWORD',
      status: 400,
    });
    expect(deps.userRepo.resetPassword).not.toHaveBeenCalled();
  });

  it('kullanıcı bulunamazsa → USER_NOT_FOUND (404)', async () => {
    const deps = makeDeps({ user: null });
    const uc = new ChangePasswordUseCase(deps.userRepo as any, deps.pwService as any);

    await expect(uc.execute('u1', 'currentPass1', 'newSecret123')).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
      status: 404,
    });
  });

  it('mevcut şifre boş → INVALID_INPUT', async () => {
    const deps = makeDeps({ user: { ...USER } });
    const uc = new ChangePasswordUseCase(deps.userRepo as any, deps.pwService as any);

    await expect(uc.execute('u1', '', 'newSecret123')).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      status: 400,
    });
  });

  it('userId yoksa → UNAUTHORIZED (401)', async () => {
    const deps = makeDeps({ user: { ...USER } });
    const uc = new ChangePasswordUseCase(deps.userRepo as any, deps.pwService as any);

    await expect(uc.execute('', 'currentPass1', 'newSecret123')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      status: 401,
    });
  });
});
