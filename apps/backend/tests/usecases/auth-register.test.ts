import { RegisterUseCase } from '../../src/application/use-cases/auth/RegisterUseCase';

function makeUserRepo(savedUser: any = null) {
  return {
    save: jest.fn(async (u: any) => savedUser ?? { ...u, id: u.id || 'new-id' }),
  };
}

function makePasswordService() {
  return {
    hash: jest.fn(async (p: string) => `hashed-${p}`),
  };
}

describe('RegisterUseCase', () => {
  it('yeni CANDIDATE kullanıcı oluşturur, public bilgi döner', async () => {
    const uc = new RegisterUseCase(makeUserRepo() as any, makePasswordService() as any);
    const result = await uc.execute({ email: 'New@Test.COM', username: 'newuser', password: 'securepass' });
    expect(result.email).toBe('new@test.com'); // normalize
    expect(result.role).toBe('CANDIDATE');
    expect(result.status).toBe('ACTIVE');
    expect((result as any).passwordHash).toBeUndefined();
  });

  it('passwordHash plain metin şifresini içermez', async () => {
    const uc = new RegisterUseCase(makeUserRepo() as any, makePasswordService() as any);
    const result = await uc.execute({ email: 'a@b.com', username: 'u', password: 'mypass' });
    expect((result as any).passwordHash).toBeUndefined();
  });

  it('e-posta küçük harfe çevrilir', async () => {
    const repo = makeUserRepo();
    const uc = new RegisterUseCase(repo as any, makePasswordService() as any);
    await uc.execute({ email: 'UPPER@CASE.COM', username: 'u', password: 'pass12345' });
    const savedUser = repo.save.mock.calls[0][0];
    expect(savedUser.email).toBe('upper@case.com');
  });

  it('şifre hash\'lenerek kaydedilir', async () => {
    const pwSvc = makePasswordService();
    const uc = new RegisterUseCase(makeUserRepo() as any, pwSvc as any);
    await uc.execute({ email: 'x@x.com', username: 'u', password: 'mypassword' });
    expect(pwSvc.hash).toHaveBeenCalledWith('mypassword');
  });

  it('sunucu tarafında UUID üretilir', async () => {
    const repo = makeUserRepo();
    const uc = new RegisterUseCase(repo as any, makePasswordService() as any);
    await uc.execute({ email: 'x@x.com', username: 'u', password: 'pass' });
    const savedUser = repo.save.mock.calls[0][0];
    expect(savedUser.id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('createdAt alanı döner', async () => {
    const uc = new RegisterUseCase(makeUserRepo() as any, makePasswordService() as any);
    const result = await uc.execute({ email: 'x@x.com', username: 'u', password: 'pass' });
    expect(result.createdAt).toBeInstanceOf(Date);
  });
});
