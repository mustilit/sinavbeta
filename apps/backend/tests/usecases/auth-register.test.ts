import { RegisterUseCase } from '../../src/application/use-cases/auth/RegisterUseCase';

function makeUserRepo(savedUser: any = null, existingEmail: any = null, existingUsername: any = null) {
  return {
    save: jest.fn(async (u: any) => savedUser ?? { ...u, id: u.id || 'new-id' }),
    findByEmail: jest.fn(async (_email: string) => existingEmail),
    findByUsername: jest.fn(async (_username: string) => existingUsername),
  };
}

function makePasswordService() {
  return {
    hash: jest.fn(async (p: string) => `hashed-${p}`),
  };
}

describe('RegisterUseCase', () => {
  it('yeni CANDIDATE kullanıcı oluşturur, public bilgi döner (fallback path: pendingRepo yok)', async () => {
    const uc = new RegisterUseCase(makeUserRepo() as any, makePasswordService() as any);
    const result = await uc.execute({ email: 'New@Test.COM', username: 'newuser', password: 'Securepass1' });
    expect((result as any).email).toBe('new@test.com'); // normalize
    expect((result as any).role).toBe('CANDIDATE');
    expect((result as any).status).toBe('ACTIVE');
    expect((result as any).passwordHash).toBeUndefined();
  });

  it('passwordHash plain metin şifresini içermez', async () => {
    const uc = new RegisterUseCase(makeUserRepo() as any, makePasswordService() as any);
    const result = await uc.execute({ email: 'a@b.com', username: 'u', password: 'Securepass1' });
    expect((result as any).passwordHash).toBeUndefined();
  });

  it('e-posta küçük harfe çevrilir', async () => {
    const repo = makeUserRepo();
    const uc = new RegisterUseCase(repo as any, makePasswordService() as any);
    await uc.execute({ email: 'UPPER@CASE.COM', username: 'u', password: 'Securepass1' });
    const savedUser = repo.save.mock.calls[0][0];
    expect(savedUser.email).toBe('upper@case.com');
  });

  it('şifre hash\'lenerek kaydedilir', async () => {
    const pwSvc = makePasswordService();
    const uc = new RegisterUseCase(makeUserRepo() as any, pwSvc as any);
    await uc.execute({ email: 'x@x.com', username: 'u', password: 'Securepass1' });
    expect(pwSvc.hash).toHaveBeenCalledWith('Securepass1');
  });

  it('sunucu tarafında UUID üretilir', async () => {
    const repo = makeUserRepo();
    const uc = new RegisterUseCase(repo as any, makePasswordService() as any);
    await uc.execute({ email: 'x@x.com', username: 'u', password: 'Securepass1' });
    const savedUser = repo.save.mock.calls[0][0];
    expect(savedUser.id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('createdAt alanı döner', async () => {
    const uc = new RegisterUseCase(makeUserRepo() as any, makePasswordService() as any);
    const result = await uc.execute({ email: 'x@x.com', username: 'u', password: 'Securepass1' });
    expect((result as any).createdAt).toBeInstanceOf(Date);
  });

  // ---------------------------------------------------------------------------
  // Sprint 14 — Sözleşme onayı zorunluluğu
  // ---------------------------------------------------------------------------
  describe('Sprint 14: contract enforcement', () => {
    function makeContractRepo(opts: {
      candidateId?: string | null;
      privacyId?: string | null;
    } = {}) {
      const { candidateId = 'ctr-candidate-1', privacyId = 'ctr-privacy-1' } = opts;
      return {
        getActiveByType: jest.fn(async (type: string) => {
          if (type === 'CANDIDATE' && candidateId) return { id: candidateId, isActive: true, type };
          if (type === 'PRIVACY' && privacyId) return { id: privacyId, isActive: true, type };
          return null;
        }),
        getById: jest.fn(),
      };
    }

    function makeAcceptanceRepo() {
      return {
        create: jest.fn(async (data: any) => ({ id: 'acc-' + Math.random(), ...data, acceptedAt: new Date() })),
        findByUserAndContract: jest.fn(async () => null),
      };
    }

    function makeAuditRepo() {
      return { create: jest.fn(async () => undefined) };
    }

    it('contract repo DI verilmediğinde acceptance kontrolü atlanır (backward compat)', async () => {
      const uc = new RegisterUseCase(makeUserRepo() as any, makePasswordService() as any);
      const result = await uc.execute({ email: 'x@x.com', username: 'u', password: 'Securepass1' });
      expect((result as any).email).toBe('x@x.com');
    });

    it('DI varsa acceptedTermsContractId verilmezse TERMS_NOT_ACCEPTED atar', async () => {
      const uc = new RegisterUseCase(
        makeUserRepo() as any,
        makePasswordService() as any,
        makeContractRepo() as any,
        makeAcceptanceRepo() as any,
        makeAuditRepo() as any,
      );
      await expect(
        uc.execute({ email: 'x@x.com', username: 'u', password: 'p12345' }),
      ).rejects.toMatchObject({ code: 'TERMS_NOT_ACCEPTED' });
    });

    it('contractId aktif ID ile eşleşmezse TERMS_NOT_ACCEPTED atar', async () => {
      const uc = new RegisterUseCase(
        makeUserRepo() as any,
        makePasswordService() as any,
        makeContractRepo() as any,
        makeAcceptanceRepo() as any,
        makeAuditRepo() as any,
      );
      await expect(
        uc.execute({
          email: 'x@x.com',
          username: 'u',
          password: 'p12345',
          acceptedTermsContractId: 'stale-id', // eski versiyon
          acceptedPrivacyContractId: 'ctr-privacy-1',
        }),
      ).rejects.toMatchObject({ code: 'TERMS_NOT_ACCEPTED' });
    });

    it('doğru contract ID\'ler verilirse user oluşur + 2 acceptance kaydı atılır', async () => {
      const acceptanceRepo = makeAcceptanceRepo();
      const auditRepo = makeAuditRepo();
      const userRepo = makeUserRepo();
      const uc = new RegisterUseCase(
        userRepo as any,
        makePasswordService() as any,
        makeContractRepo() as any,
        acceptanceRepo as any,
        auditRepo as any,
        // pendingRepo verilmez → fallback path: User.save çağrılır
      );
      const result = await uc.execute(
        {
          email: 'aday@test.com',
          username: 'aday',
          password: 'Securepass1',
          acceptedTermsContractId: 'ctr-candidate-1',
          acceptedPrivacyContractId: 'ctr-privacy-1',
        },
        { ip: '1.2.3.4', userAgent: 'Mozilla/5.0' },
      );
      expect((result as any).email).toBe('aday@test.com');
      expect(acceptanceRepo.create).toHaveBeenCalledTimes(2);
      expect(acceptanceRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          contractId: 'ctr-candidate-1',
          ip: '1.2.3.4',
          userAgent: 'Mozilla/5.0',
        }),
      );
      expect(acceptanceRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ contractId: 'ctr-privacy-1' }),
      );
      expect(auditRepo.create).toHaveBeenCalledTimes(2);
    });

    it('aktif sözleşme yoksa (admin yayımlamamış) CONTRACTS_NOT_AVAILABLE 503 atar', async () => {
      const uc = new RegisterUseCase(
        makeUserRepo() as any,
        makePasswordService() as any,
        makeContractRepo({ candidateId: null }) as any, // CANDIDATE contract yok
        makeAcceptanceRepo() as any,
        makeAuditRepo() as any,
      );
      await expect(
        uc.execute({
          email: 'x@x.com',
          username: 'u',
          password: 'p12345',
          acceptedTermsContractId: 'whatever',
          acceptedPrivacyContractId: 'whatever',
        }),
      ).rejects.toMatchObject({ code: 'CONTRACTS_NOT_AVAILABLE' });
    });
  });

  // ---------------------------------------------------------------------------
  // Pending-first akış (pendingRepo verilince)
  // ---------------------------------------------------------------------------
  describe('Pending-first kayıt akışı', () => {
    function makePendingRepo() {
      const store: any[] = [];
      return {
        create: jest.fn(async (input: any) => {
          const record = { id: 'pending-' + Math.random(), ...input, createdAt: new Date() };
          store.push(record);
          return record;
        }),
        findByEmail: jest.fn(async (email: string) => store.find((r) => r.email === email) ?? null),
        findByUsername: jest.fn(async (u: string) => store.find((r) => r.username === u) ?? null),
        deleteByEmail: jest.fn(async () => { /* noop */ }),
        deleteByUsername: jest.fn(async () => { /* noop */ }),
        deleteById: jest.fn(async () => { /* noop */ }),
        deleteExpired: jest.fn(async () => 0),
      };
    }

    it('pendingRepo verilince User.save çağrılmaz, PendingRegistration.create çağrılır', async () => {
      const userRepo = makeUserRepo();
      const pendingRepo = makePendingRepo();
      const uc = new RegisterUseCase(
        userRepo as any,
        makePasswordService() as any,
        undefined,
        undefined,
        undefined,
        pendingRepo as any,
      );
      const result = await uc.execute({ email: 'test@new.com', username: 'testnew', password: 'Securepass1' });
      expect(result.message).toBe('Doğrulama maili gönderildi');
      expect(result.email).toBe('test@new.com');
      expect(userRepo.save).not.toHaveBeenCalled();
      expect(pendingRepo.create).toHaveBeenCalledTimes(1);
      expect(pendingRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'test@new.com', username: 'testnew', role: 'CANDIDATE' }),
      );
    });

    it('User tablosunda email varsa EMAIL_ALREADY_REGISTERED atar', async () => {
      const existingUser = { id: 'u1', email: 'taken@x.com' };
      const userRepo = makeUserRepo(null, existingUser);
      const pendingRepo = makePendingRepo();
      const uc = new RegisterUseCase(
        userRepo as any,
        makePasswordService() as any,
        undefined,
        undefined,
        undefined,
        pendingRepo as any,
      );
      await expect(
        uc.execute({ email: 'taken@x.com', username: 'newuser', password: 'pw' }),
      ).rejects.toMatchObject({ code: 'EMAIL_ALREADY_REGISTERED' });
    });

    it('User tablosunda username varsa USERNAME_ALREADY_TAKEN atar', async () => {
      const existingUser = { id: 'u1', username: 'taken' };
      const userRepo = makeUserRepo(null, null, existingUser);
      const pendingRepo = makePendingRepo();
      const uc = new RegisterUseCase(
        userRepo as any,
        makePasswordService() as any,
        undefined,
        undefined,
        undefined,
        pendingRepo as any,
      );
      await expect(
        uc.execute({ email: 'new@x.com', username: 'taken', password: 'pw' }),
      ).rejects.toMatchObject({ code: 'USERNAME_ALREADY_TAKEN' });
    });

    it('aynı email ile yeniden kayıt: eski pending silinir, yeni pending oluşur', async () => {
      const userRepo = makeUserRepo();
      const pendingRepo = makePendingRepo();
      const uc = new RegisterUseCase(
        userRepo as any,
        makePasswordService() as any,
        undefined,
        undefined,
        undefined,
        pendingRepo as any,
      );
      await uc.execute({ email: 'retry@x.com', username: 'retryuser', password: 'Securepass1' });
      // İkinci deneme — aynı email/username (re-issue)
      await uc.execute({ email: 'retry@x.com', username: 'retryuser', password: 'Securepass2' });
      expect(pendingRepo.deleteByEmail).toHaveBeenCalledTimes(2);
      expect(pendingRepo.create).toHaveBeenCalledTimes(2);
    });
  });
});
