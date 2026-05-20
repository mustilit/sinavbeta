// @ts-nocheck
import { ForgotPasswordUseCase } from '../../src/application/use-cases/auth/ForgotPasswordUseCase';
import { ResetPasswordUseCase } from '../../src/application/use-cases/auth/ResetPasswordUseCase';

// ─── ForgotPasswordUseCase ─────────────────────────────────────────────────

function makeForgotDeps(user: any = null) {
  return {
    userRepo: {
      findByEmail: jest.fn(async () => user),
      setPasswordResetToken: jest.fn(async () => {}),
    },
    emailProvider: {
      sendEmail: jest.fn(async () => {}),
    },
  };
}

describe('ForgotPasswordUseCase', () => {
  it('kullanıcı varsa token set edilir ve mail gönderilir', async () => {
    const deps = makeForgotDeps({ id: 'u1', email: 'a@b.com', username: 'ali' });
    const uc = new ForgotPasswordUseCase(deps.userRepo as any, deps.emailProvider as any);
    await uc.execute('a@b.com');
    expect(deps.userRepo.setPasswordResetToken).toHaveBeenCalledTimes(1);
    expect(deps.emailProvider.sendEmail).toHaveBeenCalledTimes(1);
  });

  it('kullanıcı yoksa sessizce döner (e-posta ifşa edilmez)', async () => {
    const deps = makeForgotDeps(null);
    const uc = new ForgotPasswordUseCase(deps.userRepo as any, deps.emailProvider as any);
    await expect(uc.execute('nobody@x.com')).resolves.toBeUndefined();
    expect(deps.emailProvider.sendEmail).not.toHaveBeenCalled();
  });

  it('e-posta normalize edilerek aranır', async () => {
    const deps = makeForgotDeps(null);
    const uc = new ForgotPasswordUseCase(deps.userRepo as any, deps.emailProvider as any);
    await uc.execute(' TEST@EXAMPLE.COM ');
    expect(deps.userRepo.findByEmail).toHaveBeenCalledWith('test@example.com');
  });
});

// ─── ResetPasswordUseCase ──────────────────────────────────────────────────

function makeResetDeps(user: any = null) {
  return {
    userRepo: {
      findByPasswordResetToken: jest.fn(async () => user),
      resetPassword: jest.fn(async () => {}),
    },
    pwService: {
      hash: jest.fn(async (p: string) => `hashed-${p}`),
    },
  };
}

const VALID_USER = {
  id: 'u1',
  passwordResetTokenExpiresAt: new Date(Date.now() + 3600_000), // 1 saat ileri
};

describe('ResetPasswordUseCase', () => {
  it('geçerli token ve şifre ile şifreyi günceller', async () => {
    const deps = makeResetDeps(VALID_USER);
    const uc = new ResetPasswordUseCase(deps.userRepo as any, deps.pwService as any);
    await uc.execute('valid-token', 'newpassword');
    expect(deps.userRepo.resetPassword).toHaveBeenCalledWith('u1', expect.stringContaining('hashed'));
  });

  it('token bulunamazsa INVALID_TOKEN fırlatır', async () => {
    const deps = makeResetDeps(null);
    const uc = new ResetPasswordUseCase(deps.userRepo as any, deps.pwService as any);
    await expect(uc.execute('bad-token', 'newpassword')).rejects.toMatchObject({ message: expect.stringContaining('Geçersiz') });
  });

  it('token süresi dolmuşsa TOKEN_EXPIRED fırlatır', async () => {
    const expiredUser = { id: 'u1', passwordResetTokenExpiresAt: new Date(Date.now() - 1000) };
    const deps = makeResetDeps(expiredUser);
    const uc = new ResetPasswordUseCase(deps.userRepo as any, deps.pwService as any);
    await expect(uc.execute('expired-token', 'newpassword')).rejects.toMatchObject({ message: expect.stringContaining('dolmuş') });
  });

  it('şifre 8 karakterden kısaysa INVALID_INPUT fırlatır', async () => {
    const deps = makeResetDeps(VALID_USER);
    const uc = new ResetPasswordUseCase(deps.userRepo as any, deps.pwService as any);
    await expect(uc.execute('tok', 'short')).rejects.toMatchObject({ message: expect.stringContaining('8') });
  });

  it('token veya şifre boşsa INVALID_INPUT fırlatır', async () => {
    const deps = makeResetDeps(VALID_USER);
    const uc = new ResetPasswordUseCase(deps.userRepo as any, deps.pwService as any);
    await expect(uc.execute('', 'newpassword')).rejects.toBeDefined();
  });
});
